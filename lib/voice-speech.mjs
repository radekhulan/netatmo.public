import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/voice-speech.py', import.meta.url));

export function createVoiceSpeech(python, models, whisperDirectory) {
  let worker;

  function start() {
    const child = spawn(python, [script, models, '--whisper-directory', whisperDirectory], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', HF_HUB_OFFLINE: '1' },
    });
    const current = { child, pending: null };
    const lines = createInterface({ input: child.stdout });

    const settle = (error, result) => {
      const pending = current.pending;
      current.pending = null;
      if (!pending) return;
      clearTimeout(pending.timer);
      if (error) pending.reject(error);
      else pending.resolve(result);
    };
    const onExit = () => child.kill('SIGKILL');
    const stop = () => {
      if (worker === current) worker = null;
      settle(new Error('Hlasová služba neodpověděla.'));
      child.kill('SIGKILL');
      process.off('exit', onExit);
    };

    child.on('error', stop);
    child.on('exit', stop);
    child.stdin.on('error', stop);
    lines.on('line', (line) => {
      try {
        const result = JSON.parse(line);
        settle(result.error ? new Error('Neplatný hlasový požadavek.') : null, result);
      } catch {
        stop();
      }
    });
    current.request = (payload) => new Promise((resolve, reject) => {
      const timer = setTimeout(stop, 28_000);
      current.pending = { timer, resolve, reject };
      child.stdin.write(JSON.stringify(payload) + '\n');
    });
    process.once('exit', onExit);
    return current;
  }

  const request = (payload) => (worker ??= start()).request(payload);
  return {
    warm() {
      worker ??= start();
    },
    async transcribe(audio, language) {
      const result = await request({ operation: 'transcribe', audio: audio.toString('base64'), language });
      return String(result.text ?? '').slice(0, 400);
    },
    async interrupt(audio, language) {
      const result = await request({ operation: 'transcribe', audio: audio.toString('base64'), language, interrupt: true });
      return { transcript: String(result.text ?? '').slice(0, 400), engine: result.engine === 'vosk' ? 'vosk' : 'whisper' };
    },
    async prepare(text, language) {
      const result = await request({ operation: 'prepare', text: text.slice(0, 450), language });
      return typeof result.text === 'string' ? result.text : text;
    },
    async speak(text, voice, language) {
      const result = await request({ operation: 'speak', text: text.slice(0, 450), voice, language });
      return typeof result.audio === 'string' && result.audio.length <= 3_000_000 ? result.audio : null;
    },
  };
}
