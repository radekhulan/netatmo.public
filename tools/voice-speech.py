import argparse
import base64
import hashlib
import io
import json
import sys
import tempfile
import wave
from pathlib import Path
from urllib.request import urlretrieve
from zipfile import ZipFile
from voice_text import prepare_piper_text, prepare_voice_text


INTERRUPT_MODEL = "vosk-model-small-cs-0.4-rhasspy"
INTERRUPT_MODEL_SHA256 = "287c3bbefc8ad67b4ab9636eecef3d62acc3719990777d03e226db5a7f19fbda"
PIPER_VOICES = {
    "jirka": "cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx",
    "kasandra": "cs/cs_CZ/kasandra/medium/cs_CZ-kasandra-medium.onnx",
    "honza": "honza/medium/model.onnx",
    "lessac": "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    "thai": "thai/th_TH-mms_female-medium.onnx",
}


def install(root):
    from huggingface_hub import snapshot_download

    snapshot_download(
        "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
        revision="0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
        local_dir=root / "whisper-turbo",
        allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.json", "preprocessor_config.json"],
    )
    snapshot_download(
        "rhasspy/piper-voices",
        revision="04ca88f5685ca5253c701af3687e155b113bd512",
        local_dir=root / "piper",
        allow_patterns=[file for name in ("jirka", "kasandra", "lessac")
                        for file in (PIPER_VOICES[name], PIPER_VOICES[name] + ".json")],
    )
    snapshot_download(
        "Thomcles/Piper-TTS-Czech",
        revision="0d6eae08ca2873dbaaed94bd2cd556b1afebf1db",
        local_dir=root / "piper" / "honza",
        allow_patterns=["medium/model.onnx", "medium/model.onnx.json"],
    )
    snapshot_download(
        "tranhuyluyen/piper-voices-thai",
        revision="3f78c561e47fc5692f369a2ff65ad2139a7e6c3d",
        local_dir=root / "piper" / "thai",
        allow_patterns=["th_TH-mms_female-medium.onnx", "th_TH-mms_female-medium.onnx.json"],
    )
    target = root / INTERRUPT_MODEL
    if not (target / "am" / "final.mdl").is_file():
        with tempfile.TemporaryDirectory(dir=root) as directory:
            staging = Path(directory)
            archive = staging / "model.zip"
            urlretrieve(f"https://alphacephei.com/vosk/models/{INTERRUPT_MODEL}.zip", archive)
            with archive.open("rb") as file:
                if hashlib.file_digest(file, "sha256").hexdigest() != INTERRUPT_MODEL_SHA256:
                    raise ValueError("Invalid interrupt model checksum")
            with ZipFile(archive) as zip_file:
                zip_file.extractall(staging)
            (staging / INTERRUPT_MODEL).rename(target)


def read_audio(encoded):
    with wave.open(io.BytesIO(base64.b64decode(encoded, validate=True)), "rb") as recording:
        if (recording.getnchannels(), recording.getsampwidth(), recording.getframerate()) != (1, 2, 16000):
            raise ValueError("Unsupported audio format")
        frames = recording.getnframes()
        if not 3200 <= frames <= 128000:
            raise ValueError("Unsupported audio length")
        samples = recording.readframes(frames)
        if len(samples) != frames * 2:
            raise ValueError("Incomplete audio")
    return samples


def load_interrupt_recognizer(root):
    path = root / INTERRUPT_MODEL
    if not (path / "am" / "final.mdl").is_file():
        return None
    from vosk import KaldiRecognizer, Model, SetLogLevel

    SetLogLevel(-1)
    model = Model(str(path))

    def recognize(samples):
        recognizer = KaldiRecognizer(model, 16000)
        recognizer.AcceptWaveform(samples)
        return json.loads(recognizer.FinalResult()).get("text", "")

    return recognize


def serve(root, whisper_directory):
    import numpy as np
    from faster_whisper import WhisperModel
    from piper import PiperVoice

    whisper = WhisperModel(str(whisper_directory), device="cpu", compute_type="int8",
                           cpu_threads=12 if whisper_directory.name == "whisper-turbo" else 4,
                           local_files_only=True)
    try:
        recognize_interrupt = load_interrupt_recognizer(root)
    except Exception as error:
        print(f"Could not load interrupt speech recognizer: {type(error).__name__}", file=sys.stderr)
        recognize_interrupt = None
    voices = {
        name: PiperVoice.load(root / "piper" / path)
        for name, path in PIPER_VOICES.items()
        if (root / "piper" / path).is_file() and (root / "piper" / (path + ".json")).is_file()
    }
    for line in sys.stdin:
        try:
            request = json.loads(line)
            language = request.get("language", "cs")
            if language not in ("cs", "en", "th"):
                raise ValueError("Unsupported language")
            if request["operation"] == "transcribe":
                samples = read_audio(request["audio"])
                interrupt = request.get("interrupt") is True
                if interrupt and language == "cs" and recognize_interrupt:
                    text = recognize_interrupt(samples)
                    engine = "vosk"
                else:
                    audio = np.frombuffer(samples, dtype="<i2").astype(np.float32) / 32768
                    segments, _ = whisper.transcribe(
                        audio, language=language, beam_size=3, vad_filter=not interrupt, condition_on_previous_text=False,
                        vad_parameters={"min_silence_duration_ms": 350, "speech_pad_ms": 220},
                        **({"temperature": 0.0, "without_timestamps": True, "max_new_tokens": 12} if interrupt else {}),
                    )
                    text = " ".join(segment.text.strip() for segment in segments if segment.avg_logprob >= -1)
                    engine = "whisper"
                result = {"text": text.strip()[:400], "engine": engine}
            elif request["operation"] in ("speak", "prepare"):
                text = request["text"]
                if not isinstance(text, str) or not 1 <= len(text) <= 450:
                    raise ValueError("Unsupported answer length")
                if request["operation"] == "prepare":
                    result = {"text": prepare_voice_text(text, language)}
                else:
                    voice = voices.get(request.get("voice"))
                    if voice is None:
                        raise ValueError("Voice unavailable")
                    output = io.BytesIO()
                    with wave.open(output, "wb") as wav:
                        voice.synthesize_wav(prepare_piper_text(text, language), wav)
                    result = {"audio": base64.b64encode(output.getvalue()).decode("ascii")}
            else:
                raise ValueError("Unknown operation")
            print(json.dumps(result, ensure_ascii=False), flush=True)
        except (ValueError, KeyError, TypeError, EOFError, wave.Error):
            print('{"error":"invalid_request"}', flush=True)


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--install", action="store_true")
    args.add_argument("--whisper-directory", type=Path)
    args.add_argument("models", type=Path)
    config = args.parse_args()
    if config.install:
        install(config.models)
    else:
        serve(config.models, config.whisper_directory or config.models / "whisper-turbo")
