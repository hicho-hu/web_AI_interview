"""Check configured streaming TTS and ASR using a synthetic sentence; never save audio or keys."""
import argparse
import base64
import json
import logging
import subprocess
import sys
import threading
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backend", type=Path)
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    logging.disable(logging.CRITICAL)
    sys.path.insert(0, str(args.source or args.backend))
    from app.core.config import Settings
    from app.providers.dashscope_tts import DashScopeTTS
    from app.providers.live import audio_turn, live_sink
    from app.providers.qwen_realtime import connect, endpoint

    settings = Settings(_env_file=args.backend / ".env")
    if not endpoint(settings) or settings.tts_provider != "dashscope":
        raise RuntimeError("Configured providers do not support this streaming probe")
    began = time.monotonic()
    first_audio = []
    def sink(event):
        if event["type"] == "audio" and not first_audio:
            first_audio.append(time.monotonic())
    token = live_sink.set(sink)
    turn = audio_turn.set("synthetic-probe")
    try:
        result = DashScopeTTS(settings).synthesize("您好，请简要介绍一下你最近负责的项目。")
    finally:
        live_sink.reset(token)
        audio_turn.reset(turn)
    tts_finished = time.monotonic()
    assert first_audio, "No streaming audio received"
    audio = base64.b64decode(result["data"]["audio_base64"])
    converted = subprocess.run([settings.ffmpeg_bin, "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                               input=audio, capture_output=True, check=True, cwd=args.backend, timeout=10).stdout
    connected = time.monotonic()
    ws = connect(settings, "zh-CN")
    ready, done = threading.Event(), threading.Event()
    partial, final, errors = [], [], []
    def receive():
        try:
            while True:
                event = json.loads(ws.recv())
                if event["type"] == "session.updated": ready.set()
                elif event["type"] == "conversation.item.input_audio_transcription.text": partial.append(time.monotonic())
                elif event["type"] == "conversation.item.input_audio_transcription.completed": final.append(event.get("transcript", ""))
                elif event["type"] == "session.finished": done.set(); return
                elif event["type"] in ("error", "conversation.item.input_audio_transcription.failed"):
                    errors.append("provider_rejected"); ready.set(); done.set(); return
        except Exception:
            errors.append("connection_failed"); ready.set(); done.set()
    thread = threading.Thread(target=receive, daemon=True)
    thread.start()
    try:
        assert ready.wait(10) and not errors, "Realtime ASR initialization failed"
        speaking = time.monotonic()
        pcm = converted + b"\x00" * 25600
        for i in range(0, len(pcm), 6400):
            ws.send(json.dumps({"type": "input_audio_buffer.append", "event_id": str(i), "audio": base64.b64encode(pcm[i:i + 6400]).decode()}))
            time.sleep(0.2)
        stopped = time.monotonic()
        ws.send(json.dumps({"type": "session.finish", "event_id": "finish"}))
        assert done.wait(10) and not errors and any(final), "Realtime ASR did not finalize"
        finished = time.monotonic()
        report = {"synthetic_only": True, "tts_first_audio_ms": round((first_audio[0] - began) * 1000),
                  "tts_full_audio_ms": round((tts_finished - began) * 1000),
                  "asr_connect_ms": round((speaking - connected) * 1000),
                  "asr_first_caption_ms": round((partial[0] - speaking) * 1000) if partial else None,
                  "asr_finalize_after_audio_ms": round((finished - stopped) * 1000),
                  "transcribed_characters": sum(map(len, final))}
        destination = Path(__file__).resolve().parents[1] / "test-results" / "live-provider.json"
        destination.parent.mkdir(exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report), flush=True)
    finally:
        ws.close()
        thread.join(timeout=2)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": getattr(error, "code", type(error).__name__), "message": "Synthetic streaming provider verification failed"}), flush=True)
        sys.exit(1)
