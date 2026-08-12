const fs = require('fs');

// Base URL parts
const baseUrl = 'http://111.119.44.194:4750';
const startId = 8002;
const endId = 8173;

// Start building M3U content
let m3uContent = '#EXTM3U\n';

for (let i = startId; i <= endId; i++) {
  const programName = `Program ${i - startId + 1}`; // Program 1, 2, 3...
  const url = `${baseUrl}/${i}/0/base/stream.ts`;

  m3uContent += `#EXTINF:-1 tvg-id="${programName}.in",${programName}\n`;
  m3uContent += `${url}\n`;
}

// Write to file
fs.writeFileSync('playlist.m3u', m3uContent);

console.log('M3U playlist generated: playlist.m3u');
