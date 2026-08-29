const { execFile } = require('child_process');

const WINDOWS_PROCESS_CONTROL_SOURCE = `
using System;
using System.Runtime.InteropServices;

public static class KashtrixRecordingProcessControl
{
    private const uint ProcessSuspendResume = 0x0800;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("ntdll.dll")]
    private static extern uint NtSuspendProcess(IntPtr processHandle);

    [DllImport("ntdll.dll")]
    private static extern uint NtResumeProcess(IntPtr processHandle);

    public static int SetPaused(int processId, bool paused)
    {
        IntPtr handle = OpenProcess(ProcessSuspendResume, false, processId);
        if (handle == IntPtr.Zero) return Marshal.GetLastWin32Error();
        try
        {
            uint result = paused ? NtSuspendProcess(handle) : NtResumeProcess(handle);
            return result == 0 ? 0 : unchecked((int)result);
        }
        finally
        {
            CloseHandle(handle);
        }
    }
}`;

const setWindowsProcessPaused = (pid, paused, execFileImpl = execFile) => new Promise((resolve, reject) => {
    const source = WINDOWS_PROCESS_CONTROL_SOURCE.replace(/'/g, "''");
    const script = [
        `$source = '${source}'`,
        'Add-Type -TypeDefinition $source -ErrorAction Stop',
        `$result = [KashtrixRecordingProcessControl]::SetPaused(${Number(pid)}, $${paused ? 'true' : 'false'})`,
        `if ($result -ne 0) { throw "Unable to ${paused ? 'pause' : 'resume'} recording process (native status $result)" }`,
    ].join('; ');

    execFileImpl(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
            if (error) {
                const detail = String(stderr || stdout || error.message || '').trim();
                reject(new Error(detail || `Unable to ${paused ? 'pause' : 'resume'} recording process`));
                return;
            }
            resolve();
        },
    );
});

const setRecordingProcessPaused = async (proc, paused, options = {}) => {
    if (!proc?.pid || proc.exitCode != null || proc.signalCode != null) {
        throw new Error('Recording process is no longer running');
    }

    const platform = options.platform || process.platform;
    if (platform === 'win32') {
        await setWindowsProcessPaused(proc.pid, paused, options.execFileImpl);
        return;
    }

    const signal = paused ? 'SIGSTOP' : 'SIGCONT';
    if (proc.kill(signal) === false) {
        throw new Error(`Unable to ${paused ? 'pause' : 'resume'} recording process`);
    }
};

const getRecordingElapsedMs = (recording, now = Date.now()) => {
    const startTime = new Date(recording?.startTime || now).getTime();
    const completedPauseMs = Math.max(0, Number(recording?.totalPausedMs) || 0);
    const activePauseMs = recording?.isPaused && recording?.pauseStartedAt
        ? Math.max(0, now - Number(recording.pauseStartedAt))
        : 0;
    return Math.max(0, now - startTime - completedPauseMs - activePauseMs);
};

module.exports = {
    getRecordingElapsedMs,
    setRecordingProcessPaused,
    setWindowsProcessPaused,
};
