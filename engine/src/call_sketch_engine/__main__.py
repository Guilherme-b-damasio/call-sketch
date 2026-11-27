"""Motor de audio do call-sketch.

Ouve o audio do PC + microfone, transcreve com Whisper e fala (anuncios). Conversa com o app por
linhas JSON: eventos saem no stdout, comandos entram no stdin. Logs vao pro stderr.

Eventos (stdout):
  {"type": "status", "msg": "..."}
  {"type": "ready", "device": "gpu"|"cpu", "sources": [{"who": "call", "name": "..."}]}
  {"type": "line", "id": 1, "who": "call"|"eu", "text": "...", "t": "12:00:01", "ts": 1.0, "speaker": 1}
  {"type": "remove", "ids": [1]}                      # eco do microfone descartado
  {"type": "speaking", "on": true, "text": "..."}
  {"type": "error", "msg": "..."}

Comandos (stdin):
  {"cmd": "say", "text": "...", "voice": "pt-BR-AntonioNeural"}
  {"cmd": "reset-speakers"}                           # call nova: volta a contar da Pessoa 1
  {"cmd": "stop"}
"""

from __future__ import annotations

import argparse
import json
import logging
import queue
import sys
import threading
from dataclasses import asdict
from typing import Any

from call_sketch_engine.echo import EchoFilter, Line

_out_lock = threading.Lock()
log = logging.getLogger("call_sketch_engine")


def emit(type_: str, **data: Any) -> None:
    with _out_lock:
        sys.stdout.write(json.dumps({"type": type_, **data}, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="call_sketch_engine")
    ap.add_argument("--whisper", default="auto", help="auto|small|medium|large-v3")
    ap.add_argument("--language", default="pt")
    ap.add_argument("--no-mic", action="store_true")
    ap.add_argument("--max-phrase", type=float, default=15.0)
    ap.add_argument("--speakers", default="", help="modelo .onnx de voz: separa quem fala na call")
    ap.add_argument("--list-devices", action="store_true")
    ap.add_argument("--check", action="store_true", help="so confere se as bibliotecas carregam (build)")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)

    if args.check:
        import ctranslate2, edge_tts, faster_whisper, miniaudio  # noqa: E401, F401, I001
        import onnxruntime  # noqa: F401
        import soundcard  # noqa: F401

        emit("check", ok=True, ctranslate2=ctranslate2.__version__, cuda=ctranslate2.get_cuda_device_count())
        return

    from call_sketch_engine.audio import AudioCapture, PhraseChunker, default_sources, list_devices

    if args.list_devices:
        emit("devices", **list_devices())
        return

    from call_sketch_engine.transcriber import Transcriber, load_whisper
    from call_sketch_engine.voice import Voice

    stop = threading.Event()
    muted = threading.Event()
    echo = EchoFilter()
    echo_lock = threading.Lock()

    speakers = None
    if args.speakers:
        try:
            from call_sketch_engine.speakers import SpeakerTracker

            speakers = SpeakerTracker(args.speakers)
        except Exception as e:
            log.warning("sem separar quem fala: %s", e)
            emit("status", msg="não deu pra carregar o modelo de vozes; segue sem separar quem fala")
    speakers_lock = threading.Lock()

    def on_text(who: str, text: str, audio=None) -> None:
        speaker = None
        if speakers and who == "call" and audio is not None:
            with speakers_lock:
                speaker = speakers.identify(audio)
        line = Line(who=who, text=text, speaker=speaker)
        with echo_lock:
            accepted, removed = echo.add(line)
        if removed:
            emit("remove", ids=removed)
        if accepted:
            emit("line", **asdict(line))

    emit("status", msg="carregando o Whisper...")
    model, device = load_whisper(args.whisper, args.language)

    audio_q: queue.Queue = queue.Queue()
    sources = default_sources(not args.no_mic)
    if not sources:
        emit("error", msg="nenhum dispositivo de audio para ouvir (sem som do sistema e sem microfone)")
        sys.exit(2)
    for who, dev, _name in sources:
        AudioCapture(who, dev, audio_q, PhraseChunker(max_sec=args.max_phrase), muted, stop).start()
    Transcriber(model, audio_q, args.language, on_text, stop).start()
    voice = Voice(muted, lambda on, text: emit("speaking", on=on, text=text))
    voice.start()
    emit("ready", device=device, sources=[{"who": w, "name": n} for w, _, n in sources])

    for raw in sys.stdin:  # termina quando o app fecha o stdin (ou morre)
        if not raw.strip():
            continue
        try:
            cmd = json.loads(raw)
        except json.JSONDecodeError:
            emit("error", msg=f"comando invalido: {raw.strip()[:100]}")
            continue
        if cmd.get("cmd") == "say" and cmd.get("text"):
            voice.say(cmd["text"], cmd.get("voice") or "pt-BR-AntonioNeural")
        elif cmd.get("cmd") == "reset-speakers" and speakers:
            with speakers_lock:
                speakers.reset()
        elif cmd.get("cmd") == "stop":
            break
    stop.set()


if __name__ == "__main__":
    main()
