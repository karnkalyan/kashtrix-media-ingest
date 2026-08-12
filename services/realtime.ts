export type RealtimeMessage = {
  type: string;
  payload?: any;
  channelId?: string;
};

type MessageListener = (message: RealtimeMessage) => void;
type StatusListener = (connected: boolean) => void;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let heartbeatTimer: number | undefined;
let reconnectAttempt = 0;
let connected = false;
const pendingMessages: string[] = [];

const publishStatus = (next: boolean) => {
  if (connected === next) return;
  connected = next;
  statusListeners.forEach(listener => listener(next));
};

const scheduleReconnect = () => {
  if (reconnectTimer || messageListeners.size === 0) return;
  const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt++));
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delay);
};

const connect = () => {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING || messageListeners.size === 0) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('kte-auth-token') || '';
  const current = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = current;

  current.onopen = () => {
    if (socket !== current) return;
    reconnectAttempt = 0;
    publishStatus(true);
    while (pendingMessages.length && current.readyState === WebSocket.OPEN) current.send(pendingMessages.shift()!);
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'ping' }));
    }, 20000);
  };
  current.onmessage = event => {
    try {
      const message = JSON.parse(event.data) as RealtimeMessage;
      if (message.type !== 'pong') messageListeners.forEach(listener => listener(message));
    } catch (error) {
      console.error('Invalid realtime message', error);
    }
  };
  current.onerror = () => current.close();
  current.onclose = () => {
    if (socket !== current) return;
    socket = null;
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    publishStatus(false);
    scheduleReconnect();
  };
};

export const sendRealtime = (message: RealtimeMessage) => {
  const serialized = JSON.stringify(message);
  if (socket?.readyState === WebSocket.OPEN) socket.send(serialized);
  else {
    pendingMessages.push(serialized);
    connect();
  }
};

export const subscribeRealtime = (listener: MessageListener, statusListener?: StatusListener) => {
  messageListeners.add(listener);
  if (statusListener) {
    statusListeners.add(statusListener);
    statusListener(connected);
  }
  connect();

  return () => {
    messageListeners.delete(listener);
    if (statusListener) statusListeners.delete(statusListener);
  };
};
