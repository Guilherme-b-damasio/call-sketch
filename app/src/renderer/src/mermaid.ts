/** Mermaid carregado sob demanda (e pesado) e configurado com as cores do app. */
import type { Mermaid } from 'mermaid'

const FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif'

export const PALETTE = {
  dark: {
    scale: ['#2e2152', '#4a2a1a', '#123a2e', '#1b2f4f', '#4a1c2c', '#33401a', '#173f45', '#3f3417'],
    vars: {
      darkMode: true,
      background: '#0e0e12',
      primaryColor: '#1d1a2e',
      primaryBorderColor: '#8b5cf6',
      primaryTextColor: '#ececf1',
      secondaryColor: '#1c1d24',
      tertiaryColor: '#14141a',
      lineColor: '#7c7c8a',
      textColor: '#ececf1',
      edgeLabelBackground: '#0e0e12',
      clusterBkg: '#121218',
      clusterBorder: '#30303b',
      noteBkgColor: '#2a2440',
      noteTextColor: '#ececf1',
      actorBkg: '#1d1a2e',
      actorBorder: '#8b5cf6',
      signalColor: '#a1a1aa',
    },
  },
  light: {
    scale: ['#ede9fe', '#ffedd5', '#dcfce7', '#dbeafe', '#fce7f3', '#ecfccb', '#cffafe', '#fef9c3'],
    vars: {
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#f5f3ff',
      primaryBorderColor: '#7c3aed',
      primaryTextColor: '#18181b',
      secondaryColor: '#f4f4f5',
      tertiaryColor: '#fafafa',
      lineColor: '#71717a',
      textColor: '#18181b',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#fafafa',
      clusterBorder: '#e4e4e7',
      noteBkgColor: '#ede9fe',
      noteTextColor: '#18181b',
      actorBkg: '#f5f3ff',
      actorBorder: '#7c3aed',
      signalColor: '#52525b',
    },
  },
}

let instance: Promise<Mermaid> | null = null
let configuredDark: boolean | null = null
let seq = 0

function load(): Promise<Mermaid> {
  instance ??= import('mermaid').then(async (m) => {
    await document.fonts.ready // medir texto com a fonte certa (senao corta os rotulos)
    return m.default
  })
  return instance
}

function configure(mermaid: Mermaid, dark: boolean): void {
  if (configuredDark === dark) return
  configuredDark = dark
  const p = dark ? PALETTE.dark : PALETTE.light
  const scale = Object.fromEntries(
    p.scale.flatMap((c, i) => [
      [`cScale${i}`, c],
      [`cScaleLabel${i}`, p.vars.primaryTextColor],
    ]),
  )
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    look: 'neo',
    fontFamily: FONT,
    htmlLabels: true,
    themeVariables: { ...p.vars, ...scale, fontFamily: FONT, fontSize: '16px' },
    flowchart: { wrappingWidth: 200, padding: 14, nodeSpacing: 36, rankSpacing: 48, curve: 'basis' },
    sequence: { actorMargin: 60, messageMargin: 36, mirrorActors: false },
    mindmap: { padding: 14 },
  })
}

/** O mermaid pronto pra uso (carregado e configurado). */
export async function getMermaid(dark = configuredDark ?? false): Promise<Mermaid> {
  const mermaid = await load()
  configure(mermaid, dark)
  return mermaid
}

/** Carrega o mermaid sem renderizar (pra deixar pronto enquanto o usuario fala). */
export function preload(): void {
  void load()
}

export interface Rendered {
  svg: string
  w: number
  h: number
}

/**
 * O mermaid devolve o svg com width="100%" e max-width, que dentro do palco (posicionado e sem
 * largura propria) pode encolher ate sumir. Fixa o tamanho natural, tirado do viewBox.
 */
export function fixSize(svg: string): Rendered {
  const vb = /viewBox="([\d.\-e]+)[ ,]+([\d.\-e]+)[ ,]+([\d.e]+)[ ,]+([\d.e]+)"/.exec(svg)
  const w = vb ? Math.ceil(Number(vb[3])) : 800
  const h = vb ? Math.ceil(Number(vb[4])) : 600
  const fixed = svg.replace(/<svg\s[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace(/max-width:\s*[^;"]+;?/, '')
      .replace(/^<svg/, `<svg width="${w}" height="${h}"`),
  )
  return { svg: fixed, w, h }
}

export async function renderDiagram(code: string, dark: boolean): Promise<Rendered> {
  const mermaid = await load()
  configure(mermaid, dark)
  const { svg } = await mermaid.render(`cs-${++seq}`, code)
  return fixSize(svg)
}
