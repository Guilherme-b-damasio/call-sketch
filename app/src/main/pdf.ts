/**
 * Salva o desenho exportado: PNG e SVG como vieram da tela, PDF montado aqui (a imagem vira uma
 * pagina do tamanho exato dela). Sempre pergunta onde salvar.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import type { ExportRequest } from '@shared/types'

const MAX_CHARS = 80 * 1024 * 1024
const PNG_PREFIX = 'data:image/png;base64,'
const SVG_PREFIX = /^data:image\/svg\+xml(;charset=[\w-]+)?,/

export function checkExport(req: ExportRequest): ExportRequest {
  if (!req || !['png', 'svg', 'pdf'].includes(req.kind)) throw new Error('formato invalido')
  if (typeof req.data !== 'string' || req.data.length > MAX_CHARS) throw new Error('imagem invalida')
  if (req.kind === 'svg' ? !(SVG_PREFIX.test(req.data) || /^\s*</.test(req.data)) : !req.data.startsWith(PNG_PREFIX))
    throw new Error('imagem invalida')
  const w = Number(req.w)
  const h = Number(req.h)
  if (!(w > 0 && h > 0 && w < 30_000 && h < 30_000)) throw new Error('tamanho invalido')
  const name = String(req.name ?? 'call-sketch').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 80) || 'call-sketch'
  return { kind: req.kind, data: req.data, w, h, name }
}

/** Conteudo do arquivo final. */
export async function exportBytes(req: ExportRequest): Promise<Buffer> {
  if (req.kind === 'png') return Buffer.from(req.data.slice(PNG_PREFIX.length), 'base64')
  if (req.kind === 'svg') {
    const m = SVG_PREFIX.exec(req.data)
    return Buffer.from(m ? decodeURIComponent(req.data.slice(m[0].length)) : req.data, 'utf8')
  }
  return pngToPdf(req.data, req.w, req.h)
}

/** Gera o PDF numa janela escondida (sem script) com a pagina do tamanho da imagem. */
export async function pngToPdf(dataUrl: string, w: number, h: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'cs-pdf-'))
  const file = join(dir, 'pagina.html')
  const W = Math.ceil(w)
  const H = Math.ceil(h)
  await writeFile(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${W}px ${H}px;margin:0}html,body{margin:0;padding:0}img{display:block;width:${W}px;height:${H}px}</style></head><body><img src="${dataUrl}"></body></html>`,
  )
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

const FILTERS: Record<ExportRequest['kind'], Electron.FileFilter> = {
  png: { name: 'Imagem PNG', extensions: ['png'] },
  svg: { name: 'Imagem SVG', extensions: ['svg'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
}

/** Pergunta onde salvar e grava. Devolve o caminho (ou null se a pessoa cancelou). */
export async function saveExport(parent: BrowserWindow | null, raw: ExportRequest): Promise<string | null> {
  const req = checkExport(raw)
  const opts = {
    title: 'Exportar desenho',
    defaultPath: join(app.getPath('documents'), `${req.name}.${req.kind}`),
    filters: [FILTERS[req.kind]],
  }
  const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return null
  await writeFile(filePath, await exportBytes(req))
  return filePath
}
