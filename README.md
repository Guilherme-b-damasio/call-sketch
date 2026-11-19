# call-sketch

Ouve a conversa (Discord, Meet, Zoom, qualquer áudio que sai do PC, mais o seu microfone), transcreve no seu PC com Whisper, e o **Claude transforma as falas em diagramas ao vivo**. Quando escolhe ou troca de modo, ele avisa em voz. Um segundo Claude confere as afirmações técnicas e aponta o que estiver errado.

Cada pessoa roda no próprio PC e usa **o próprio Claude**: o login da assinatura no Claude Code (padrão, sem custo de API) ou uma API key própria.

## Modos

| Modo | Desenha | Quando |
|---|---|---|
| `auto` | o Claude escolhe e avisa em voz quando troca | padrão |
| `brainstorm` | mapa mental | chuva de ideias |
| `daily` | um bloco por pessoa: ✅ feito, 🔜 próximo, ⛔ bloqueio | reunião de status |
| `arquitetura` | componentes, bancos, filas e conexões | desenho de sistema |
| `processo` | passo a passo com decisões | fluxos, regras de negócio |
| `sequencia` | diagrama de sequência | integrações, chamadas entre sistemas |
| `dados` | diagrama entidade-relacionamento | modelagem de banco |
| `planejamento` | linha do tempo | roadmap, fases, sprints |
| `decisao` | opções com prós e contras | escolher entre alternativas |

O modo pode ser trocado na barra do app durante a conversa.

**Modos próprios:** em Configurações → Modos → *Abrir pasta*, crie um `.md` no formato dos que estão em `app/resources/modes/`. Um arquivo com o mesmo nome de um modo padrão substitui esse modo.

## Como é

Um app desktop (Electron + React) com o diagrama no centro, a conversa e a validação ao lado, e uma janela flutuante (sempre por cima) para deixar em cima da call.

| Atalho | O que faz |
|---|---|
| `Ctrl+Shift+D` | redesenha agora |
| `Ctrl+Shift+P` | pausa / continua |
| `Ctrl+Shift+O` | janela flutuante |

No canvas: roda do mouse dá zoom, arrastar move, duplo clique enquadra. Dá pra copiar o código Mermaid ou salvar o SVG. A caixa de texto embaixo da conversa manda notas e correções direto pro desenho.

## Instalação (desenvolvimento)

Requisitos: Windows, Python 3.11+ e Node.js 22+. No macOS é preciso um driver de loopback, como o BlackHole.

```powershell
npm i -g @anthropic-ai/claude-code
claude.cmd          # uma vez: /login com a sua conta, depois /exit
```

```powershell
git clone git@github.com:Guilherme-b-damasio/call-sketch.git; cd call-sketch
cd engine; python -m venv .venv
.venv\Scripts\python -m pip install -e ".[gpu,dev]"     # sem placa NVIDIA, tire o gpu
cd ..pp; npm install
npm run dev
```

O app acha o motor em `engine/.venv` sozinho. Tudo o mais fica em Configurações: assinatura ou chave de API, modelo, intervalos, voz, microfone, tamanho do Whisper e idioma.

**Áudio:** ele ouve a **saída padrão** do Windows. Se a call toca em outro dispositivo, defina esse como padrão. A voz do call-sketch toca só para você; para o pessoal da call ouvir, é preciso um cabo virtual de áudio (ex: VB-Cable) como microfone.

**Uso do plano:** o desenho e a validação usam o seu limite do Claude. Se apertar, aumente os intervalos nas configurações.

## Instalador (para quem não programa)

```powershell
engineuild.ps1            # empacota o motor com PyInstaller em engine/dist
cd app; npm run dist         # gera app/dist/CallSketch-Setup-x.y.z.exe
```

Quem instala ainda precisa do Claude Code logado (ou de uma chave de API).

## Desenvolvimento

```powershell
cd engine; .venv\Scripts\python -m pytest; .venv\Scripts\ruff check src tests
cd app; npm run typecheck; npm test
```

```
engine/                      motor de áudio em Python (fala JSON por stdin/stdout)
  audio.py                   captura (loopback + mic) e corte das frases nas pausas
  transcriber.py             Whisper (GPU/CPU) e filtro de alucinações
  echo.py                    tira do mic o eco do som da call
  voice.py                   anúncio em voz (edge-tts)
app/
  src/main/                  processo principal: Claude, modos, desenho, validação, estado
  src/preload/               ponte segura entre main e interface
  src/renderer/              interface React + Tailwind + Motion, Mermaid sob demanda
  src/shared/types.ts        tipos comuns
  resources/modes/*.md       modos padrão
```
