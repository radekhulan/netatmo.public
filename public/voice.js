import { language, t } from './i18n.js';

const dialog = document.getElementById('voice-dialog');
const title = document.getElementById('voice-title');
const transcript = document.getElementById('voice-transcript');
const feedback = document.getElementById('voice-feedback');
const toggles = [...document.querySelectorAll('[data-voice-toggle]')];
const voiceChoices = [...document.querySelectorAll('[data-voice-choice]')];
const recognitionChoice = document.querySelector('[data-voice-recognition]');
const recognitionPicker = document.getElementById('voice-recognition-picker');
const recognitionOptions = [...(recognitionPicker?.querySelectorAll('[data-recognition-provider]') ?? [])];
const recognitionNotice = document.getElementById('voice-recognition-unavailable');
const bars = [...dialog.querySelectorAll('.voice-wave i')];

const labels = {
  listening: 'Poslouchám', following: 'Můžeš pokračovat', working: 'Zpracovávám',
  speaking: 'Jarvis odpovídá', error: 'Asistent je nedostupný',
};
let armed = false;
let setup = 0;
let turn = 0;
let generation = 0;
let worker, stream, worklet, context, output, request, followUpId, frames, frameInFlight;
let speechInterrupt;
let focusOnly = false;
let phase = 'idle';
let ready = false;
let ambient = 0.004;
let heard = 0;
let quiet = 0;
let skipped = 0;
let waitFrames = 0;
let started = false;
let selectedVoice = 'kasandra';
let selectedRecognition = 'whisper';
let remoteRecognitionAvailable = false;

function setupVoiceChoices(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return;
  selectedVoice = voices[0].id;
  if (voices.length < 2) return;
  try {
    const saved = localStorage.getItem('panel-voice');
    if (voices.some(({ id }) => id === saved)) selectedVoice = saved;
  } catch {}
  for (const select of voiceChoices) {
    const cloud = voices.filter(({ provider }) => provider === 'elevenlabs');
    if (cloud.length) {
      const groups = [[t('Místní hlasy'), voices.filter(({ provider }) => provider !== 'elevenlabs')], ['ElevenLabs', cloud]];
      select.replaceChildren(...groups.filter(([, entries]) => entries.length).map(([name, entries]) => {
        const group = document.createElement('optgroup');
        group.label = name;
        const caption = document.createElement('legend');
        caption.textContent = name;
        group.append(caption, ...entries.map(({ id, name }) => new Option(name, id)));
        return group;
      }));
    } else select.replaceChildren(...voices.map(({ id, name }) => new Option(name, id)));
    select.value = selectedVoice;
    select.hidden = false;
    select.addEventListener('change', () => {
      selectedVoice = select.value;
      for (const choice of voiceChoices) choice.value = selectedVoice;
      try { localStorage.setItem('panel-voice', selectedVoice); } catch {}
    });
  }
}

function showRecognitionMode() {
  if (!recognitionChoice) return;
  const remote = selectedRecognition === 'elevenlabs';
  const title = t(remote ? 'Cloudový přepis' : 'Místní přepis') + (remote ? ' · ElevenLabs' : ' · Whisper');
  recognitionChoice.dataset.provider = selectedRecognition;
  recognitionChoice.title = title;
  recognitionChoice.setAttribute('aria-label', t('Přepis řeči') + ' · ' + title);
  for (const icon of recognitionChoice.querySelectorAll('[data-recognition-icon]')) {
    icon.hidden = icon.dataset.recognitionIcon !== selectedRecognition;
  }
  for (const option of recognitionOptions) {
    const selected = option.dataset.recognitionProvider === selectedRecognition;
    option.setAttribute('aria-pressed', String(selected));
    option.toggleAttribute('autofocus', selected);
    option.disabled = option.dataset.recognitionProvider === 'elevenlabs' && !remoteRecognitionAvailable;
  }
  if (recognitionNotice) recognitionNotice.hidden = remoteRecognitionAvailable;
}

function recognitionUnavailable() {
  selectedRecognition = 'whisper';
  remoteRecognitionAvailable = false;
  showRecognitionMode();
}

