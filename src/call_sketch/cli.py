"""Linha de comando: `call-sketch` (ou `python -m call_sketch`)."""

from __future__ import annotations

import argparse
import queue
import threading
import webbrowser
from pathlib import Path

from call_sketch.config import Settings
from call_sketch.modes import AUTO, load_modes


def parse_args(argv: list[str] | None = None) -> tuple[Settings, argparse.Namespace]:
    d = Settings()
    ap = argparse.ArgumentParser(prog="call-sketch",
                                 description="Transforma as falas da conversa em diagramas ao vivo.")
    ap.add_argument("--mode", default=d.mode, help="modo inicial: auto (padrao) ou um id de --list-modes")
    ap.add_argument("--modes-dir", type=Path, help="pasta com modos personalizados (*.md)")
    ap.add_argument("--backend", choices=["cli", "api"], default=d.backend,
                    help="cli = seu login do Claude Code (padrao); api = ANTHROPIC_API_KEY (pago)")
    ap.add_argument("--model", help="cli: sonnet|opus|haiku (padrao sonnet); api: id do modelo")
    ap.add_argument("--whisper", default=d.whisper, help="auto|small|medium|large-v3")
    ap.add_argument("--language", default=d.language, help="idioma da conversa (padrao pt)")
    ap.add_argument("--every", type=float, default=d.draw_every, help="segundos entre redesenhos")
    ap.add_argument("--check-every", type=float, default=d.check_every,
                    help="segundos entre validacoes; 0 desliga o validador")
    ap.add_argument("--no-mic", action="store_true", help="nao ouvir seu microfone, so o audio do PC")
    ap.add_argument("--no-voice", action="store_true", help="nao anunciar o modo em voz")
    ap.add_argument("--voice", default=d.voice_name,
                    help="voz do edge-tts (pt-BR-AntonioNeural, pt-BR-FranciscaNeural, ...)")
    ap.add_argument("--port", type=int, default=d.port)
    ap.add_argument("--no-browser", action="store_true", help="nao abrir o navegador")
    ap.add_argument("--list-devices", action="store_true", help="listar dispositivos de audio e sair")
    ap.add_argument("--list-modes", action="store_true", help="listar modos e sair")
    a = ap.parse_args(argv)
    s = Settings(
        backend=a.backend, model=a.model, whisper=a.whisper, language=a.language, mode=a.mode,
        modes_dir=a.modes_dir, draw_every=a.every, check_every=a.check_every, mic=not a.no_mic,
        voice=not a.no_voice, voice_name=a.voice, port=a.port, open_browser=not a.no_browser,
    )
    return s, a


def main(argv: list[str] | None = None) -> None:
    settings, args = parse_args(argv)
    modes = load_modes(settings.modes_dir)

    if args.list_modes:
        for m in modes.values():
            print(f"{m.id:14} {m.description}")
        return
    if args.list_devices:
        from call_sketch.audio import list_devices
        print(list_devices())
        return
    if settings.mode != AUTO and settings.mode not in modes:
        raise SystemExit(f"modo desconhecido: {settings.mode}. Veja --list-modes")

    # imports pesados so depois de tratar as opcoes rapidas
    from call_sketch.audio import AudioCapture, PhraseChunker, default_sources
    from call_sketch.llm import LLMError, make_llm
    from call_sketch.server import make_server
    from call_sketch.session import Session
    from call_sketch.sketcher import Sketcher
    from call_sketch.transcriber import Transcriber, load_whisper
    from call_sketch.validator import Validator
    from call_sketch.voice import Voice

    try:
        llm = make_llm(settings.backend, settings.model)
        print(f"claude: {llm.name} (verificando login...)")
        llm.check_login()
    except LLMError as e:
        raise SystemExit(f"Claude indisponivel: {e}\nSe for o login, rode `claude` e use /login.") from e

    stop = threading.Event()
    muted = threading.Event()
    session = Session(settings.mode)
    voice = Voice(settings.voice_name, muted, enabled=settings.voice)
    voice.start()

    def on_mode_selected(mode: str) -> None:
        already = mode == session.snapshot()["active_mode"]  # o automatico pode ter acabado de escolher
        session.set_mode(mode)
        if not already:
            voice.say("Modo automático. Vou escolher o melhor desenho conforme a conversa."
                      if mode == AUTO else modes[mode].announce)

    session.set_status(f"carregando whisper {settings.whisper}...")
    model = load_whisper(settings.whisper, settings.language)

    audio_q: queue.Queue = queue.Queue()
    for who, device, name in default_sources(settings.mic):
        print(f"{who}: {name}")
        chunker = PhraseChunker(max_sec=settings.max_phrase_sec)
        AudioCapture(who, device, audio_q, chunker, muted, stop).start()
    Transcriber(model, audio_q, session, settings.language, stop).start()
    Sketcher(llm, session, modes, settings.draw_every, lambda m: voice.say(m.announce), stop).start()
    if settings.check_every > 0:
        Validator(llm, session, settings.check_every, stop).start()

    server = make_server(settings.host, settings.port, session, modes, on_mode_selected)
    url = f"http://localhost:{settings.port}"
    session.set_status("ouvindo...")
    print(f"pagina: {url}  (Ctrl+C para sair)")
    if settings.open_browser:
        webbrowser.open(url)
    if settings.mode != AUTO:
        voice.say(modes[settings.mode].announce)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrando...")
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
