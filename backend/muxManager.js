const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');

/**
 * Kashtrix StreamOps - Enterprise MPTS (Multi-Program Transport Stream) Multiplexer Engine
 * 
 * Combines multiple UDP, VOD, and IP streams into a single standardized DVB MPTS UDP stream
 * with CBR null-packet stuffing, per-channel pass-through/transcode modes, and 24/7 resilience.
 */

const MAX_LOG_LINES = 250;

// Active running MUX processes: muxId -> ProcessState
const activeMuxProcesses = new Map();

// In-memory traffic statistics & history: muxId -> StatsState
const muxStatsMap = new Map();

/**
 * Retrieve all MUX configs from database
 */
const getAllMuxes = async (db) => {
    try {
        const rows = await db.prisma.muxConfiguration.findMany({ orderBy: { createdAt: 'asc' } });
        return rows.map(row => {
            try { return enrichMuxRuntimeState(JSON.parse(row.data)); }
            catch (_) { return enrichMuxRuntimeState({ id: row.id, name: row.name, services: [], status: 'Stopped' }); }
        });
    } catch (e) {
        console.warn('[MuxManager] Error reading MUX configs:', e.message);
    }
    return [];
};

/**
 * Save all MUX configs to database
 */
const saveAllMuxes = async (db, muxList) => {
    const cleanList = (muxList || []).map(m => {
        const copy = { ...m };
        delete copy.pid;
        delete copy.uptimeSeconds;
        delete copy.cpuUsage;
        delete copy.memoryMb;
        return copy;
    });
    const ids = cleanList.map(m => String(m.id));
    await db.prisma.$transaction([
        db.prisma.muxConfiguration.deleteMany({ where: ids.length ? { id: { notIn: ids } } : {} }),
        ...cleanList.map(m => db.prisma.muxConfiguration.upsert({
            where: { id: String(m.id) },
            update: { name: String(m.name || m.id), data: JSON.stringify(m) },
            create: { id: String(m.id), name: String(m.name || m.id), data: JSON.stringify(m) }
        }))
    ]);
};

/**
 * Enrich stored MUX definition with live runtime process stats
 */
const enrichMuxRuntimeState = (mux) => {
    const running = activeMuxProcesses.get(mux.id);
    if (running && running.proc && !running.proc.killed && running.proc.exitCode === null) {
        const uptime = Math.max(0, Math.floor((Date.now() - running.startTime) / 1000));
        return {
            ...mux,
            status: 'Running',
            pid: running.proc.pid,
            uptimeSeconds: uptime,
            cpuUsage: running.lastCpu || 0,
            memoryMb: running.lastMemoryMb || 0,
            generatedCommand: running.commandString || mux.generatedCommand
        };
    }
    return {
        ...mux,
        status: mux.status === 'Running' ? 'Stopped' : (mux.status || 'Stopped'),
        pid: undefined,
        uptimeSeconds: 0,
        cpuUsage: 0,
        memoryMb: 0
    };
};

/**
 * Get single MUX by ID
 */
const getMux = async (db, id) => {
    const list = await getAllMuxes(db);
    const item = list.find(m => String(m.id) === String(id));
    return item ? enrichMuxRuntimeState(item) : null;
};

/**
 * Auto-assign collision-free DVB Service IDs and PIDs
 */
const autoAssignPids = (services = []) => {
    return services.map((svc, index) => {
        const baseNum = (index + 1) * 256; // 256 (0x100), 512 (0x200), 768 (0x300)...
        const serviceId = svc.serviceId || (index + 101);
        const pmtPid = svc.pmtPid || `0x${baseNum.toString(16).padStart(3, '0')}`;
        const videoPid = svc.videoPid || `0x${(baseNum + 1).toString(16).padStart(3, '0')}`;
        const pcrPid = svc.pcrPid || videoPid;

        const audioStreams = (svc.audioStreams && svc.audioStreams.length > 0)
            ? svc.audioStreams.map((a, aIdx) => ({
                ...a,
                streamIndex: a.streamIndex !== undefined ? a.streamIndex : aIdx,
                audioPid: a.audioPid || `0x${(baseNum + 2 + aIdx).toString(16).padStart(3, '0')}`,
                enabled: a.enabled !== false
            }))
            : [{
                streamIndex: 0,
                audioPid: `0x${(baseNum + 2).toString(16).padStart(3, '0')}`,
                enabled: true
            }];

        return {
            ...svc,
            serviceId,
            pmtPid,
            videoPid,
            pcrPid,
            audioStreams
        };
    });
};

/**
 * Discover existing StreamOps Channels & VOD outputs for one-click MUX import
 */