function setupRecognition(options, defaultProvider) {
  const cloud = Array.isArray(options) && options.find(({ id }) => id === 'elevenlabs');
  if (!recognitionChoice || !cloud) return;
  remoteRecognitionAvailable = cloud.available;
  selectedRecognition = cloud.available && defaultProvider === 'elevenlabs' ? 'elevenlabs' : 'whisper';
  try {
    const saved = localStorage.getItem('panel-voice-recognition');
    if (options.some(({ id, available }) => available && id === saved)) selectedRecognition = saved;
  } catch {}
  recognitionChoice.hidden = false;
  showRecognitionMode();
  const selectRecognition = (provider) => {
    selectedRecognition = provider;
    showRecognitionMode();
    try { localStorage.setItem('panel-voice-recognition', selectedRecognition); } catch {}
  };
  if (recognitionPicker?.hidePopover) {
    recognitionPicker.hidden = false;
    for (const option of recognitionOptions) option.addEventListener('click', () => {
      selectRecognition(option.dataset.recognitionProvider);
      recognitionPicker.hidePopover();
      recognitionChoice.focus();
    });
  } else {
    recognitionChoice.addEventListener('click', () => {
      if (remoteRecognitionAvailable) selectRecognition(selectedRecognition === 'whisper' ? 'elevenlabs' : 'whisper');
    });
  }
}

function show(next) {
  phase = next;
  dialog.dataset.phase = next;
  title.textContent = t(labels[next]);
  if (!dialog.open) dialog.showModal();
}

