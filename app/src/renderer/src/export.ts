/**
 * Exportar o desenho. A imagem sai da tela (html-to-image). No app, o processo principal pergunta
 * onde salvar (e monta o PDF); no navegador de quem assiste, vira um download comum (PNG e SVG).
 */
import { toPng, toSvg } from 'html-to-image'

export type ExportKind = 'png' | 'pdf' | 'svg'

export interface Capture {
  el: HTMLElement
  w: number
  h: number
  dark: boolean
  /** Estilo aplicado so na copia (ex: o transform que enquadra tudo). */
  style?: Partial<CSSStyleDeclaration>
}

const BG = { dark: '#0e0e12', light: '#ffffff' }

/** Bolinhas de ligar ficam de fora da imagem. */
const keep = (node: HTMLElement) => !node.classList?.contains('react-flow__handle')

function options(c: Capture, pixelRatio: number) {
  return {
    width: Math.ceil(c.w),
    height: Math.ceil(c.h),
    pixelRatio,
    backgroundColor: c.dark ? BG.dark : BG.light,
    style: { ...c.style },
    filter: keep,
  }
}

export const pngOf = (c: Capture, pixelRatio = 2): Promise<string> => toPng(c.el, options(c, pixelRatio))
export const svgOf = (c: Capture): Promise<string> => toSvg(c.el, options(c, 1))

export function download(url: string, file: string): void {
  Object.assign(document.createElement('a'), { href: url, download: file }).click()
}

/** PDF so existe no app (no navegador de quem assiste nao tem o processo principal). */
export const canPdf = (): boolean => !!window.api?.saveExport

/**
 * Faz a exportacao pedida. `svgText`: o svg pronto, quando ja existe um vetor de verdade (mermaid).
 * Devolve false se a pessoa cancelou.
 */
export async function runExport(kind: ExportKind, c: Capture, name: string, svgText?: string): Promise<boolean> {
  const data = kind === 'svg' ? (svgText ?? (await svgOf(c))) : await pngOf(c)
  if (window.api?.saveExport) return !!(await window.api.saveExport({ kind, data, w: c.w, h: c.h, name }))
  if (kind === 'pdf') throw new Error('PDF so no app')
  const url = data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' }))
  download(url, `${name}.${kind}`)
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}
