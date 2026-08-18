const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

let cachedGpuControllers = null;
let lastStaticCheck = 0;
let lastGpuLoad = 0;
let lastGpuMemLoad = 0;

// Initialize static hardware info asynchronously
async function initStaticGpuInfo() {
    try {
        const data = await si.graphics();
        if (data && data.controllers && data.controllers.length > 0) {
            cachedGpuControllers = data.controllers;
            lastStaticCheck = Date.now();
        }
    } catch (e) {
        // Ignore static detection errors
    }
}
initStaticGpuInfo();

function formatVramBytes(mb) {
    if (!mb || isNaN(mb) || mb <= 0) return 'Dynamic / Shared';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
}

function detectHardwareAcceleration(vendor, model) {
    const v = (vendor || '').toLowerCase();
    const m = (model || '').toLowerCase();
    if (v.includes('nvidia') || m.includes('nvidia') || m.includes('geforce') || m.includes('quadro') || m.includes('rtx') || m.includes('gtx') || m.includes('tesla') || m.includes('a100') || m.includes('t4')) {
        return 'NVENC / NVDEC (NVIDIA CUDA)';
    }
    if (v.includes('advanced micro devices') || v.includes('amd') || m.includes('amd') || m.includes('radeon')) {
        return 'AMF / D3D11VA (AMD Hardware Acceleration)';
    }
    if (v.includes('intel') || m.includes('intel') || m.includes('iris') || m.includes('arc') || m.includes('uhd')) {
        return 'QuickSync / QSV (Intel Video Sync)';
    }
    if (v.includes('apple') || m.includes('apple') || m.includes('m1') || m.includes('m2') || m.includes('m3') || m.includes('m4')) {
        return 'VideoToolbox (Apple Silicon)';
    }
    return 'D3D11VA / DirectShow / VAAPI Hardware';
}

function queryNvidiaSmi() {
    try {
        const nullDev = process.platform === 'win32' ? '2>nul' : '2>/dev/null';
        const out = execSync(
            `nvidia-smi --query-gpu=name,driver_version,memory.total,utilization.gpu,utilization.memory --format=csv,noheader,nounits ${nullDev}`,
            { encoding: 'utf8', timeout: 1000, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
        ).trim();
        if (!out) return null;
        const line = out.split(/\r?\n/)[0];
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 5) {
            const [name, driver, memTotal, uGpu, uMem] = parts;
            return {
                model: name || 'NVIDIA Graphics Device',
                vendor: 'NVIDIA Corporation',
                vram: parseFloat(memTotal) || 0,
                gpuLoad: parseFloat(uGpu) || 0,
                memoryLoad: parseFloat(uMem) || 0,
                driverVersion: driver || '',
                acceleration: 'NVENC / NVDEC (NVIDIA CUDA)'
            };
        }
    } catch (_) {}
    return null;
}

function selectBestGpuController(controllers) {
    if (!controllers || !controllers.length) return null;
    // Score controllers: Discrete NVIDIA (100) > Discrete AMD (80) > Intel Arc/Iris (60) > Integrated (20)
    const scoreController = (c) => {
        const str = `${c.vendor || ''} ${c.model || ''} ${c.name || ''}`.toLowerCase();
        if (str.includes('nvidia') || str.includes('geforce') || str.includes('rtx') || str.includes('quadro') || str.includes('tesla')) return 100;
        if (str.includes('radeon rx') || (str.includes('amd') && !str.includes('graphics') && !str.includes('integrated'))) return 80;
        if (str.includes('intel') && (str.includes('arc') || str.includes('iris'))) return 60;
        if (str.includes('amd') || str.includes('radeon')) return 40;
        if (str.includes('intel')) return 30;
        return 10;
    };
    return [...controllers].sort((a, b) => scoreController(b) - scoreController(a))[0];
}