function indicate() {
  for (const button of toggles) {
    const label = t(armed && ready ? 'Vypnout hlasového asistenta' : 'Zapnout hlasového asistenta');
    button.setAttribute('aria-pressed', String(armed && ready));
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}

function resetWake() {
  worker?.postMessage({ type: 'reset', generation: ++generation });
}

function closeTurn(keepContext = false) {
  turn++;
  speechInterrupt = undefined;
  request?.abort();
  request = undefined;
  output?.stop();
  output = undefined;
  if (phase === 'speaking' || phase === 'error') globalThis.speechSynthesis?.cancel();
  if (keepContext !== true) followUpId = undefined;
  focusOnly = keepContext === true && Boolean(followUpId);
  frames = undefined;
  phase = 'idle';
  if (dialog.open) dialog.close();
  resetWake();
}

function disconnect() {
  setup++;
  closeTurn();
  ready = false;
  frameInFlight = false;
  worker?.terminate();
  worker = undefined;
  worklet?.disconnect();
  worklet?.port.close();
  worklet = undefined;
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  context?.close().catch(() => {});
  context = undefined;
  indicate();
}

function soundCue() {
  if (context?.state !== 'running') return;
  const note = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  note.frequency.setValueAtTime(580, now);
  note.frequency.setValueAtTime(790, now + 0.07);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  note.connect(gain).connect(context.destination);
  note.start(now);
  note.stop(now + 0.14);
}

function listen(following = false) {
  frames = [];
  heard = 0;
  quiet = 0;
  started = false;
  waitFrames = 0;
  skipped = 2;
  if (!following) {
    transcript.textContent = '';
    feedback.textContent = t('Řekni povel nebo se zeptej.');
  }
  show(following ? 'following' : 'listening');
  if (!following) soundCue();
}

function volume(samples) {
  let squared = 0;
  for (const sample of samples) squared += sample * sample;
  return Math.sqrt(squared / samples.length);
}

function checkInterrupt(monitor) {
  const audio = wav(monitor.frames);
  monitor.frames = [];
  monitor.heard = 0;
  monitor.quiet = 0;
  monitor.capturing = false;
  monitor.pending = fetch('/api/voice/interrupt', {
    method: 'POST', body: audio,
    headers: { 'Content-Type': 'audio/wav', 'X-Voice-Language': language, 'X-Voice-Name': selectedVoice,
      ...(monitor.contextId && { 'X-Voice-Context': monitor.contextId }) },
    signal: AbortSignal.any([monitor.signal, AbortSignal.timeout(4500)]),
  }).then((response) => response.ok ? response.json() : null).then(async (result) => {
    if (!result?.end || speechInterrupt !== monitor) return;
    closeTurn();
    if (!result.message) return;
    const id = turn;
    feedback.textContent = result.message;
    show('speaking');
    try {
      await play(result.audio, result.message, id);
    } finally {
      if (turn === id) closeTurn();
    }
  }).catch(() => {}).finally(() => {
    monitor.pending = undefined;
    if (speechInterrupt === monitor && monitor.gain && context) {
      monitor.gain.gain.setTargetAtTime(1, context.currentTime, 0.05);
    }
  });
}

function interruptFrame(monitor, samples) {
  if (monitor.pending) return;
  const active = volume(samples) > Math.max(0.009, Math.min(0.035, ambient * 3.5));
  monitor.frames.push(samples);
  if (!monitor.capturing) {
    monitor.heard = active ? monitor.heard + 1 : 0;
    if (monitor.heard < 2) {
      if (monitor.frames.length > 3) monitor.frames.shift();
      return;
    }
    monitor.capturing = true;
    if (monitor.gain && context) monitor.gain.gain.setTargetAtTime(0.28, context.currentTime, 0.03);
  }
  monitor.quiet = active ? 0 : monitor.quiet + 1;
  if (monitor.quiet >= 3 || monitor.frames.length >= 18) checkInterrupt(monitor);
}

function frame(samples) {
  if (!ready) return;
  if (speechInterrupt) {
    interruptFrame(speechInterrupt, samples);
    return;
  }
  if (phase === 'idle') {
    const level = volume(samples);
    if (level < Math.max(0.012, ambient * 2)) ambient = ambient * 0.97 + level * 0.03;
    if (!frameInFlight) {
      frameInFlight = true;
      worker.postMessage({ type: 'frame', generation, samples }, [samples.buffer]);
    }
    return;
  }
  if (phase !== 'listening' && phase !== 'following') return;
  if (skipped > 0) {
    skipped--;
    return;
  }
  const level = volume(samples);
  const active = level > Math.max(0.0045, Math.min(0.026, ambient * 3));
  const height = Math.min(1, level * 17);
  bars.forEach((bar, index) => bar.style.setProperty('--level', 0.25 + height * (index % 3 + 2) / 3));
  frames.push(samples);
  waitFrames++;
  if (!started) {
    heard = active ? heard + 1 : 0;
    if (heard >= 2) {
      started = true;
      if (phase === 'following') {
        transcript.textContent = '';
        feedback.textContent = t('Řekni další povel nebo dotaz.');
        show('listening');
      }
    } else {
      if (frames.length > 5) frames.shift();
      if (waitFrames >= 70) closeTurn(phase === 'following' || (phase === 'listening' && Boolean(followUpId)));
      return;
    }
  }
  quiet = active ? 0 : quiet + 1;
  if (quiet >= 9 || frames.length === 100) {
    const audio = wav(frames);
    frames = undefined;
    void submit(audio);
  }
}

function wav(chunks) {
  const length = chunks.length * 1280 * 2;
  const buffer = new ArrayBuffer(length + 44);
  const view = new DataView(buffer);
  function name(index, text) {
    for (const letter of text) view.setUint8(index++, letter.charCodeAt(0));
  }
  name(0, 'RIFF');
  view.setUint32(4, length + 36, true);
  name(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  name(36, 'data');
  view.setUint32(40, length, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) {
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * 32768))), true);
    offset += 2;
  }
  return buffer;
}

