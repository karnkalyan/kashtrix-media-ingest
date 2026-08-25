import { createHash, randomUUID } from 'node:crypto';
import { arch, platform } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

function rejectPlaceholder(value: string) {
  const normalized = value.replace(/[^a-f0-9]/gi, '').toLowerCase();
  if (!normalized || /^0+$/.test(normalized) || /^f+$/.test(normalized)) throw new Error('Machine identifier is a firmware placeholder');
  return value;
}

async function machineId(): Promise<string> {
  const os = platform();
  if (os === 'linux') {
    for (const path of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try { return rejectPlaceholder((await readFile(path, 'utf8')).trim()); } catch {}
    }
  }
  if (os === 'darwin') {
    const { stdout } = await exec('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
    const match = stdout.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (match?.[1]) return rejectPlaceholder(match[1]);
  }
  if (os === 'win32') {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID']);
    if (stdout.trim()) return rejectPlaceholder(stdout.trim());
  }
  throw new Error('Unable to obtain a stable OS machine identifier');
}

function normalizeNamespace(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) throw new Error(`${label} must be a UUID from the License Manager admin application`);
  return normalized;
}

/** Internal privacy-preserving machine fingerprint. Do not transmit this value. */
export async function generateBaseHardwareFingerprint(): Promise<string> {
  const components = [await machineId(), platform(), arch()].map(x => x.trim().toLowerCase()).sort();
  return createHash('sha256').update(`lm-base-hwid-v2|${components.join('|')}`, 'utf8').digest('hex');
}

/**
 * Public application-scoped HWID sent to the licensing server.
 * Same hardware + different tenant/application => deliberately different HWID.
 */
export async function generateHwid(scope: { tenantId: string; applicationId: string }): Promise<string> {
  const tenantId = normalizeNamespace(scope.tenantId, 'tenantId');
  const applicationId = normalizeNamespace(scope.applicationId, 'applicationId');
  const base = await generateBaseHardwareFingerprint();
  return createHash('sha256').update(`lm-app-hwid-v2|${tenantId}|${applicationId}|${base}`, 'utf8').digest('hex');
}

export async function loadOrCreateClientId(filePath: string): Promise<string> {
  try {
    const current = (await readFile(filePath, 'utf8')).trim();
    if (/^[0-9a-f-]{36}$/i.test(current)) return current;
  } catch {}
  const id = randomUUID();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, id, { encoding: 'utf8', mode: 0o600 });
  return id;
}

/** Makes it hard to accidentally reuse one installation id across applications. */
export async function loadOrCreateScopedClientId(storageDir: string, tenantId: string, applicationId: string): Promise<string> {
  const namespace = createHash('sha256').update(`${normalizeNamespace(tenantId, 'tenantId')}|${normalizeNamespace(applicationId, 'applicationId')}`).digest('hex').slice(0, 24);
  return loadOrCreateClientId(join(storageDir, `license-client-${namespace}.id`));
}