async function getCrossPlatformGpuInfo() {
    // 1. Try nvidia-smi first (exact hardware metrics for NVIDIA GPUs on Linux/Docker and Windows)
    const nvidiaInfo = queryNvidiaSmi();
    if (nvidiaInfo) {
        lastGpuLoad = parseFloat(nvidiaInfo.gpuLoad.toFixed(1));
        lastGpuMemLoad = parseFloat(nvidiaInfo.memoryLoad.toFixed(1));
        return {
            model: nvidiaInfo.model,
            vendor: nvidiaInfo.vendor,
            vram: nvidiaInfo.vram,
            vramFmt: formatVramBytes(nvidiaInfo.vram),
            load: lastGpuLoad,
            memoryLoad: lastGpuMemLoad,
            acceleration: nvidiaInfo.acceleration,
            controllers: [{ model: nvidiaInfo.model, vendor: nvidiaInfo.vendor, vram: nvidiaInfo.vram }]
        };
    }

    // 2. Re-check systeminformation controllers periodically
    if (!cachedGpuControllers || Date.now() - lastStaticCheck > 60000) {
        try {
            const data = await si.graphics();
            if (data && data.controllers && data.controllers.length > 0) {
                cachedGpuControllers = data.controllers;
                lastStaticCheck = Date.now();
            }
        } catch (_) {}
    }

    let primaryGpu = selectBestGpuController(cachedGpuControllers);

    const platform = os.platform();

    // 3. Platform-specific fallbacks if si.graphics() had nothing
    if (!primaryGpu && platform === 'win32') {
        try {
            const out = execSync(
                'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"',
                { encoding: 'utf8', timeout: 1200, windowsHide: true }
            ).trim();
            if (out) {
                const parsed = JSON.parse(out);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                const winControllers = list.map(item => ({
                    model: item.Name || 'Windows Video Controller',
                    vendor: item.Name?.includes('NVIDIA') ? 'NVIDIA Corporation' : (item.Name?.includes('AMD') ? 'Advanced Micro Devices, Inc.' : (item.Name?.includes('Intel') ? 'Intel Corporation' : 'Standard Display Adapter')),
                    vram: item.AdapterRAM ? Math.round(item.AdapterRAM / (1024 * 1024)) : 0
                }));
                primaryGpu = selectBestGpuController(winControllers);
                cachedGpuControllers = winControllers;
            }
        } catch (_) {}
    }

    // 4. Ultimate fallback if completely undetectable
    if (!primaryGpu) {
        primaryGpu = {
            model: 'Host Graphics & Video Transcode Engine',
            vendor: 'Hardware Video Accelerator',
            vram: 0,
        };
    }

    const modelName = primaryGpu.model || primaryGpu.name || 'Hardware Graphics Accelerator';
    const vendorName = primaryGpu.vendor || 'Display Adapter';
    const vramMb = primaryGpu.vram || primaryGpu.memoryTotal || 0;
    const accel = detectHardwareAcceleration(vendorName, modelName);

    let gpuLoad = primaryGpu.utilizationGpu || 0;
    let memoryLoad = 0;

    if (primaryGpu.memoryTotal && primaryGpu.memoryUsed) {
        memoryLoad = (primaryGpu.memoryUsed / primaryGpu.memoryTotal) * 100;
    }

    if (platform === 'win32') {
        try {
            const output = execSync(
                'powershell -NoProfile -Command "(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Measure-Object -Property UtilizationPercentage -Maximum).Maximum"',
                { encoding: 'utf8', timeout: 800, windowsHide: true }
            ).trim();
            const val = parseFloat(output);
            if (!isNaN(val)) {
                gpuLoad = Math.min(100, Math.max(0, val));
            }
        } catch (_) {
            gpuLoad = lastGpuLoad || 0;
        }

        if (!memoryLoad) {
            memoryLoad = gpuLoad > 0 ? Math.min(100, Math.max(5, gpuLoad * 1.2)) : 0;
        }
    } else if (platform === 'linux') {
        try {
            const amd = execSync('rocm-smi --showuse --json', { encoding: 'utf8', timeout: 500 });
            const match = amd.match(/"GPU use":\s*"(\d+)%"/);
            if (match) gpuLoad = parseFloat(match[1]);
        } catch (_) {}
    }

    lastGpuLoad = parseFloat((gpuLoad || 0).toFixed(1));
    lastGpuMemLoad = parseFloat((memoryLoad || 0).toFixed(1));

    return {
        model: modelName,
        vendor: vendorName,
        vram: vramMb,
        vramFmt: formatVramBytes(vramMb),
        load: lastGpuLoad,
        memoryLoad: lastGpuMemLoad,
        acceleration: accel,
        controllers: cachedGpuControllers || [primaryGpu],
    };
}

module.exports = {
    getCrossPlatformGpuInfo,
};