async function play(audio, message, id, monitor) {
  if (audio && context?.state === 'running') {
    try {
      const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(audio) : Uint8Array.from(atob(audio), (byte) => byte.charCodeAt(0));
      const decoded = await context.decodeAudioData(bytes.buffer);
      if (turn !== id) return;
      const source = context.createBufferSource();
      output = source;
      source.buffer = decoded;
      if (monitor) {
        monitor.gain = context.createGain();
        source.connect(monitor.gain).connect(context.destination);
      } else source.connect(context.destination);
      await new Promise((resolve) => {
        source.onended = resolve;
        source.start();
      });
      if (output === source) output = undefined;
      return;
    } catch {}
  }
  const synth = globalThis.speechSynthesis;
  const fallbackVoice = synth?.getVoices().find((voice) => voice.localService && voice.lang.toLowerCase().startsWith(language));
  if (!fallbackVoice || turn !== id) return;
  await new Promise((resolve) => {
    const speech = new SpeechSynthesisUtterance(message);
    const timer = setTimeout(resolve, 18_000);
    speech.voice = fallbackVoice;
    speech.onend = speech.onerror = () => { clearTimeout(timer); resolve(); };
    synth.speak(speech);
  });
}

async function submit(audio) {
  const id = ++turn;
  const voice = selectedVoice;
  const controller = new AbortController();
  request = controller;
  let final;
  let message;
  let clientAction;
  show('working');
  feedback.textContent = t('Přepisuji povel…');
  try {
    const response = await fetch('/api/voice/command', {
      method: 'POST', body: audio,
      headers: { 'Content-Type': 'audio/wav', 'X-Voice-Name': voice, 'X-Voice-Language': language,
        'X-Voice-Recognition': selectedRecognition,
        ...(followUpId && { 'X-Voice-Context': followUpId }),
        ...(focusOnly && { 'X-Voice-Focus-Only': '1' }) },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(95_000)]),
    });
    followUpId = undefined;
    if (!response.ok) throw new Error((await response.json()).error);
    let pending = '';
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      if (turn !== id) return;
      pending += chunk;
      if (pending.length > 3_100_000) throw new Error('Hlasová odpověď je příliš dlouhá.');
      let lineEnd;
      while ((lineEnd = pending.indexOf('\n')) !== -1) {
        const event = JSON.parse(pending.slice(0, lineEnd));
        pending = pending.slice(lineEnd + 1);
        if (event.phase === 'heard') {
          transcript.textContent = '„' + event.transcript + '“';
          if (event.recognitionUnavailable) recognitionUnavailable();
        }
        if (event.phase === 'working') feedback.textContent = event.message;
        if (event.phase === 'client') {
          clientAction = event.action;
          feedback.textContent = event.message;
        }
        if (event.phase === 'answer') {
          message = event.message;
          feedback.textContent = message;
          show(event.failed ? 'error' : 'speaking');
        }
        if (event.phase === 'result') final = event;
      }
    }
    if (final?.client && clientAction) {
      const result = await new Promise((resolve) => {
        const actionTimeout = new AbortController();
        const signal = AbortSignal.any([controller.signal, actionTimeout.signal]);
        const done = (value) => { clearTimeout(timer); controller.signal.removeEventListener('abort', cancel); resolve(value); };
        const cancel = () => done(null);
        const timer = setTimeout(() => {
          actionTimeout.abort();
          done({ message: 'Spotify neodpovědělo včas.', failed: true });
        }, 16_000);
        controller.signal.addEventListener('abort', cancel, { once: true });
        document.dispatchEvent(new CustomEvent('panel-voice-client-action', { detail: { action: clientAction, resolve: done, signal } }));
      });
      if (turn !== id || !result) return;
      message = language === 'cs' ? result.message : t(result.failed ? 'Spotify je nedostupné.' : 'Spotify potvrdilo akci.');
      feedback.textContent = message;
      show(result.failed ? 'error' : 'speaking');
      const response = await fetch('/api/voice/speak', {
        method: 'POST', body: JSON.stringify({ text: message, voice, historyId: final.historyId, failed: result.failed === true }),
        headers: { 'Content-Type': 'application/json', 'X-Voice-Language': language },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      }).then((reply) => reply.ok ? reply.json() : null).catch(() => null);
      final.audio = response?.audio;
    }
    if (!final || !message) throw new Error('Odpověď se přerušila.');
    if (final.changed) document.dispatchEvent(new Event('panel-voice-changed'));
    const monitor = final.end ? undefined : { signal: controller.signal, contextId: final.context,
      frames: [], heard: 0, quiet: 0, capturing: false };
    speechInterrupt = monitor;
    await play(final.audio, message, id, monitor);
    if (monitor && speechInterrupt === monitor) {
      if (!monitor.pending && monitor.capturing) checkInterrupt(monitor);
      if (monitor.pending) await monitor.pending;
      if (speechInterrupt === monitor) speechInterrupt = undefined;
    }
    if (turn !== id) return;
    if (final.end) {
      closeTurn();
      return;
    }
    followUpId = final.context;
    focusOnly = false;
    listen(true);
  } catch (error) {
    if (turn !== id) return;
    show('error');
    feedback.textContent = error.message || 'Povel se nepodařilo dokončit.';
    setTimeout(() => { if (turn === id) closeTurn(); }, 2800);
  } finally {
    if (request === controller) request = undefined;
  }
}

