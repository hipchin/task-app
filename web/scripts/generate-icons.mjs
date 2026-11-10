import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url))

// apple-touch-icon は角丸なし（iOS が自動で角を丸める）
const square = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'))

await Promise.all([
  ...[192, 512].map((size) =>
    sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(`icon-${size}.png`)),
  ),
  sharp(square, { density: 384 }).resize(180, 180).png().toFile(out('apple-touch-icon.png')),
])

console.log('Icons generated')
