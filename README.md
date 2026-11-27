# call-sketch

Ouve a conversa (Discord, Meet, Zoom, qualquer áudio que sai do PC, mais o seu microfone), transcreve no seu PC com Whisper, e o **Claude transforma as falas em diagramas ao vivo**. Quando escolhe ou troca de modo, ele avisa em voz. Um segundo Claude confere as afirmações técnicas e aponta o que estiver errado.

Cada pessoa roda no próprio PC e usa **a própria IA**: o login da assinatura no Claude Code (padrão, sem custo de API), uma chave da Anthropic ou [outra IA](#outras-ias), inclusive um modelo grátis rodando no próprio PC.

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

No canvas: roda do mouse dá zoom e arrastar o fundo move. Dá pra copiar o código Mermaid ou **exportar** o desenho inteiro em PNG, PDF ou SVG (botão de download na barra; quem assiste pelo navegador baixa PNG e SVG). A caixa de texto embaixo da conversa manda notas e correções direto pro desenho.

### Editar à mão

Fluxogramas (arquitetura, processo, decisão, daily), mapas mentais (brainstorm) e diagramas de dados abrem num editor de caixas:

- **Arraste** as caixas para onde quiser. A arrumação fica salva na aba, e quem assiste a sessão vê igual.
- **Duplo clique** numa caixa ou numa ligação edita o texto. No fundo, cria uma caixa nova. Numa entidade, o nome vai na primeira linha e cada campo numa linha (`int id PK`).
- **Puxe das bolinhas** que aparecem na borda da caixa até outra caixa para ligar. No mapa mental, isso muda o galho de lugar.
- **Del** apaga o que estiver selecionado e **Ctrl+Z** desfaz.
- **Travar** (cadeado na barra) marca caixas que a IA não deve mudar. A varinha **reorganiza** tudo de novo.

A IA continua desenhando por cima das suas mudanças: ela recebe o diagrama já editado. Sequência e cronograma seguem desenhados pelo Mermaid (só dá pra mudar pelo código ou pedindo na caixa de texto).

## Sessão compartilhada

Para todo mundo da call acompanhar o desenho ao vivo: clique no ícone de transmissão no topo e em **Compartilhar**. O app gera um link; mande no chat da call.

- **Quem abre no navegador** vê o diagrama atualizando sozinho, sem instalar nada.
- **Quem tem o Call Sketch instalado** pode clicar em "Abrir no app" na página, ou colar o link em **Entrar numa sessão**. Enquanto assiste, a escuta dessa pessoa fica pausada (não gasta a IA dela).
- **Flutuar** deixa o diagrama numa janelinha sempre por cima da call. No app instalado funciona sempre; no navegador, no Chrome e no Edge do computador pelo link público (https). Firefox, Safari e celular ainda não têm esse recurso.
- Só o **desenho** é compartilhado. A transcrição da conversa nunca sai do seu PC.

Não tem servidor nosso no meio. O seu próprio app serve a página, e um túnel grátis da Cloudflare (o `cloudflared`, baixado sozinho no primeiro uso, sem conta nem cadastro) deixa o link acessível pela internet. Também aparece um link da rede local, para quem está no mesmo Wi-Fi ou escritório. O link tem um código aleatório, muda a cada sessão e para de funcionar quando você para de compartilhar ou fecha o app.

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
cd ..\app; npm install
npm run dev
```

O app acha o motor em `engine/.venv` sozinho. Tudo o mais fica em Configurações: assinatura ou chave de API, modelo, intervalos, voz, microfone, tamanho do Whisper e idioma.

**Áudio:** ele ouve a **saída padrão** do Windows. Se a call toca em outro dispositivo, defina esse como padrão. A voz do call-sketch toca só para você; para o pessoal da call ouvir, é preciso um cabo virtual de áudio (ex: VB-Cable) como microfone.

**Uso do plano:** o desenho e a validação usam o seu limite do Claude. Se apertar, aumente os intervalos nas configurações.

### Outras IAs

Em Configurações, **Conexão → Outra IA** aceita qualquer serviço no formato da API da OpenAI. Escolha o provedor, cole a chave (se ele pedir), clique em **Listar** para ver os modelos e em **Testar** antes de salvar.

| Provedor | Custo | Observação |
|---|---|---|
| Ollama / LM Studio | grátis, offline | roda no seu PC; com GPU fica rápido, só na CPU pode levar 10 a 20s por desenho |
| Groq | plano grátis | muito rápido |
| Google Gemini | plano grátis | chave no Google AI Studio |
| OpenRouter | grátis e pago | muitos modelos com uma chave só |
| OpenAI, DeepSeek, Mistral... | na sua conta | DeepSeek e Mistral pelo "Outro endereço" |

Modelos pequenos (7 ou 8B) erram o Mermaid com mais frequência. Quando o desenho não renderiza, o app manda o erro de volta para a IA corrigir. Com Ollama, `qwen2.5:7b` é um bom começo; com GPU boa, tente um de 14B ou mais.

## Instalador (para quem não programa)

Baixe na página de [Releases](https://github.com/Guilherme-b-damasio/call-sketch/releases): Windows (`.exe`), macOS Apple Silicon (`.dmg`) e Linux (`.deb` e `.AppImage`). As instruções de cada sistema estão na release. Quem instala ainda precisa de uma IA: o Claude Code logado, uma chave de API ou um modelo local (veja [Outras IAs](#outras-ias)).

**macOS:** não existe captura nativa do som do sistema. Instale o [BlackHole](https://existential.audio/blackhole/) e crie um dispositivo de saída múltipla com os alto-falantes + BlackHole; o app acha o BlackHole sozinho.

Para gerar uma release, crie um tag `v*` (ex: `git tag v0.3.1 && git push origin v0.3.1`). O GitHub Actions compila nos três sistemas e publica. Para gerar só no seu PC:

```powershell
cd engine; .venv\Scripts\python -m pip install pyinstaller; .venv\Scripts\python build.py
cd ..\app; npm run dist:win        # ou dist:mac / dist:linux, no próprio sistema
```

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
