import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, 'icon-source.svg'));
const out = (name) => resolve(__dirname, '..', 'public', name);

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['maskable-icon-512x512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32x32.png', 32],
];

for (const [name, size] of targets) {
  await sharp(src).resize(size, size).png().toFile(out(name));
  console.log('generated', name, size);
}
