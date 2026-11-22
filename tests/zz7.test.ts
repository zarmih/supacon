import { describe, it } from 'vitest'
import { foldLine } from '../src/domain/ics'
describe('probe7', () => {
  it('exact-75 with continuation', () => {
    const line = 'A'.repeat(75) + 'B' + 'C'.repeat(100)
    const f = foldLine(line)
    console.log('PARTS:', f.split('\r\n').map((p) => new TextEncoder().encode(p).length))
    const line2 = 'A'.repeat(150)
    console.log('PARTS2:', foldLine(line2).split('\r\n').map((p) => new TextEncoder().encode(p).length))
    const line3 = 'A'.repeat(149)
    console.log('PARTS3:', foldLine(line3).split('\r\n').map((p) => new TextEncoder().encode(p).length))
  })
})
