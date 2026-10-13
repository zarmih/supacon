import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size)
      const index = row + 1 + x * 4
      raw[index] = r
      raw[index + 1] = g
      raw[index + 2] = b
      raw[index + 3] = a
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const ihdr = chunk('IHDR', header)
  const idat = chunk('IDAT', deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ihdr, idat, iend])
}

function paint(x, y, size, scale = 0.34) {
  const center = (size - 1) / 2
  const dx = x - center
  const dy = y - center
  const dist = Math.hypot(dx, dy)
  const radius = size * scale
  const stroke = Math.max(2, size * 0.045)
  const angle = Math.atan2(dy, dx)
  const top = -Math.PI / 2
  let delta = Math.abs(angle - top)
  if (delta > Math.PI) delta = 2 * Math.PI - delta
  const gap = 0.55
  const radial = Math.abs(dist - radius)
  const edge = stroke / 2
  let coverage = 0
  if (radial <= edge) coverage = 1
  else if (radial < edge + 1.25) coverage = 1 - (radial - edge) / 1.25
  const gapInner = gap / 2
  if (delta < gapInner - 0.06) coverage = 0
  else if (delta < gapInner) coverage *= (delta - (gapInner - 0.06)) / 0.06
  const ring = [226, 161, 90]
  const bg = [16, 14, 12]
  const amount = Math.max(0, Math.min(1, coverage))
  return [
    Math.round(bg[0] + (ring[0] - bg[0]) * amount),
    Math.round(bg[1] + (ring[1] - bg[1]) * amount),
    Math.round(bg[2] + (ring[2] - bg[2]) * amount),
    255,
  ]
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192, (x, y, size) => paint(x, y, size)))
writeFileSync('public/icons/icon-512.png', png(512, (x, y, size) => paint(x, y, size)))
writeFileSync('public/icons/icon-maskable-512.png', png(512, (x, y, size) => paint(x, y, size, 0.26)))
writeFileSync('public/icons/apple-touch-icon.png', png(180, (x, y, size) => paint(x, y, size)))
console.log('icons written')
