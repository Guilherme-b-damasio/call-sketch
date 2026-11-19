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

O modo pode ser trocado na página durante a conversa.

**Modos próprios:** crie uma pasta com arquivos `.md` (veja os de `src/call_sketch/modes/`) e rode com `--modes-dir pasta`. Um arquivo com o mesmo nome de um modo padrão substitui esse modo.

## Instalação

Requisitos: Python 3.11+, Node.js (para o Claude Code) e Windows. No Linux deve funcionar, mas não foi testado. No macOS é preciso um driver de loopback, como o BlackHole.

```powershell
npm i -g @anthropic-ai/claude-code
claude.cmd          # uma vez: /login com a sua conta, depois /exit
```

```powershell
git clone <repo> call-sketch; cd call-sketch
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[gpu]"     # sem placa NVIDIA, tire o [gpu]
```

## Uso

```powershell
.venv\Scripts\call-sketch
```

A página abre em http://localhost:8765. Opções úteis:

| Opção | O que faz |
|---|---|
| `--mode brainstorm` | começa num modo fixo (padrão `auto`) |
| `--model opus` | desenho mais caprichado e mais lento (padrão `sonnet`) |
| `--every 30` | segundos entre redesenhos (padrão 20) |
| `--check-every 0` | desliga o validador (padrão 30) |
| `--no-voice` | sem anúncio em voz |
| `--voice pt-BR-FranciscaNeural` | troca a voz |
| `--no-mic` | só o áudio do PC |
| `--backend api` | usa `ANTHROPIC_API_KEY` (pago) em vez do login; instale com `.[api]` |
| `--list-devices` | lista os dispositivos de áudio |
| `--list-modes` | lista os modos |

**Áudio:** ele ouve a **saída padrão** do Windows. Se a call toca em outro dispositivo, defina esse como padrão. A voz do call-sketch toca só para você; para o pessoal da call ouvir, é preciso um cabo virtual de áudio (ex: VB-Cable) como microfone.

**Uso do plano:** o desenho e a validação usam o seu limite do Claude. Se apertar, aumente `--every` e `--check-every`.

## Desenvolvimento

```powershell
.venv\Scripts\python -m pip install -e ".[gpu,api,dev]"
.venv\Scripts\python -m pytest
.venv\Scripts\python -m ruff check src tests
```

```
src/call_sketch/
  cli.py          linha de comando, liga as peças
  audio.py        captura (loopback + mic) e corte das frases nas pausas
  transcriber.py  Whisper (GPU/CPU)
  session.py      estado da sessão, filtro de eco
  llm.py          Claude via Claude Code (assinatura) ou API
  modes.py        carrega os modos (.md)
  sketcher.py     pede o diagrama e troca de modo
  validator.py    confere afirmações técnicas
  voice.py        anúncio em voz (edge-tts)
  server.py       página + API local
  modes/*.md      modos padrão
  web/index.html  página
```
