import { describe, it } from 'vitest'
import { foldLine, icsFile } from '../src/domain/ics'
import { emptyDatabase } from '../src/store/defaults'
describe('probe6', () => {
  it('fold with an unbreakable long word after a prefix', () => {
    const line = 'DESCRIPTION:' + 'Б'.repeat(60)
    const f = foldLine(line)
    console.log('BYTES_PER_PART:', f.split('\r\n').map((p) => new TextEncoder().encode(p).length))
    console.log('ENDS_WITH_CRLF:', f.endsWith('\r\n'))
    const ics = icsFile(emptyDatabase(), new Date('2026-11-20T10:00:00Z'))
    console.log('ICS_ENDS_CRLF:', JSON.stringify(ics.slice(-20)))
    console.log('ICS_HAS_LONE_LF:', /[^\r]\n/.test(ics))
  })
})
