const { spawn } = require('child_process');

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(command, ['run', 'dev:api'], { stdio: 'inherit', shell: true }),
  spawn(command, ['run', 'dev:web'], { stdio: 'inherit', shell: true }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
};

for (const child of children) {
  child.on('error', error => {
    console.error('[dev] Failed to start a service:', error.message);
    stop(1);
  });
  child.on('exit', code => {
    if (!stopping && code) stop(code);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
