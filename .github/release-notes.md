Ouve a call, transcreve no seu PC e o Claude transforma as falas em diagramas ao vivo.

## Antes de instalar

Você precisa do **Claude Code logado na sua conta** (ou de uma chave da API, que se coloca nas configurações do app):

```
npm i -g @anthropic-ai/claude-code
claude        # uma vez: /login, depois /exit
```

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
- O desenho e a validação usam o limite do seu plano do Claude; dá para espaçar nas configurações.
