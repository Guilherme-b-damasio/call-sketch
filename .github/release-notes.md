Ouve a call, transcreve no seu PC e uma IA transforma as falas em diagramas ao vivo.

## Novidades na 0.4.0

- **Sessão compartilhada:** clique no ícone de transmissão e mande o link para a call. Quem abre no navegador acompanha o diagrama ao vivo, sem instalar nada; quem tem o app abre direto nele. Só o desenho é compartilhado, a conversa nunca sai do seu PC, e não há servidor no meio (um túnel grátis da Cloudflare, sem conta).
- **Flutuar:** quem assiste pode deixar o diagrama numa janelinha sempre por cima da call.
- **Outras IAs:** além do Claude, qualquer IA no formato da OpenAI: Ollama e LM Studio no seu PC (grátis e offline), Groq, Gemini, OpenRouter, OpenAI e outras. Com listar modelos e testar conexão nas configurações.
- **Botão de limpar** o desenho e a conversa.
- **Ícone novo e animação de abertura.**

## Antes de instalar

Você precisa de uma IA. O padrão é o **Claude Code logado na sua conta**:

```
npm i -g @anthropic-ai/claude-code
claude        # uma vez: /login, depois /exit
```

Ou, nas configurações do app: uma chave da Anthropic, ou **Outra IA** (um modelo local pelo Ollama/LM Studio ou a chave de um provedor como Groq ou Gemini).

## Downloads

| Sistema | Arquivo |
|---|---|
| Windows 10/11 | `CallSketch-*-windows-setup.exe` |
| macOS (Apple Silicon: M1 em diante) | `CallSketch-*-mac-arm64.dmg` |
| Linux (Ubuntu, Debian e derivados) | `.deb` |
| Linux (qualquer distro) | `.AppImage` |

**Windows:** o instalador não é assinado, então o SmartScreen pode avisar. Clique em *Mais informações* → *Executar assim mesmo*.

**macOS:** sem certificado da Apple, o sistema bloqueia na primeira vez. Depois de arrastar para Aplicativos, rode no Terminal:
```
xattr -cr "/Applications/Call Sketch.app"
```
O macOS não deixa capturar o som do sistema direto. Para ouvir a call, instale o [BlackHole](https://existential.audio/blackhole/) e crie um *Dispositivo de saída múltipla* (Configuração de Áudio MIDI) com os alto-falantes + BlackHole. Sem isso, o app ouve só o microfone.

**Linux:** no AppImage, dê permissão de execução (`chmod +x`). Em algumas distros com AppArmor (Ubuntu 24.04+), use o `.deb` ou rode com `--no-sandbox`.

## Observações

- A transcrição roda **no processador** nesta versão (modelo Whisper *small*). Na primeira vez o app baixa o modelo (~250 MB).
- O desenho e a validação usam o limite do seu plano ou da sua chave; dá para espaçar nas configurações.