function fail(message) {
  armed = false;
  disconnect();
  transcript.textContent = '';
  feedback.textContent = t(message);
  show('error');
}

async function connect() {
  if (context || document.hidden) return;
  const id = ++setup;
  const audio = new AudioContext({ latencyHint: 'interactive' });
  context = audio;
  const resumed = audio.resume();
  resumed.catch(() => {});
  try {
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (setup !== id) {
      microphone.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = microphone;
    await Promise.all([resumed, audio.audioWorklet.addModule('/voice-mic.js')]);
    if (setup !== id) return;
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (setup === id) fail('Přístup k mikrofonu se přerušil.');
    }, { once: true });
    worklet = new AudioWorkletNode(audio, 'panel-voice-mic', { numberOfOutputs: 0 });
    worklet.port.onmessage = ({ data }) => frame(data);
    audio.createMediaStreamSource(stream).connect(worklet);
    worker = new Worker('/voice-worker.js', { type: 'module' });
    worker.onerror = () => fail('Model probouzecí fráze se nenačetl.');
    worker.onmessage = ({ data }) => {
      if (setup !== id) return;
      if (data.type === 'ready') {
        ready = true;
        indicate();
        resetWake();
      }
      if (data.type === 'frame') {
        frameInFlight = false;
        if (data.wake && data.generation === generation && phase === 'idle' && !request) listen();
      }
      if (data.type === 'error') fail('Model probouzecí fráze se nenačetl.');
    };
    worker.postMessage({ type: 'load' });
  } catch (error) {
    if (setup === id) fail(error.name === 'NotAllowedError'
      ? 'Povol panelu přístup k mikrofonu v nastavení Chromu.'
      : 'Mikrofon se nepodařilo zapnout.');
  }
}

for (const button of toggles) button.addEventListener('click', () => {
  if (armed && !ready && context) {
    context.resume().catch(() => {});
    return;
  }
  armed = !armed;
  indicate();
  if (armed) void connect();
  else disconnect();
});
for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, () => {
  if (armed && context?.state === 'suspended') context.resume().catch(() => {});
}, { capture: true });
document.getElementById('voice-close').addEventListener('click', closeTurn);
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeTurn(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) disconnect();
  else if (armed) void connect();
});
window.addEventListener('pagehide', disconnect);
window.addEventListener('pageshow', (event) => {
  if (event.persisted && armed && !document.hidden && !context) void connect();
});

if (navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && window.Worker) {
  fetch('/api/voice/config', { cache: 'no-store', headers: { 'X-Voice-Language': language }, signal: AbortSignal.timeout(5000) })
    .then((response) => response.json())
    .then(async ({ enabled, voices, recognitionOptions, recognitionDefault }) => {
      if (!enabled) return;
      for (const button of toggles) button.hidden = false;
      setupVoiceChoices(voices);
      setupRecognition(recognitionOptions, recognitionDefault);
      const start = setup;
      let permission;
      try { permission = await navigator.permissions?.query({ name: 'microphone' }); } catch {}
      if (setup === start && !armed && permission?.state !== 'denied') {
        armed = true;
        indicate();
        void connect();
      }
    })
    .catch(() => {});
}
