#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

voice_dir=$(node --env-file-if-exists=.env -p 'require("node:path").resolve(process.env.STATE_DIR || ".state", "voice")')
umask 077
mkdir -p "$voice_dir"
python3 -m venv "$voice_dir/venv"
"$voice_dir/venv/bin/python" -m pip install --disable-pip-version-check -r tools/voice-requirements.txt
HF_HOME="$voice_dir/install-cache" HF_HUB_DISABLE_XET=1 "$voice_dir/venv/bin/python" tools/voice-speech.py --install "$voice_dir/models"
node --env-file-if-exists=.env tools/voice-assets.mjs
