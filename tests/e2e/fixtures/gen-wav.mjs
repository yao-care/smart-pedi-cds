import { writeFileSync } from 'fs';

const sr = 16000, sec = 3, n = sr * sec;
const data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0);
data.writeUInt32LE(36 + n * 2, 4);
data.write('WAVE', 8);
data.write('fmt ', 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(1, 22);
data.writeUInt32LE(sr, 24);
data.writeUInt32LE(sr * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(n * 2, 40);

for (let i = 0; i < n; i++) {
  data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 8000), 44 + i * 2);
}

writeFileSync('tests/e2e/fixtures/fake-voice.wav', data);
console.log('wrote fake-voice.wav');