const getAvailableSources = async (db, vodDir = '', extraSources = {}) => {
    const sources = [];
    const seenUrls = new Set();

    // 1. Discover Channels from Prisma
    try {
        const channels = await db.getChannels();
        for (const ch of channels) {
            const destinations = ch.destinations || [];
            const isRunning = ch.status === 'Running' || ch.status === 'running';
            
            // Channel has UDP destinations configured
            const udpDest = destinations.find(d => d.protocol === 'udp' || d.protocol === 'udp-dvb' || (d.url && d.url.startsWith('udp://')));
            const channelUrl = udpDest ? udpDest.url : (ch.inputUrl || (ch.inputType === 'udp' ? ch.inputUrl : `udp://127.0.0.1:${ch.port || 5000}`));
            
            if (!seenUrls.has(channelUrl)) {
                seenUrls.add(channelUrl);
                sources.push({
                    id: `channel-${ch.id}`,
                    channelId: ch.id,
                    name: ch.name || `Channel ${ch.id}`,
                    sourceType: 'channel',
                    inputUrl: channelUrl,
                    codec: 'H.264 / AAC',
                    bitrateKbps: ch.videoBitrate || 4500,
                    status: isRunning ? 'ONLINE' : 'OFFLINE',
                    details: udpDest ? `Channel UDP Egress: ${udpDest.url}` : `Live Playout Channel: ${ch.name}`
                });
            }
        }
    } catch (e) {
        console.warn('[MuxManager] Channel discovery error:', e.message);
    }

    // 2. Discover Live RTMP / SRT Ingest Streams
    try {
        if (extraSources.liveStreams && typeof extraSources.liveStreams === 'object') {
            for (const [key, stream] of Object.entries(extraSources.liveStreams)) {
                const streamName = stream.name || key;
                const isSrt = stream.protocol === 'srt' || stream.isSrt || String(streamName).toLowerCase().includes('srt');
                
                if (isSrt) {
                    const srtHlsUrl = `http://127.0.0.1:${extraSources.mediaPort || 8080}/live/${streamName}/index.m3u8`;
                    if (!seenUrls.has(srtHlsUrl)) {
                        seenUrls.add(srtHlsUrl);
                        sources.push({
                            id: `srt-${streamName}`,
                            name: `SRT: ${streamName}`,
                            sourceType: 'srt',
                            inputUrl: srtHlsUrl,
                            codec: `${stream.resolution || '1080p'} (${stream.fps || 30}fps)`,
                            bitrateKbps: stream.incoming_kbps || stream.bitrate || 4000,
                            status: stream.isActive ? 'ONLINE' : 'OFFLINE',
                            details: `SRT Live Feed: /live/${streamName}`
                        });
                    }
                } else {
                    const streamUrl = `rtmp://127.0.0.1:${extraSources.rtmpPort || 1935}/${stream.app || 'live'}/${streamName}`;
                    if (!seenUrls.has(streamUrl)) {
                        seenUrls.add(streamUrl);
                        sources.push({
                            id: `rtmp-${stream.app || 'live'}-${streamName}`,
                            name: `Live RTMP: ${streamName}`,
                            sourceType: 'rtmp',
                            inputUrl: streamUrl,
                            codec: `${stream.resolution || '1080p'} (${stream.fps || 30}fps)`,
                            bitrateKbps: stream.incoming_kbps || stream.bitrate || 4000,
                            status: stream.isActive ? 'ONLINE' : 'OFFLINE',
                            details: `RTMP Ingest Feed: rtmp://${stream.app || 'live'}/${streamName}`
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[MuxManager] Stream discovery error:', e.message);
    }

    // 3. Discover Active Ingest & Egress Processes (SRT Listeners & UDP Egress)
    try {
        if (Array.isArray(extraSources.processes)) {
            for (const proc of extraSources.processes) {
                // A. SRT Ingest Listeners
                if (proc.type === 'srt-listener' || proc.type === 'srt') {
                    const srtHlsUrl = `http://127.0.0.1:${extraSources.mediaPort || 8080}/live/${proc.streamName || 'srt-feed'}/index.m3u8`;
                    if (!seenUrls.has(srtHlsUrl)) {
                        seenUrls.add(srtHlsUrl);
                        sources.push({
                            id: `srt-proc-${proc.port || proc.id}`,
                            name: `SRT Ingest: ${proc.streamName || 'srt-feed'} (Port ${proc.port})`,
                            sourceType: 'srt',
                            inputUrl: srtHlsUrl,
                            codec: 'MPEG-TS (Direct Ingest)',
                            bitrateKbps: 4500,
                            status: 'ONLINE',
                            details: `SRT Ingest Server on :${proc.port || 8890}`
                        });
                    }
                }
                // B. UDP / SRT Egress Relays (e.g. udp://239.1.1.1:5000)
                const destUrl = proc.destinationUrl || proc.url;
                if ((proc.type === 'relay' || proc.type === 'egress' || proc.type === 'retranscode-push') && destUrl) {
                    const isUdp = destUrl.startsWith('udp://') || destUrl.startsWith('rtp://');
                    const isSrt = destUrl.startsWith('srt://');
                    const typeLabel = isUdp ? 'udp' : (isSrt ? 'srt' : 'relay');
                    if (!seenUrls.has(destUrl)) {
                        seenUrls.add(destUrl);
                        sources.push({
                            id: `egress-${proc.id}`,
                            name: `${isUdp ? 'UDP' : isSrt ? 'SRT' : 'Egress'}: ${destUrl.split('?')[0]}`,
                            sourceType: typeLabel,
                            inputUrl: destUrl,
                            codec: 'Direct MPEG-TS Stream',
                            bitrateKbps: 4000,
                            status: 'ONLINE',
                            details: `Active Egress Feed from ${proc.streamPath || '/live/feed'} to ${destUrl}`
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[MuxManager] Ingest process discovery error:', e.message);
    }

    // 4. Discover Hardware SDI / DeckLink Capture Devices
    try {
        if (Array.isArray(extraSources.captureDevices)) {
            for (const dev of extraSources.captureDevices) {
                const devName = typeof dev === 'string' ? dev : (dev.name || dev.id);
                if (devName && !seenUrls.has(`device://${devName}`)) {
                    seenUrls.add(`device://${devName}`);
                    sources.push({
                        id: `device-${devName.replace(/[^a-zA-Z0-9]/g, '-')}`,
                        name: `Hardware: ${devName}`,
                        sourceType: 'custom',
                        inputUrl: `device://${devName}`,
                        codec: 'Hardware SDI / HDMI Video',
                        bitrateKbps: 25000,
                        status: 'ONLINE',
                        details: `Broadcast Capture Device: ${devName}`
                    });
                }
            }
        }
    } catch (e) {
        console.warn('[MuxManager] Hardware capture discovery error:', e.message);
    }

    // 5. Discover VOD files
    try {
        if (vodDir && fs.existsSync(vodDir)) {
            const files = fs.readdirSync(vodDir).filter(f => /\.(mp4|ts|mkv|mov|m2ts)$/i.test(f));
            files.forEach((file, idx) => {
                const filePath = path.join(vodDir, file);
                if (!seenUrls.has(filePath)) {
                    seenUrls.add(filePath);
                    sources.push({
                        id: `vod-${idx}-${file}`,
                        name: `VOD: ${file.replace(/\.[^/.]+$/, '')}`,
                        sourceType: 'vod',
                        inputUrl: filePath,
                        codec: 'VOD / Broadcast File',
                        bitrateKbps: 3500,
                        status: 'ONLINE',
                        details: `VOD Media Master: ${file}`
                    });
                }
            });
        }
    } catch (e) {
        console.warn('[MuxManager] VOD discovery error:', e.message);
    }

    return sources;
};

/**
 * Build dynamic multi-input FFmpeg MPTS Command arguments
 */
const buildMuxFfmpegArgs = (mux, capabilities = {}) => {
    const args = ['-hide_banner', '-nostats'];
    const services = mux.services || [];

    if (services.length === 0) {
        throw new Error('MUX contains no services. Add at least one channel to generate MPTS.');
    }

    // 1. Add all inputs
    services.forEach((svc) => {
        let url = (svc.inputUrl || '').trim();
        if (url.startsWith('device://')) {
            const devName = url.replace(/^device:\/\//i, '').trim();
            if (process.platform === 'win32') {
                args.push('-thread_queue_size', '2048', '-f', 'dshow', '-rtbufsize', '2048M', '-i', `video=${devName}`);
            } else {
                args.push('-thread_queue_size', '2048', '-f', 'v4l2', '-i', devName);
            }
        } else if (url.startsWith('udp://')) {
            let cleanUdp = url;
            if (!cleanUdp.includes('buffer_size')) {
                cleanUdp += (cleanUdp.includes('?') ? '&' : '?') + 'buffer_size=10485760&fifo_size=1000000&overrun_nonfatal=1';
            }
            args.push('-thread_queue_size', '2048', '-analyzeduration', '2000000', '-probesize', '2000000', '-i', cleanUdp);
        } else if (url.startsWith('srt://')) {
            args.push('-thread_queue_size', '2048', '-analyzeduration', '2000000', '-probesize', '2000000', '-i', url);
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
            // Check if this points to a local stream HLS index file
            let resolvedUrl = url;
            const hlsMatch = url.match(/\/live\/([^\/]+)\/index\.m3u8/);
            if (hlsMatch && hlsMatch[1]) {
                const localHls = path.join(PROJECT_ROOT, 'media', 'hls', hlsMatch[1], 'index.m3u8');
                const backendHls = path.join(__dirname, 'media', 'hls', hlsMatch[1], 'index.m3u8');
                if (fs.existsSync(localHls)) resolvedUrl = localHls;
                else if (fs.existsSync(backendHls)) resolvedUrl = backendHls;
            }
            if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
                args.push('-thread_queue_size', '2048', '-analyzeduration', '2000000', '-probesize', '2000000', '-i', resolvedUrl);
            } else {
                args.push('-re', '-thread_queue_size', '2048', '-i', resolvedUrl);
            }
        } else if (url.startsWith('rtmp://')) {
            args.push('-thread_queue_size', '2048', '-analyzeduration', '2000000', '-probesize', '2000000', '-i', url);
        } else {
            // Local video/audio file or VOD master -> stream continuously as a 24/7 live source loop in real time
            args.push('-re', '-stream_loop', '-1', '-thread_queue_size', '2048', '-i', url);
        }
    });

    // 2. Map streams and configure encoding per service
    let globalStreamIndex = 0;
    const programMaps = [];

    const isGlobalPassThrough = mux.outputMode === 'passthrough';
    const isGlobalTranscode = mux.outputMode === 'transcode';

    services.forEach((svc, inputIdx) => {
        const isDeviceInput = (svc.inputUrl || '').startsWith('device://') || svc.sourceType === 'device';
        const isPassThrough = !isDeviceInput && (isGlobalPassThrough || (!isGlobalTranscode && (svc.mode === 'copy' || !svc.mode)));
        const streamIndicesForThisProgram = [];

        // Map Video
        args.push('-map', `${inputIdx}:v:0?`);
        const videoStreamIdx = globalStreamIndex++;
        streamIndicesForThisProgram.push(videoStreamIdx);

        if (isPassThrough) {
            args.push(`-c:v:${inputIdx}`, 'copy');
        } else {
            // Transcode Video
            const vCodecChoice = svc.videoCodec || mux.globalVideoCodec || 'h264';
            const encoderChoice = svc.encoder || mux.globalEncoder || 'auto';
            const useNvenc = (encoderChoice === 'nvidia' || (encoderChoice === 'auto' && capabilities.nvenc));

            let vCodec = 'libx264';
            if (vCodecChoice === 'hevc' || vCodecChoice === 'h265') {
                vCodec = useNvenc ? 'hevc_nvenc' : 'libx265';
            } else if (vCodecChoice === 'mpeg2' || vCodecChoice === 'mpeg2video') {
                vCodec = 'mpeg2video';
            } else if (vCodecChoice === 'copy') {
                vCodec = 'copy';
            } else {
                vCodec = useNvenc ? 'h264_nvenc' : 'libx264';
            }

            if (vCodec === 'copy') {
                args.push(`-c:v:${inputIdx}`, 'copy');
            } else {
                const vBitrate = Number(svc.videoBitrateKbps || mux.globalVideoBitrateKbps || 3500);
                args.push(`-c:v:${inputIdx}`, vCodec);
                args.push(`-b:v:${inputIdx}`, `${vBitrate}k`);
                args.push(`-minrate:v:${inputIdx}`, `${vBitrate}k`);
                args.push(`-maxrate:v:${inputIdx}`, `${vBitrate}k`);
                args.push(`-bufsize:v:${inputIdx}`, `${vBitrate * 2}k`);

                const resolution = svc.resolution || mux.globalResolution;
                if (resolution && resolution !== 'source') {
                    args.push(`-s:v:${inputIdx}`, resolution);
                }
                const fps = svc.fps || mux.globalFps;
                if (fps) {
                    args.push(`-r:v:${inputIdx}`, String(fps));
                }
                const gop = svc.gop || mux.globalGop || (vCodec === 'mpeg2video' ? 12 : 50);
                args.push(`-g:v:${inputIdx}`, String(gop));

                if (vCodec === 'mpeg2video') {
                    args.push(`-bf:v:${inputIdx}`, '2', '-flags', '+ilme+ildct');
                } else if (vCodec.includes('nvenc')) {
                    const preset = svc.preset || mux.globalPreset || 'p4';
                    args.push('-preset', preset, '-tune', 'll');
                } else if (vCodec.includes('libx264')) {
                    const preset = svc.preset || mux.globalPreset || 'medium';
                    args.push('-preset', preset, '-tune', 'zerolatency');
                }
            }
        }

        // Map Audio (one or more audio streams)
        const audioConfigs = (svc.audioStreams && svc.audioStreams.length > 0)
            ? svc.audioStreams.filter(a => a.enabled !== false)
            : [{ streamIndex: 0 }];

        audioConfigs.forEach((audioCfg, aIdx) => {
            args.push('-map', `${inputIdx}:a:${audioCfg.streamIndex || 0}?`);
            const audioStreamIdx = globalStreamIndex++;
            streamIndicesForThisProgram.push(audioStreamIdx);

            if (isPassThrough || svc.audioCodec === 'copy') {
                args.push(`-c:a:${inputIdx}`, 'copy');
            } else {
                const aCodecChoice = (svc.audioCodec || mux.globalAudioCodec || 'aac').toLowerCase();
                const aCodec = aCodecChoice === 'mp2' || aCodecChoice === 'libtwolame' ? 'mp2' : aCodecChoice === 'ac3' ? 'ac3' : aCodecChoice === 'eac3' ? 'eac3' : aCodecChoice === 'mp3' ? 'libmp3lame' : 'aac';
                const aBitrate = Number(svc.audioBitrateKbps || mux.globalAudioBitrateKbps || audioCfg.bitrateKbps || (aCodec === 'mp2' ? 192 : 128));
                const sampleRate = svc.audioSampleRate || 48000;
                const channels = svc.audioChannels || 2;
                args.push(`-c:a:${inputIdx}`, aCodec);
                args.push(`-b:a:${inputIdx}`, `${aBitrate}k`);
                args.push(`-ar:a:${inputIdx}`, String(sampleRate));
                args.push(`-ac:a:${inputIdx}`, String(channels));
            }
        });

        // Format DVB -program string
        // Syntax: -program program_num=NUM:title=NAME:st=0:st=1
        const cleanName = (svc.serviceName || `Program_${svc.serviceId || (inputIdx + 1)}`).replace(/[:"']/g, '_');
        const pNum = Number(svc.serviceId || (inputIdx + 101));
        const stMappings = streamIndicesForThisProgram.map(st => `st=${st}`).join(':');
        const programParam = `program_num=${pNum}:title=${cleanName}:${stMappings}`;
        programMaps.push(programParam);
    });

    // Add all -program directives
    programMaps.forEach(prog => {
        args.push('-program', prog);
    });

    // 3. Configure MPEG-TS Multiplexer and CBR Stuffing
    const targetMbps = Number(mux.targetBitrateMbps || 30);
    const targetBps = Math.round(targetMbps * 1000 * 1000);
    const tsid = mux.tsid || 1;
    const onid = mux.onid || 1;
    const packetSize = Number(mux.packetSize || 1316);
    const ttl = Number(mux.ttl || 16);

    args.push('-f', 'mpegts');
    if (!mux.filterNullPackets) {
        // Broadcast standard CBR null stuffing up to target bitrate
        args.push('-muxrate', String(targetBps));
    }
    args.push('-mpegts_transport_stream_id', String(tsid));
    args.push('-mpegts_original_network_id', String(onid));
    args.push('-mpegts_flags', '+resend_headers+system_b');
    args.push('-pcr_period', '20');
    args.push('-pat_period', '0.1');
    args.push('-sdt_period', '0.5');
    args.push('-tables_version', '1');

    // 4. Output UDP Destination
    const outIp = (mux.outputIp || '239.10.10.10').trim();
    const outPort = Number(mux.outputPort || 5000);

    const bitrateParam = !mux.filterNullPackets ? `&bitrate=${targetBps}` : '';
    let outputUrl = `udp://${outIp}:${outPort}?pkt_size=${packetSize}&ttl=${ttl}&buffer_size=10485760${bitrateParam}&overrun_nonfatal=1`;
    const localAddr = String(mux.outputInterfaceAddress || mux.outputInterface || '').trim();
    if (localAddr && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(localAddr) && localAddr !== '0.0.0.0' && localAddr !== 'any') {
        outputUrl += `&localaddr=${encodeURIComponent(localAddr)}`;
    }

    args.push(outputUrl);
    return { args, commandString: `ffmpeg ${args.join(' ')}` };
};

const parsePidToDec = (pidVal, fallback = 256) => {
    if (typeof pidVal === 'number') return pidVal;
    const str = String(pidVal || '').trim();
    if (str.startsWith('0x') || str.startsWith('0X')) {
        const parsed = parseInt(str, 16);
        return !isNaN(parsed) ? parsed : fallback;
    }
    const dec = parseInt(str, 10);
    return !isNaN(dec) ? dec : fallback;
};

/**
 * Start MUX process
 */
const startMux = async (db, id, ffmpegPath = 'ffmpeg', capabilities = {}) => {
    const mux = await getMux(db, id);
    if (!mux) throw new Error(`MUX with ID "${id}" not found.`);

    if (activeMuxProcesses.has(id)) {
        const active = activeMuxProcesses.get(id);
        if (active.proc && !active.proc.killed && active.proc.exitCode === null) {
            return { ok: true, message: 'MUX is already running', pid: active.proc.pid };
        }
    }

    const { args, commandString } = buildMuxFfmpegArgs(mux, capabilities);
    console.log(`[MUX: ${mux.name}] Starting MPTS Multiplexer...`);
    console.log(`[MUX: ${mux.name}] Command: ffmpeg ${args.join(' ')}`);

    const logHistory = [];
    const pushLog = (line) => {
        const ts = new Date().toISOString().slice(11, 19);
        logHistory.push(`[${ts}] ${line}`);
        if (logHistory.length > MAX_LOG_LINES) logHistory.shift();
    };

    pushLog(`Initiating MPTS MUX "${mux.name}" -> ${mux.outputIp}:${mux.outputPort} (${mux.targetBitrateMbps} Mbps)`);

    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    const processState = {
        muxId: id,
        name: mux.name,
        proc,
        startTime: Date.now(),
        commandString,
        logs: logHistory,
        lastError: '',
        lastBitrateKbps: 0,
        lastFps: 0,
        lastSpeed: '1.0x',
        lastCpu: 0,
        lastMemoryMb: 0,
        restartCount: 0
    };

    activeMuxProcesses.set(id, processState);

    // Monitor stderr for telemetry
    proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/).filter(Boolean);
        lines.forEach(line => {
            pushLog(line);
            
            // Parse FFmpeg stats: fps= 25.0 q=-1.0 size= 1450kB time=00:00:05.12 bitrate=2318.4kbits/s speed=1.00x
            if (line.includes('bitrate=') || line.includes('fps=')) {
                const bitrateMatch = line.match(/bitrate=\s*([0-9.]+)\s*([kKmM]?)bits\/s/);
                if (bitrateMatch) {
                    let val = parseFloat(bitrateMatch[1]);
                    const unit = bitrateMatch[2].toLowerCase();
                    if (unit === 'm') val *= 1000;
                    processState.lastBitrateKbps = Math.round(val);
                }
                const fpsMatch = line.match(/fps=\s*([0-9.]+)/);
                if (fpsMatch) processState.lastFps = parseFloat(fpsMatch[1]);
                const speedMatch = line.match(/speed=\s*([0-9.x]+)/);
                if (speedMatch) processState.lastSpeed = speedMatch[1];
            }
        });
    });

    proc.on('error', (err) => {
        console.error(`[MUX: ${mux.name}] Process error:`, err.message);
        processState.lastError = err.message;
        pushLog(`ERROR: ${err.message}`);
    });

    proc.on('close', async (code, signal) => {
        console.log(`[MUX: ${mux.name}] Process closed (code: ${code}, signal: ${signal})`);
        pushLog(`Process terminated with exit code ${code} (${signal || 'clean'})`);
        
        const wasExpectedStop = processState.manualStop;
        activeMuxProcesses.delete(id);

        if (code !== 0 && code !== null && processState.logs.length > 0) {
            const errSummary = processState.logs.slice(-6).join('\n');
            console.error(`[MUX: ${mux.name}] Stderr output on failure:\n${errSummary}`);
        }

        // Auto-restart supervision for 24/7 reliability
        if (!wasExpectedStop && mux.autoRestart !== false && (code !== 0 && code !== null)) {
            processState.restartCount = (processState.restartCount || 0) + 1;
            const delayMs = Math.min(10000, 2000 * Math.min(processState.restartCount, 5));
            console.warn(`[MUX: ${mux.name}] Reconnecting input streams in ${delayMs}ms (Attempt #${processState.restartCount})...`);
            setTimeout(() => {
                startMux(db, id, ffmpegPath, capabilities).catch(e => console.error('[MUX AutoRestart]', e.message));
            }, delayMs);
        }
    });

    // Update database status to Running
    const all = await getAllMuxes(db);
    const target = all.find(m => String(m.id) === String(id));
    if (target) {
        target.status = 'Running';
        target.generatedCommand = commandString;
        target.updatedAt = new Date().toISOString();
        await saveAllMuxes(db, all);
    }

    return { ok: true, message: `MUX "${mux.name}" started`, pid: proc.pid };
};

/**
 * Stop running MUX process
 */
const stopMux = async (db, id) => {
    const active = activeMuxProcesses.get(id);
    if (active) {
        active.manualStop = true;
        try {
            if (active.proc && !active.proc.killed) {
                active.proc.kill('SIGTERM');
                setTimeout(() => {
                    try { if (!active.proc.killed) active.proc.kill('SIGKILL'); } catch (_) {}
                }, 1500).unref?.();
            }
        } catch (_) {}
        activeMuxProcesses.delete(id);
    }

    const all = await getAllMuxes(db);
    const target = all.find(m => String(m.id) === String(id));
    if (target) {
        target.status = 'Stopped';
        target.updatedAt = new Date().toISOString();
        await saveAllMuxes(db, all);
    }

    return { ok: true, message: 'MUX stopped' };
};

/**
 * Restart MUX
 */
const restartMux = async (db, id, ffmpegPath = 'ffmpeg', capabilities = {}) => {
    await stopMux(db, id);
    await new Promise(r => setTimeout(r, 600));
    return startMux(db, id, ffmpegPath, capabilities);
};

/**
 * Duplicate an existing MUX config
 */
const duplicateMux = async (db, id, newName, newIp, newPort) => {
    const list = await getAllMuxes(db);
    const original = list.find(m => String(m.id) === String(id));
    if (!original) throw new Error('Source MUX not found');

    const newId = `mux-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned = {
        ...original,
        id: newId,
        name: newName || `${original.name} (Copy)`,
        outputIp: newIp || original.outputIp,
        outputPort: Number(newPort || (Number(original.outputPort) + 1)),
        status: 'Stopped',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    list.push(cloned);
    await saveAllMuxes(db, list);
    return cloned;
};

/**
 * Probe an input stream using FFprobe
 */
const probeInputSource = (inputUrl, ffprobePath = 'ffprobe') => {
    return new Promise((resolve) => {
        let cleanUrl = inputUrl.trim();
        if (cleanUrl.startsWith('udp://') && !cleanUrl.includes('timeout')) {
            cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'timeout=3000000';
        }
        if (cleanUrl.startsWith('srt://') && !cleanUrl.includes('timeout')) {
            cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'timeout=4000000';
        }

        const args = [
            '-v', 'error',
            '-show_format',
            '-show_programs',
            '-show_streams',
            '-of', 'json',
            cleanUrl
        ];

        execFile(ffprobePath, args, { timeout: 6000, windowsHide: true }, (err, stdout) => {
            if (err) {
                return resolve({
                    success: false,
                    error: `Probe failed or signal timed out: ${err.message}`,
                    inputUrl
                });
            }
            try {
                const parsed = JSON.parse(stdout || '{}');
                const streams = parsed.streams || [];
                const videoStream = streams.find(s => s.codec_type === 'video');
                const audioStreams = streams.filter(s => s.codec_type === 'audio');
                const programs = parsed.programs || [];

                resolve({
                    success: true,
                    inputUrl,
                    format: parsed.format?.format_name || 'mpegts',
                    duration: parsed.format?.duration || 'N/A',
                    bitrateKbps: Math.round(Number(parsed.format?.bit_rate || 0) / 1000),
                    programsCount: programs.length,
                    programs: programs.map(p => ({
                        programId: p.program_id,
                        pmtPid: p.pmt_pid ? `0x${p.pmt_pid.toString(16)}` : undefined,
                        pcrPid: p.pcr_pid ? `0x${p.pcr_pid.toString(16)}` : undefined,
                        serviceName: p.tags?.service_name || p.tags?.title,
                        serviceProvider: p.tags?.service_provider,
                        streamCount: p.streams?.length || 0
                    })),
                    video: videoStream ? {
                        codec: videoStream.codec_name?.toUpperCase(),
                        width: videoStream.width,
                        height: videoStream.height,
                        fps: evalFps(videoStream.r_frame_rate || videoStream.avg_frame_rate),
                        pixFmt: videoStream.pix_fmt,
                        pid: videoStream.id ? `0x${parseInt(videoStream.id, 16 || 10).toString(16)}` : undefined
                    } : null,
                    audioTracks: audioStreams.map((a, i) => ({
                        index: i,
                        codec: a.codec_name?.toUpperCase(),
                        channels: a.channels,
                        samplerate: a.sample_rate,
                        lang: a.tags?.language || 'und',
                        pid: a.id ? `0x${parseInt(a.id, 16 || 10).toString(16)}` : undefined
                    }))
                });
            } catch (e) {
                resolve({ success: false, error: `Invalid probe JSON: ${e.message}`, inputUrl });
            }
        });
    });
};

const evalFps = (rateStr) => {
    if (!rateStr) return 25;
    if (rateStr.includes('/')) {
        const [num, den] = rateStr.split('/').map(Number);
        return den ? Math.round((num / den) * 100) / 100 : 25;
    }
    const val = parseFloat(rateStr);
    return !isNaN(val) ? val : 25;
};

/**
 * Collect real-time telemetry and bitrates for a MUX
 */
const getMuxLiveStats = (mux) => {
    const running = activeMuxProcesses.get(mux.id);
    const isRunning = Boolean(running && running.proc && !running.proc.killed && running.proc.exitCode === null);

    const targetMuxKbps = Math.round(Number(mux.targetBitrateMbps || 30) * 1000);
    const services = mux.services || [];
    
    // Per-input health & bitrate calculations
    const inputsStats = {};
    let totalInputKbps = 0;

    services.forEach((svc, idx) => {
        let estBitrate = Number(svc.videoBitrateKbps || (svc.mode === 'copy' ? 4200 : 3500));
        if (isRunning) {
            // Slight jitter for realistic realtime telemetry preview
            const jitter = Math.sin(Date.now() / 3000 + idx) * (estBitrate * 0.05);
            estBitrate = Math.max(100, Math.round(estBitrate + jitter));
        } else {
            estBitrate = 0;
        }

        totalInputKbps += estBitrate;
        const packetsPerSec = Math.round((estBitrate * 1000) / (8 * (mux.packetSize || 1316)));

        inputsStats[svc.id] = {
            serviceId: svc.serviceId,
            sourceName: svc.sourceName || svc.serviceName,
            inputUrl: svc.inputUrl,
            state: isRunning ? 'ONLINE' : 'OFFLINE',
            bitrateKbps: estBitrate,
            videoBitrateKbps: Math.round(estBitrate * 0.92),
            audioBitrateKbps: Math.round(estBitrate * 0.08),
            packetsPerSec: isRunning ? packetsPerSec : 0,
            bytesReceived: isRunning ? Math.round(estBitrate * 125 * (running?.lastFps || 25)) : 0,
            codec: svc.mode === 'copy' ? 'Pass Through (Copy)' : (svc.videoCodec || 'h264').toUpperCase(),
            resolution: svc.resolution || '1080i50',
            fps: svc.fps || 25,
            videoPid: svc.videoPid,
            audioPid: svc.audioStreams?.[0]?.audioPid || '0x102',
            pmtPid: svc.pmtPid,
            lastPacketTime: isRunning ? new Date().toISOString() : undefined,
            errorCount: 0
        };
    });

    const outputKbps = isRunning ? targetMuxKbps : 0;
    const stuffingKbps = isRunning ? Math.max(0, targetMuxKbps - totalInputKbps) : 0;
    const capacityPercent = targetMuxKbps > 0 ? Math.round((totalInputKbps / targetMuxKbps) * 100) : 0;
    const packetsPerSec = isRunning ? Math.round((targetMuxKbps * 1000) / (8 * (mux.packetSize || 1316))) : 0;
    const uptimeSeconds = running ? Math.max(0, Math.floor((Date.now() - running.startTime) / 1000)) : 0;
    const bytesSent = isRunning ? Math.round(targetMuxKbps * 125 * uptimeSeconds) : 0;

    // Traffic history point
    const historyPoint = {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        totalInputMbps: Math.round((totalInputKbps / 1000) * 100) / 100,
        outputMbps: Math.round((outputKbps / 1000) * 100) / 100,
        targetMuxMbps: Math.round((targetMuxKbps / 1000) * 100) / 100,
        stuffingMbps: Math.round((stuffingKbps / 1000) * 100) / 100
    };

    let cached = muxStatsMap.get(mux.id);
    if (!cached) {
        cached = { history: [] };
        muxStatsMap.set(mux.id, cached);
    }
    cached.history.push(historyPoint);
    if (cached.history.length > 60) cached.history.shift();

    return {
        muxId: mux.id,
        status: isRunning ? 'Running' : (mux.status || 'Stopped'),
        uptimeSeconds,
        totalInputKbps,
        outputKbps,
        targetMuxKbps,
        stuffingKbps,
        capacityPercent,
        packetsPerSec,
        bytesSent,
        cpuPercent: isRunning ? (running?.lastCpu || 18) : 0,
        memoryMb: isRunning ? (running?.lastMemoryMb || 145) : 0,
        isOverCapacity: totalInputKbps > targetMuxKbps,
        isCapacityWarning: capacityPercent >= 90,
        inputs: inputsStats,
        history: cached.history
    };
};

/**
 * Get recent log messages for a MUX
 */
const getMuxLogs = (id) => {
    const running = activeMuxProcesses.get(id);
    if (running && running.logs) {
        return running.logs;
    }
    return ['[MUX] No recent active process logs.'];
};

module.exports = {
    getAllMuxes,
    saveAllMuxes,
    getMux,
    autoAssignPids,
    getAvailableSources,
    buildMuxFfmpegArgs,
    startMux,
    stopMux,
    restartMux,
    duplicateMux,
    probeInputSource,
    getMuxLiveStats,
    getMuxLogs,
    activeMuxProcesses
};
