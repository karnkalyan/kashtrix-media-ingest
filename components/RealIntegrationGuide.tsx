import React from 'react';
import Modal from './ui/Modal';
import Accordion from './ui/Accordion';
import { TerminalIcon, ServerIcon } from './icons';

interface RealIntegrationGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const CodeBlock: React.FC<{ children: React.ReactNode; lang?: string }> = ({ children, lang = 'javascript' }) => (
    <div className="bg-slate-50 rounded-md border border-slate-200 my-2 shadow-sm">
        <div className="text-xs text-slate-500 font-sans px-4 py-1 border-b border-slate-200">{lang}</div>
        <pre className="p-4 text-xs font-mono text-slate-800 bg-white rounded-b-md overflow-x-auto">
            <code>{children}</code>
        </pre>
    </div>
);

const RealIntegrationGuide: React.FC<RealIntegrationGuideProps> = ({ isOpen, onClose }) => {
  const serverCode = `
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let runningProcesses = {}; // Store running ffmpeg processes { channelId: process }

// WebSocket connection handler
wss.on('connection', ws => {
  console.log('Client connected to WebSocket');
  ws.on('close', () => console.log('Client disconnected'));
});

// Function to broadcast stats to all connected clients
const broadcastStats = (channelId, stats) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'stats', channelId, payload: stats }));
    }
  });
};

// Regex to parse ffmpeg's stderr output for stats
const ffmpegRegex = /time=(\\S+)\\sbitrate=(\\S+)\\sspeed=(\\S+)x/;

// API Endpoint to start a transcoding channel
app.post('/api/channels/start', (req, res) => {
  const { channelId, command } = req.body;
  if (!channelId || !command) {
    return res.status(400).json({ error: 'channelId and command are required' });
  }

  if (runningProcesses[channelId]) {
    return res.status(409).json({ error: 'Channel is already running' });
  }

  console.log(\`Starting FFMPEG for channel \${channelId}: \`, command);
  
  // ROBUSTNESS FIX: Use shell: true to correctly handle commands with quoted arguments or spaces.
  // This is simpler for a guide than complex parsing, but be aware of security implications in production.
  const ffmpegProcess = spawn(command, [], { shell: true });
  runningProcesses[channelId] = ffmpegProcess;
  
  let uptime = 0;
  const interval = setInterval(() => {
    uptime++;
  }, 1000);

  ffmpegProcess.stderr.on('data', data => {
    const log = data.toString();
    const match = log.match(ffmpegRegex);

    if (match) {
        const stats = {
          uptime,
          time: match[1],
          bitrate: parseFloat(match[2]),
          speed: parseFloat(match[3]),
          log: log.trim(),
        };
        broadcastStats(channelId, stats);
    } else {
        // Broadcast non-stats logs too
        broadcastStats(channelId, { uptime, log: log.trim() });
    }
  });

  ffmpegProcess.on('close', code => {
    console.log(\`FFMPEG process for channel \${channelId} exited with code \${code}\`);
    clearInterval(interval);
    delete runningProcesses[channelId];
    // Notify clients that the stream has stopped
    broadcastStats(channelId, { status: 'stopped', log: \`Process exited with code \${code}\` });
  });

  res.status(202).json({ message: 'Channel started successfully' });
});

// API Endpoint to stop a transcoding channel
app.post('/api/channels/stop', (req, res) => {
    const { channelId } = req.body;
    const process = runningProcesses[channelId];
    if (process) {
        console.log(\`Stopping FFMPEG for channel \${channelId}\`);
        process.kill('SIGKILL'); // Force kill
        delete runningProcesses[channelId];
        res.status(200).json({ message: 'Channel stopped' });
    } else {
        res.status(404).json({ error: 'Channel not found or not running' });
    }
});


const PORT = 3001;
server.listen(PORT, () => {
  console.log(\`Backend server running on http://localhost:\${PORT}\`);
});
  `;

  const frontendCode = `
import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
// ... other imports

// NEW: Add a WebSocket reference
const socketRef = useRef<WebSocket | null>(null);

// ... inside useEngine hook ...

// NEW: WebSocket connection management
useEffect(() => {
  // Connect to the WebSocket server
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socketRef.current = new WebSocket(\`\${wsProtocol}//\${window.location.host}/ws\`);

  socketRef.current.onopen = () => console.log('WebSocket connected');
  socketRef.current.onclose = () => console.log('WebSocket disconnected');
  
  // Listen for messages from the server
  socketRef.current.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'stats') {
      const { channelId, payload } = message;

      // Dispatch an action to update the specific channel's stats
      dispatch({ 
        type: 'UPDATE_CHANNEL_STATS', 
        payload: { 
          id: channelId, 
          uptime: payload.uptime, 
          speed: payload.speed || 0, // Speed might not always be present
          log: payload.log 
        } 
      });
      
      if (payload.status === 'stopped') {
          dispatch({ type: 'STOP_CHANNEL', payload: { id: channelId } });
      }
    }
  };

  // Cleanup on unmount
  return () => {
    socketRef.current?.close();
  };
}, []); // Empty dependency array ensures this runs only once


// MODIFIED: startChannel function
const startChannel = useCallback(async (id: string) => {
  const channel = state.channels.find(c => c.id === id);
  if (channel) {
    try {
      // The backend now receives the full command string and handles it
      await fetch('/api/channels/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.id, command: channel.command }),
      });
      dispatch({ type: 'START_CHANNEL', payload: { id } });
    } catch (error) {
      console.error('Failed to start channel:', error);
      // Optionally dispatch an error state to the channel
    }
  }
}, [state.channels]);

// MODIFIED: stopChannel function
const stopChannel = useCallback(async (id: string) => {
  try {
    await fetch('/api/channels/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: id }),
    });
    dispatch({ type: 'STOP_CHANNEL', payload: { id } });
  } catch (error) {
    console.error('Failed to stop channel:', error);
  }
}, []);

// REMOVE the simulateTranscoding function and its related refs and intervals.
// The backend now handles the live updates.

// ... rest of the hook
`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Go Live: Real FFMPEG Integration Guide">
        <div className="space-y-4 text-slate-700 text-sm max-h-[80vh] overflow-y-auto pr-2">
            <p>
                This application is a powerful frontend simulator. To perform real transcoding, you must connect it to a backend server that can execute the <code>ffmpeg</code> command. This guide provides a complete, runnable solution.
            </p>
            
            <Accordion title="1. Prerequisites" icon={<TerminalIcon className="h-5 w-5 mr-2" />} defaultOpen>
              <div className="p-4 space-y-2">
                 <p>Make sure you have the following installed on your system:</p>
                 <ul className="list-disc list-inside space-y-1 pl-2 font-mono">
                    <li>Node.js and npm</li>
                    <li>FFMPEG (accessible from your command line)</li>
                 </ul>
                 <div className="text-amber-900 text-xs mt-2 p-3 bg-amber-100 rounded-md border border-amber-200">
                    <p className="font-bold mb-1">Hardware Acceleration Note</p>
                    <p>
                        To use hardware codecs (NVIDIA NVENC, AMD AMF, Apple VideoToolbox), your FFMPEG build must be compiled with support for them, and you must have the appropriate hardware drivers installed.
                    </p>
                 </div>
              </div>
            </Accordion>
            
            <Accordion title="2. Backend Server Setup" icon={<ServerIcon className="h-5 w-5 mr-2" />}>
                <div className="p-4 space-y-4">
                    <div>
                        <p className="font-semibold text-slate-950">Step 2.1: Create a Project</p>
                        <p>Create a new folder for your backend (e.g., <code>kasvhi-backend</code>), navigate into it, and run:</p>
                        <CodeBlock lang="bash">{`npm init -y`}</CodeBlock>
                    </div>
                    <div>
                        <p className="font-semibold text-slate-950">Step 2.2: Install Dependencies</p>
                        <p>Install Express for the API, ws for WebSockets, and cors for cross-origin requests.</p>
                        <CodeBlock lang="bash">{`npm install express ws cors`}</CodeBlock>
                    </div>
                    <div>
                        <p className="font-semibold text-slate-950">Step 2.3: Create server.js</p>
                        <p>Create a file named <code>server.js</code> and paste the code below. This version is more robust and correctly handles complex FFMPEG commands.</p>
                        <CodeBlock>{serverCode}</CodeBlock>
                    </div>
                     <div>
                        <p className="font-semibold text-slate-950">Step 2.4: Run the Server</p>
                        <p>Start your backend server from its directory:</p>
                        <CodeBlock lang="bash">{`node server.js`}</CodeBlock>
                        <p>You should see the message: <code className="text-xs font-mono bg-slate-100 text-slate-900 p-1 rounded">Backend server running on http://localhost:3001</code></p>
                    </div>
                </div>
            </Accordion>

            <Accordion title="3. Frontend Integration" icon={<div className="h-5 w-5 mr-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg></div>}>
                 <div className="p-4 space-y-4">
                    <div>
                        <p>Modify <code>hooks/useTranscoder.ts</code> to communicate with your new backend. This code replaces the client-side simulation with real API calls and a WebSocket listener for live stats.</p>
                        <CodeBlock>{frontendCode}</CodeBlock>
                         <p className="text-amber-900 text-xs mt-2 p-2 bg-amber-100 rounded-md border border-amber-200">
                            <strong>Important:</strong> After applying these changes, you must delete the old <code>simulateTranscoding</code> function and the <code>intervalsRef</code> from <code>hooks/useTranscoder.ts</code> to avoid conflicts.
                        </p>
                    </div>
                    <div>
                        <p className="font-semibold text-slate-950">Step 3.2: You're Live!</p>
                        <p>With the backend server running and the frontend code updated, the application is now a real control panel for FFMPEG processes on your machine.</p>
                    </div>
                 </div>
            </Accordion>

             <div className="text-center pt-4">
                <button onClick={onClose} className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-300/30 transition hover:from-sky-500 hover:to-cyan-400">
                    Got it!
                </button>
            </div>
        </div>
    </Modal>
  );
};

export default RealIntegrationGuide;