import { describe, expect, it } from 'vitest'
import { fixSize } from './mermaid'

describe('fixSize', () => {
  it('troca o width 100% e o max-width pelo tamanho do viewBox', () => {
    const raw =
      '<svg id="cs-1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 412.5px; background: x;" viewBox="-8 -8 412.5 230.25"><g/></svg>'
    const { svg, w, h } = fixSize(raw)
    expect([w, h]).toEqual([413, 231])
    expect(svg).toMatch(/^<svg width="413" height="231" id="cs-1"/)
    expect(svg).not.toContain('100%')
    expect(svg).not.toContain('max-width')
    expect(svg).toContain('<g/>')
  })
})
