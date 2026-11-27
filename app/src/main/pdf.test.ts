import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, dialog: {} }))
const { checkExport, exportBytes } = await import('./pdf')

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('exportar', () => {
  it('aceita png, svg em texto e svg em data URL', async () => {
    expect((await exportBytes(checkExport({ kind: 'png', data: PNG, w: 10, h: 10, name: 'x' }))).subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    )
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>oi é</text></svg>'
    expect((await exportBytes(checkExport({ kind: 'svg', data: svg, w: 1, h: 1, name: 'x' }))).toString()).toBe(svg)
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    expect((await exportBytes(checkExport({ kind: 'svg', data: url, w: 1, h: 1, name: 'x' }))).toString()).toBe(svg)
  })

  it('recusa o que nao e imagem e limpa o nome do arquivo', () => {
    expect(() => checkExport({ kind: 'png', data: 'data:text/html,<b>', w: 1, h: 1, name: 'x' })).toThrow()
    expect(() => checkExport({ kind: 'pdf', data: 'oi', w: 1, h: 1, name: 'x' })).toThrow()
    expect(() => checkExport({ kind: 'exe' as 'png', data: PNG, w: 1, h: 1, name: 'x' })).toThrow()
    expect(() => checkExport({ kind: 'png', data: PNG, w: 0, h: 1, name: 'x' })).toThrow()
    expect(checkExport({ kind: 'png', data: PNG, w: 1, h: 1, name: '../../etc/passwd:é' }).name).toBe('....etcpasswdé')
  })
})
