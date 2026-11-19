/**
 * No macOS e no Linux, um app aberto pelo Finder/menu nao herda o PATH do terminal, entao nao acha
 * o `claude` (nem o `node`) instalado pelo npm, Homebrew, nvm etc. Pega o PATH do shell de login.
 */
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const MARK = '__CALL_SKETCH_PATH__'

function commonDirs(home: string): string[] {
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.bun', 'bin'),
    join(home, '.volta', 'bin'),
  ]
}

/** Junta os caminhos sem repetir, mantendo a ordem. */
export function mergePath(...parts: (string | undefined)[]): string {
  const seen = new Set<string>()
  for (const p of parts) for (const dir of (p ?? '').split(delimiter)) if (dir) seen.add(dir)
  return [...seen].join(delimiter)
}

export function fixShellPath(env: NodeJS.ProcessEnv = process.env): void {
  if (process.platform === 'win32') return
  let fromShell = ''
  try {
    const shell = env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    const out = execFileSync(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
      encoding: 'utf-8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    fromShell = out.split(MARK)[1] ?? ''
  } catch {
    // shell lento ou quebrado: fica so com os diretorios comuns
  }
  env.PATH = mergePath(env.PATH, fromShell, commonDirs(homedir()).join(delimiter))
}
