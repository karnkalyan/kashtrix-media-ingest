const si = require('systeminformation');

// Global state to store the last network snapshot for rate calculation
let lastNetworkStats = {}; 

/**
 * Converts bytes per second to a human-readable format (e.g., KB/s, MB/s).
 * @param {number} bytes The raw byte count.
 * @returns {string} Human-readable speed.
 */
const formatBytes = (bytes) => {
    // Defensive check: ensure bytes is a valid number
    if (typeof bytes !== 'number' || bytes < 0 || isNaN(bytes)) return '0 B/s';
    if (bytes === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    // Ensure 'i' is within the bounds of the 'sizes' array
    const exponent = Math.min(i, sizes.length - 1);
    
    return parseFloat((bytes / Math.pow(k, exponent)).toFixed(2)) + ' ' + sizes[exponent];
};

/**
 * Calculates the network throughput (Rx/Tx rate) since the last call.
 * This function also updates the global state for the next calculation.
 * * @param {Array<Object>} currentStats Current network interface stats from si.networkStats().
 * @returns {Array<Object>} Network rates in bytes/sec and formatted strings.
 */
const calculateNetworkRate = (currentStats) => {
    const now = Date.now();
    let rates = [];

    if (!currentStats || currentStats.length === 0) {
        return rates;
    }

    for (const stat of currentStats) {
        const interfaceId = stat.iface;
        const prev = lastNetworkStats[interfaceId];
        
        let rxRate = 0;
        let txRate = 0;
        
        // Ensure 'prev' exists, has a timestamp, and time has passed before calculating rate
        if (prev && prev.timestamp) {
            // Calculate time difference in seconds
            const timeDiff = (now - prev.timestamp) / 1000; 
            
            // Calculate rate only if time has elapsed and previous byte counts exist
            if (timeDiff > 0 && prev.rx_bytes !== undefined && prev.tx_bytes !== undefined) {
                // Ensure we only calculate positive change (in case of interface reset)
                const rxChange = stat.rx_bytes - prev.rx_bytes;
                const txChange = stat.tx_bytes - prev.tx_bytes;
                
                rxRate = rxChange > 0 ? rxChange / timeDiff : 0; 
                txRate = txChange > 0 ? txChange / timeDiff : 0; 
            }
            
            rates.push({
                iface: interfaceId,
                rx_sec: rxRate,
                tx_sec: txRate,
                rx_rate_fmt: formatBytes(rxRate),
                tx_rate_fmt: formatBytes(txRate),
            });
        }
        
        // Update the global state for the next calculation, using current bytes and timestamp
        lastNetworkStats[interfaceId] = {
            rx_bytes: stat.rx_bytes,
            tx_bytes: stat.tx_bytes,
            timestamp: now,
        };
    }
    return rates;
}


/**
 * Global cache for system stats to prevent high CPU usage from frequent hardware scans.
 */
let cachedStats = null;
let lastFetchTime = 0;
let fetchInProgress = null;

const FETCH_THROTTLE_MS = 3000; // Minimum time between hardware scans (increased to 3s for stability)

/**
 * Helper function to get the latest comprehensive system stats.
 * Includes a caching layer to protect the CPU from redundant calls.
 */
const getFullSystemStats = async () => {
    const now = Date.now();
    
    // 1. If a fetch is already running, return its promise
    if (fetchInProgress) return fetchInProgress;

    // 2. If we have fresh cached data, return it
    if (cachedStats && (now - lastFetchTime < FETCH_THROTTLE_MS)) {
        return cachedStats;
    }

    // 3. Otherwise, perform a new fetch
    fetchInProgress = (async () => {
        try {
            // Internal function logic moved here
            const stats = await _performFullSystemFetch();
            cachedStats = stats;
            lastFetchTime = Date.now();
            return stats;
        } finally {
            fetchInProgress = null;
        }
    })();

    return fetchInProgress;
};

/**
 * The actual heavy-lifting hardware scan.
 */
const _performFullSystemFetch = async () => {
    try {
        // 1. CPU, Load, Processes
        const cpuData = await si.currentLoad();
        const procData = await si.processes();
        // Defensive checks for load values
        const cpuLoad = cpuData.currentLoad !== undefined ? cpuData.currentLoad : 0; 
        
        // Defensive check for cpuData.cpus before mapping
        const coreLoads = (cpuData.cpus || []).map(cpu => 
            parseFloat((cpu.load || 0).toFixed(1))
        );
        
        // Defensive check for cpuData.avgload 
        const loadAvg = (cpuData.avgload || []).map(load => 
            parseFloat((load || 0).toFixed(2))
        );
        
        // 2. Memory Usage
        const memData = await si.mem();
        const memUsed = memData.used !== undefined ? memData.used : 0;
        const memTotal = memData.total !== undefined && memData.total > 0 ? memData.total : 1; // Avoid division by zero
        const memLoad = (memUsed / memTotal) * 100; 
        
        // 3. Disk Usage (Main Drive)
        const fsData = await si.fsSize();
        // Assume first entry is the primary drive, default to 0
        const diskLoad = fsData.length > 0 && fsData[0].use !== undefined ? fsData[0].use : 0; 

        // 4. Network Throughput
        const netStats = await si.networkStats();
        const netRates = calculateNetworkRate(netStats);
        
        // 5. GPU Information (Fixing the utilization issue by defensive coding)
        const gpuData = await si.graphics();
        let gpuDetails = {
            model: 'N/A',
            load: 0,
            memoryLoad: 0
        };
        
        if (gpuData.controllers && gpuData.controllers.length > 0) {
            const primaryGpu = gpuData.controllers[0];
            
            // Calculate memory load defensively
            const memUsedGpu = primaryGpu.memoryUsed !== undefined ? primaryGpu.memoryUsed : 0;
            const memTotalGpu = primaryGpu.memoryTotal !== undefined && primaryGpu.memoryTotal > 0 ? primaryGpu.memoryTotal : 1;
            const memoryLoad = (memUsedGpu / memTotalGpu) * 100;
            
            // utilizationGpu is the problematic field; default to 0 if undefined/null
            const gpuCoreLoad = primaryGpu.utilizationGpu !== undefined && primaryGpu.utilizationGpu !== null 
    ? primaryGpu.utilizationGpu 
    : 0;

            gpuDetails = {
                model: primaryGpu.model || 'Unknown GPU',
                // This is the core utilization; it will be 0 if the OS/driver does not report it
                load: parseFloat(gpuCoreLoad.toFixed(1)), 
                memoryLoad: !isNaN(memoryLoad) ? parseFloat(memoryLoad.toFixed(1)) : 0,
            };
        }
        
        const isHealthy = cpuLoad < 90 && memLoad < 90;


        return {
            cpuLoad: parseFloat(cpuLoad.toFixed(1)),
            memLoad: parseFloat(memLoad.toFixed(1)),
            diskLoad: parseFloat(diskLoad.toFixed(1)),
            isHealthy,
            timestamp: new Date().toISOString(),
            coreLoads: coreLoads, 
            loadAvg: loadAvg, 
            runningProcesses: procData.all !== undefined ? procData.all : 0,
            networkDetails: netRates, 
            gpuDetails: gpuDetails, 
        };
    } catch (e) {
        console.error("Error fetching hardware stats:", e);
        // Return a complete, zero-filled object on error to prevent client crashes
        return {
            cpuLoad: 0, memLoad: 0, diskLoad: 0, isHealthy: false,
            coreLoads: [], loadAvg: [0, 0, 0], runningProcesses: 0,
            timestamp: new Date().toISOString(), networkDetails: [],
            gpuDetails: { model: 'N/A', load: 0, memoryLoad: 0 },
            error: "Hardware stats unavailable: " + e.message
        };
    }
};

// Export the throttled fetching function
module.exports = {
    getFullSystemStats
};