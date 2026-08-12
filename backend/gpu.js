const os = require('os');
const { execSync } = require('child_process');

async function getCrossPlatformGpuInfo() {
    let gpuDetails = {
        model: 'N/A',
        load: 0,
        memoryLoad: 0
    };

    try {
        const gpuData = await si.graphics();

        if (gpuData.controllers && gpuData.controllers.length > 0) {
            const primaryGpu = gpuData.controllers[0];
            gpuDetails.model = primaryGpu.model || 'Unknown GPU';

            // Base values from systeminformation (works fine for NVIDIA / Linux)
            let gpuLoad = primaryGpu.utilizationGpu || 0;
            let memoryLoad = 0;

            if (primaryGpu.memoryTotal && primaryGpu.memoryUsed) {
                memoryLoad = (primaryGpu.memoryUsed / primaryGpu.memoryTotal) * 100;
            }

            // --- Cross-platform fallbacks ---
            if (gpuLoad === 0 || gpuLoad === null) {
                const platform = os.platform();

                if (platform === 'win32') {
                    // Windows fallback via WMIC
                    try {
                        const output = execSync(
                            `wmic path Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine where "Name like '%3D%'" get UtilizationPercentage /value`,
                            { encoding: 'utf8' }
                        );
                        const matches = output.match(/UtilizationPercentage=(\\d+)/g);
                        if (matches) {
                            const values = matches.map(m => parseInt(m.split('=')[1]));
                            gpuLoad = values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
                        }
                    } catch (_) {
                        gpuLoad = 0;
                    }
                } else if (platform === 'linux') {
                    // Linux fallback for NVIDIA or AMD
                    try {
                        // Try NVIDIA first
                        const nvidia = execSync('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits', { encoding: 'utf8' });
                        gpuLoad = parseFloat(nvidia.split('\n')[0]) || 0;
                    } catch {
                        try {
                            // Try AMD (ROCm or amdgpu)
                            const amd = execSync('rocm-smi --showuse --json', { encoding: 'utf8' });
                            const match = amd.match(/"GPU use":\s*"(\d+)%"/);
                            if (match) gpuLoad = parseFloat(match[1]);
                        } catch {
                            try {
                                // Older AMD utility
                                const amdsmi = execSync('amdgpu_top --json', { encoding: 'utf8' });
                                const match = amdsmi.match(/"gpu_busy_percent":\s*(\d+)/);
                                if (match) gpuLoad = parseFloat(match[1]);
                            } catch {
                                gpuLoad = 0;
                            }
                        }
                    }
                }
            }

            gpuDetails.load = parseFloat((gpuLoad || 0).toFixed(1));
            gpuDetails.memoryLoad = parseFloat((memoryLoad || 0).toFixed(1));
        }
    } catch (err) {
        console.error('GPU fetch error:', err.message);
    }

    return gpuDetails;
}
