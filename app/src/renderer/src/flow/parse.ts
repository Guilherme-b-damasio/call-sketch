/** Le o Mermaid com o proprio mermaid e traduz para caixas (so os tipos que o editor sabe mexer). */
import { fromMermaid, type Graph, kindOf, type MermaidData } from '@shared/graph'
import { getMermaid } from '../mermaid'

interface Db {
  getData?: () => MermaidData
  getDirection?: () => string
}

/** null = o editor nao sabe mexer nesse tipo (ou o texto tem erro): fica com o desenho do mermaid. */
export async function parseGraph(code: string): Promise<Graph | null> {
  const mermaid = await getMermaid()
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(code)
    const kind = kindOf(diagram.type)
    const db = diagram.db as Db
    if (!kind || !db.getData) return null
    const data = db.getData()
    if (!data?.nodes?.length) return null
    return fromMermaid(kind, data, db.getDirection?.())
  } catch {
    return null
  }
}
