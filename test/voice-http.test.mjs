import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createVoiceHttp } from '../lib/voice-http.mjs';

const origin = 'https://panel.invalid';

async function fixture(t, { extraEnv = {}, fetchElevenLabs } = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), 'panel-voice-test-'));
  const python = join(stateDir, 'speech');
  const pidFile = join(stateDir, 'speech.pid');
  const socket = join(stateDir, 'codex.sock');
  const requests = [];
  const calls = [];
  const problems = [];
  const warnings = [];
  const mockCodex = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    const input = JSON.parse(Buffer.concat(parts));
    requests.push(input);
    const proposed = {
      'Nastav na fialový odstín.': ['light.color', { value: 'purple' }],
      'Rozsviť všude.': ['light.allOff', {}],
      'Vypni kávovar.': ['coffee.wake', {}],
      'Vysaj celý dům v obýváku.': ['vacuum.start', { mode: 'vacuum', wholeHome: true }],
      'Ztlum ji o deset procent.': ['light.brightness', { value: 10 }],
    }[input.question];
    const reply = proposed ? { answer: '', operation: proposed[0], args: JSON.stringify(proposed[1]) }
      : { answer: 'Příkon je 273,7 wattů.', operation: '', args: '' };
    response.end(JSON.stringify(reply));
  });
  mockCodex.listen(socket);
  await once(mockCodex, 'listening');
  const files = ['models/whisper/model.bin', 'models/piper/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx',
    'models/piper/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx.json',
    'models/piper/cs/cs_CZ/kasandra/medium/cs_CZ-kasandra-medium.onnx',
    'models/piper/cs/cs_CZ/kasandra/medium/cs_CZ-kasandra-medium.onnx.json', 'assets/melspectrogram.onnx',
    'assets/embedding_model.onnx', 'assets/hey_jarvis_v0.1.onnx', 'assets/ort.wasm.min.mjs',
    'assets/ort-wasm-simd-threaded.mjs', 'assets/ort-wasm-simd-threaded.wasm'];
  await Promise.all(files.map(async (file) => {
    const path = join(stateDir, 'voice', file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '');
  }));
  await writeFile(python, `#!/usr/bin/env python3
import base64, json, os, sys
with open(${JSON.stringify(pidFile)}, 'w') as f:
    f.write(str(os.getpid()))
for line in sys.stdin:
    item = json.loads(line)
    if item['operation'] == 'transcribe':
        text = base64.b64decode(item['audio'])[44:].split(b'\\0', 1)[0].decode()
        print(json.dumps({'text': text}), flush=True)
    elif item['operation'] == 'prepare':
        print(json.dumps({'text': item['text']}), flush=True)
    else:
        print(json.dumps({'audio': base64.b64encode(item['voice'].encode()).decode()}), flush=True)
`, { mode: 0o700 });
  const devices = [
    { id: 9102, name: 'Světlo', room: 'Pracovna', online: true, switchable: true, light: true, on: false },
    { id: 9106, name: 'LED', room: 'Pracovna', online: true, switchable: true, light: true, on: true, rgb: true },
    { id: 9107, name: 'Světlo', room: 'Ložnice', online: true, switchable: true, light: true, on: false },
    { id: 9104, name: 'Světlo', room: 'Obývák', online: true, switchable: true, light: true, on: false },
  ];
  const rooms = [{ name: 'Pracovna' }, { name: 'Ložnice' }, { name: 'Obývák', meter: { temperature: 20.9 } }];
  const deps = {
    config: { rooms, fibaro: { devices } }, rooms: () => rooms,
    connections: () => ({ fibaro: true, power: true, vacuum: true, solar: true, spotify: true, coffee: true, heat: true, heating: true, station: true }),
    station: async () => ({ state: 'live' }),
    heating: async () => ({ state: 'live', data: { rooms: [{ name: 'Obývák', id: 'living', reachable: true, target: 22 }] } }),
    vacuum: async () => ({ state: 'live', data: { state: 'charging_complete' } }),
    solar: async () => ({ state: 'live', data: { day: 5.3, yesterday: 11.7 } }),
    lights: async () => ({ state: 'live', data: devices }),
    diagnostics: async () => ({}),
    async command(path, body) { calls.push([path, body]); return { status: 200, data: { temperature: 23 } }; },
  };
  const handler = createVoiceHttp({ env: { VOICE_ENABLED: 'true', VOICE_PYTHON: python, VOICE_CODEX_SOCKET: socket, ...extraEnv }, stateDir, fetchElevenLabs,
    allowedOrigins: new Set([origin]), deps,
    send(response, status, data) { response.writeHead(status); response.end(JSON.stringify(data)); },
    log(level, event, details, error) { if (error) problems.push(error); warnings.push({ event, details }); } });
  const server = createServer((request, response) => handler(request.url, request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let turns = 0;
  t.after(async () => {
    await Promise.all([server, mockCodex].map((item) => new Promise((resolve) => item.close(resolve))));
    const history = join(stateDir, 'voice', 'history.jsonl');
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const rows = (await readFile(history, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
        if (rows.length >= turns) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      process.kill(Number(await readFile(pidFile, 'utf8')));
    } finally { await rm(stateDir, { recursive: true, force: true }); }
    assert.deepEqual(problems, []);
  });
  async function voiceRequest(path, phrase, context, focusOnly, voice, recognition) {
    const audio = Buffer.alloc(6444);
    audio.write('RIFF', 0);
    audio.write('WAVE', 8);
    audio.write(phrase, 44);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/voice/${path}`, {
      method: 'POST', body: audio, headers: { origin, 'Content-Type': 'audio/wav',
        ...(context && { 'X-Voice-Context': context }), ...(focusOnly && { 'X-Voice-Focus-Only': '1' }),
        ...(voice && { 'X-Voice-Name': voice }), ...(recognition && { 'X-Voice-Recognition': recognition }) },
    });
    assert.equal(response.status, 200);
    return response;
  }
  return { requests, calls, warnings, async config(language = 'cs') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/voice/config`, { headers: { 'X-Voice-Language': language } });
    return response.json();
  }, async command(phrase, context, focusOnly = false, voice, recognition) {
    const response = await voiceRequest('command', phrase, context, focusOnly, voice, recognition);
    turns++;
    return Object.fromEntries((await response.text()).trim().split('\n').map((row) => {
      const event = JSON.parse(row);
      return [event.phase, event];
    }));
  }, async interrupt(phrase, context) {
    const response = await voiceRequest('interrupt', phrase, context);
    const result = await response.json();
    if (result.end) turns++;
    return result;
  } };
}

test('Jarvis remembers the room from a model answer and targets the main light after waking again', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const power = await command('Jaká je spotřeba počítače v pracovně?');
  assert.match(power.answer.message, /273,7/);
  assert.ok(power.result.context);
  assert.equal(requests[0].room, 'Pracovna');
  assert.equal(requests[0].operationAllowlist['light.set'], undefined);
  assert.equal(requests[0].operationAllowlist['light.read'].access, 'read');

  const status = await command('A svítí v pracovně světlo?', power.result.context, true);
  assert.equal(status.answer.message, 'Pracovna, Světlo je zhasnuté.');
  assert.deepEqual(calls, []);
  const light = await command('Zapníme světlo.', status.result.context, true);
  assert.equal(light.heard.transcript, 'Zapni mi světlo.');
  assert.equal(light.result.changed, true);
  assert.deepEqual(calls, [['/api/fibaro/devices', { id: 9102, on: true }]]);
  const led = await command('Zapni LED.', light.result.context);
  assert.equal(led.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9106, on: true }]);
  const stop = await command('Hotovo.', led.result.context);
  assert.equal(stop.result.end, true);
  assert.equal(stop.result.context, undefined);
  const unrelated = await command('Zapni světlo.', led.result.context, true);
  assert.equal(unrelated.answer.message, 'Ve které místnosti?');
  const noWrite = await command('Co v ložnici?', unrelated.result.context);
  assert.equal(noWrite.result.changed, false);
  assert.equal(calls.length, 2);
});


test('nearby Czech device names, solar follow-ups and Spotify continuation use local plans', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const vacuum = await command('Jak se má vesavač?');
  assert.equal(vacuum.heard.transcript, 'Jak se má vysavač?');
  assert.equal(vacuum.answer.message, 'Vysavač je v doku a plně nabitý.');

  const today = await command('Kolik dnes vyrobila fotovoltaika?');
  assert.match(today.answer.message, /dnes vyrobila 5,3/);
  const yesterday = await command('A včera?', today.result.context, true);
  assert.match(yesterday.answer.message, /včera vyrobila 11,7/);
  const named = await command('Kolik vyrobila fotovoltajka včera?');
  assert.equal(named.heard.transcript, 'Kolik vyrobila fotovoltaika včera?');
  assert.equal(named.answer.message, yesterday.answer.message);

  const playing = await command('Pokračuji v přehrávání Spotify.');
  assert.deepEqual(playing.client.action, { operation: 'spotify.resume' });
  const again = await command('Můžeš pokračovat.', playing.result.context);
  assert.deepEqual(again.client.action, { operation: 'spotify.resume' });
  assert.deepEqual(requests, []);
  assert.deepEqual(calls, []);
});


test('a comparative heating request uses the remembered room and the selected Czech voice', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const reading = await command('Jaká je teplota v obýváku.');
  assert.equal(reading.answer.message, 'V obýváku je 20,9 stupňů.');
  assert.equal(Buffer.from(reading.result.audio, 'base64').toString(), 'kasandra');
  const change = await command('Nastavme na dvě hodiny o stupeň vyšší teplotu.', reading.result.context, true, 'jirka');
  assert.equal(change.heard.transcript, 'Nastav mi na dvě hodiny o stupeň vyšší teplotu.');
  assert.equal(change.result.changed, true);
  assert.equal(Buffer.from(change.result.audio, 'base64').toString(), 'jirka');
  assert.deepEqual(calls, [['/api/heating', { id: 'living', delta: 1, durationHours: 2 }]]);
  const missing = await command('Nastavme na dvě hodiny o stupeň vyšší teplotu.');
  assert.equal(missing.answer.message, 'V které místnosti mám změnit topení?');
  assert.equal(missing.result.changed, false);
  assert.deepEqual(requests, []);
  assert.equal(calls.length, 1);
});


test('the recorded capabilities question is answered from connected services without a state lookup', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const help = await command('Co pro mě můžeš udělat?');
  assert.match(help.answer.message, /ovládat světla/);
  assert.match(help.answer.message, /poslat vysavač/);
  assert.match(help.answer.message, /Spotify/);
  assert.doesNotMatch(help.answer.message, /klimatizac|žádná data/);
  assert.equal(help.result.changed, false);
  assert.deepEqual(requests, []);
  assert.deepEqual(calls, []);
});


test('light follow-ups act on the last resolved light, including split Czech recognition', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const status = await command('Svítí teď světlo v pracovně?');
  assert.match(status.answer.message, /Pracovna, Světlo/);
  const bad = await command('Tak je ve pně.', status.result.context, true);
  assert.equal(bad.heard.transcript, 'Tak je vypni.');
  assert.equal(bad.result.changed, true);
  const exact = await command('tak je vypni.', bad.result.context);
  assert.equal(exact.result.changed, true);
  assert.deepEqual(calls, [['/api/fibaro/devices', { id: 9102, on: false }], ['/api/fibaro/devices', { id: 9102, on: false }]]);

  const led = await command('Svítí v pracovně LED?', exact.result.context);
  const ledOff = await command('Vyp ně.', led.result.context);
  assert.equal(ledOff.heard.transcript, 'Vypni.');
  assert.equal(ledOff.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9106, on: false }]);
  const named = await command('Zapni světlo.', ledOff.result.context);
  assert.equal(named.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9102, on: true }]);
  assert.deepEqual(requests, []);

  const noContext = await command('Tak je vypni.');
  assert.equal(noContext.result.changed, false);
  assert.equal(calls.length, 4);
});


test('context fills a target for settings, model-assisted adjustments and returning to the room schedule', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const led = await command('Svítí v pracovně LED?');
  const brighten = await command('Nastav na 30 procent.', led.result.context, true);
  assert.equal(brighten.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9106, color: 'current', brightness: 30 }]);
  const color = await command('Nastav na fialový odstín.', brighten.result.context);
  assert.equal(color.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/fibaro/devices', { id: 9106, color: 'purple', brightness: 50 }]);
  assert.equal(requests[0].operationAllowlist['light.color'].access, 'write');
  assert.equal(requests[0].operationAllowlist['climate.set'], undefined);

  const temperature = await command('Jaká je teplota v obýváku?');
  const missing = await command('Nastav.', temperature.result.context);
  assert.equal(missing.answer.message, 'Na kolik stupňů?');
  const set = await command('22.', missing.result.context, true);
  assert.equal(set.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/heating', { id: 'living', temperature: 22, durationHours: 2 }]);
  const program = await command('Program.', set.result.context, true);
  assert.equal(program.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/heating', { id: 'living', temperature: null }]);
  const mistranscribed = await command('Nastavte plotu v obýváku na běžný program.');
  assert.equal(mistranscribed.heard.transcript, 'Nastav teplotu v obýváku na běžný program.');
  assert.equal(mistranscribed.result.changed, true);
  assert.deepEqual(calls.at(-1), ['/api/heating', { id: 'living', temperature: null }]);
  const noContext = await command('Program.');
  assert.equal(noContext.result.changed, false);
});

test('thank you interrupts the current answer, clears the target and returns a farewell', async (t) => {
  const { command, interrupt, calls } = await fixture(t);
  const light = await command('Svítí světlo v pracovně?');
  const end = await interrupt('Děkuji.', light.result.context);
  assert.equal(end.end, true);
  assert.match(end.message, /Loučím se|Tak zatím|Měj se|Jsem tu/);
  assert.ok(end.audio);
  const thanks = await command('Děkuji.');
  assert.equal(thanks.result.end, true);
  assert.notEqual(thanks.answer.message, end.message);
  const later = await command('Vypni.', light.result.context);
  assert.equal(later.result.changed, false);
  assert.deepEqual(calls, []);
});


test('a light request refers to the room from an unrelated temperature topic', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const temperature = await command('Jaká je teplota v obýváku?');
  const light = await command('Rozsvítme tam světlo.', temperature.result.context, true);
  assert.equal(light.heard.transcript, 'Rozsviť mi tam světlo.');
  assert.equal(light.result.changed, true);
  const again = await command('Chci je rozsvítit.', light.result.context);
  assert.equal(again.result.changed, true);
  const fragment = await command('si je rozsvítět.', again.result.context);
  assert.equal(fragment.heard.transcript, 'Rozsviť je.');
  assert.equal(fragment.result.changed, true);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => ['/api/fibaro/devices', { id: 9104, on: true }]));
  assert.deepEqual(requests, []);
});


test('model proposals cannot reverse a toggle or broaden specified scope', async (t) => {
  const { command, calls } = await fixture(t);
  for (const phrase of ['Rozsviť všude.', 'Vypni kávovar.', 'Vysaj celý dům v obýváku.']) {
    assert.equal((await command(phrase)).result.changed, false, phrase);
  }
  const led = await command('Svítí LED v pracovně?');
  assert.equal((await command('Ztlum ji o deset procent.', led.result.context)).result.changed, false);
  assert.deepEqual(calls, []);
});


const cloudVoice = 'elevenlabs:CzechVoiceForTests';
const cloudEnv = { ELEVENLABS_ENABLED: 'true', ELEVENLABS_KEY: 'test-key' };

function fakeElevenLabs(calls, failures = {}) {
  return async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    assert.equal(new URL(url).hostname, 'api.elevenlabs.io');
    assert.equal(options.headers['xi-api-key'], cloudEnv.ELEVENLABS_KEY);
    assert.equal(options.redirect, 'error');
    if (path === '/v2/voices') return Response.json({ voices: [
      { voice_id: 'CzechVoiceForTests', name: 'Warm Czech Female Voice – Jana', labels: { language: 'cs' },
        verified_languages: [{ language: 'cs', model_id: 'eleven_flash_v2_5' }] },
      { voice_id: 'EnglishVoiceForTests', name: 'Bella - Professional, Bright, Warm', labels: { language: 'en' },
        verified_languages: [{ language: 'en', model_id: 'eleven_flash_v2_5' }, { language: 'cs', model_id: 'eleven_v4' }] },
      { voice_id: 'OtherModelVoiceTests', name: 'Cloud Voice Not For Flash', labels: { language: 'cs' },
        verified_languages: [{ language: 'cs', model_id: 'eleven_v4' }] },
      { voice_id: 'ForeignVoiceForTests', name: 'Foreign Voice Verified In Czech', labels: { language: 'en' },
        verified_languages: [{ language: 'cs', model_id: 'eleven_flash_v2_5' }] },
      { voice_id: 'UnverifiedVoiceTests', name: 'Unverified Czech Voice', labels: { language: 'cs' } },
    ], has_more: false });
    if (path === '/v1/speech-to-text') {
      if (failures.stt) return Response.json({}, { status: failures.stt });
      const audio = options.body.get('file');
      assert.equal(audio.type, 'audio/wav');
      assert.equal(options.body.get('model_id'), 'scribe_v3');
      assert.equal(options.body.get('language_code'), 'ces');
      assert.equal(options.body.get('numbers_format'), 'digits');
      return Response.json({ text: 'Jaká je teplota v obýváku?' });
    }
    if (path === '/v1/text-to-speech/CzechVoiceForTests') {
      if (failures.tts) return Response.json({}, { status: failures.tts });
      assert.deepEqual(JSON.parse(options.body), { text: 'V obýváku je 20,9 stupňů.', model_id: 'eleven_flash_v2_5', language_code: 'cs' });
      return new Response('cloud-audio', { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    throw new Error('unexpected provider route');
  };
}

test('ElevenLabs provides language-specific voices and separate cloud and local speech selections', async (t) => {
  const requests = [];
  const { config, command, interrupt } = await fixture(t, { extraEnv: cloudEnv, fetchElevenLabs: fakeElevenLabs(requests) });
  const czech = await config();
  assert.equal(czech.recognitionDefault, 'elevenlabs');
  assert.equal(czech.voices[0].id, 'kasandra');
  assert.deepEqual(czech.voices.filter(({ provider }) => provider === 'elevenlabs').map(({ id, name }) => ({ id, name })),
    [{ id: cloudVoice, name: 'Jana' }]);
  assert.ok((await config('en')).voices.some(({ name }) => name === 'Bella'));
  assert.ok(!(await config('en')).voices.some(({ name }) => name === 'Jana'));
  assert.ok(!JSON.stringify(czech).includes(cloudEnv.ELEVENLABS_KEY));
  const cloud = await command('Nepoužitý přepis.', null, false, cloudVoice);
  assert.equal(cloud.heard.recognitionEngine, 'elevenlabs');
  assert.equal(Buffer.from(cloud.result.audio, 'base64').toString(), 'cloud-audio');
  const local = await command('Jaká je teplota v obýváku?', null, false, 'kasandra', 'whisper');
  assert.equal(local.heard.recognitionEngine, 'whisper');
  assert.equal(Buffer.from(local.result.audio, 'base64').toString(), 'kasandra');
  assert.equal((await interrupt('Stop.')).end, true);
  assert.deepEqual(requests.map(({ path }) => path), ['/v2/voices', '/v1/speech-to-text', '/v1/text-to-speech/CzechVoiceForTests']);
});

test('a denied ElevenLabs scope falls back to local processing and disables repeated denied requests', async (t) => {
  const requests = [];
  const { config, command, warnings } = await fixture(t, { extraEnv: cloudEnv,
    fetchElevenLabs: fakeElevenLabs(requests, { stt: 401, tts: 403 }) });
  for (let turn = 0; turn < 2; turn++) {
    const reply = await command('Jaká je teplota v obýváku?', null, false, cloudVoice);
    assert.equal(reply.heard.recognitionEngine, 'whisper');
    assert.equal(reply.heard.recognitionUnavailable, true);
    assert.equal(Buffer.from(reply.result.audio, 'base64').toString(), 'kasandra');
  }
  const status = await config();
  assert.equal(status.recognitionDefault, 'whisper');
  assert.equal(status.recognitionOptions.find(({ id }) => id === 'elevenlabs').available, false);
  assert.equal(status.voices.some(({ provider }) => provider === 'elevenlabs'), false);
  assert.deepEqual(requests.map(({ path }) => path), ['/v2/voices', '/v1/speech-to-text', '/v1/text-to-speech/CzechVoiceForTests']);
  assert.deepEqual(warnings.map(({ details }) => details), [{ operation: 'stt', status: 401 }, { operation: 'tts', status: 403 }]);
});


test('recorded play requests for Lucie become playback in the tablet, while search stays search', async (t) => {
  const { command, requests, calls } = await fixture(t);
  const first = await command('Přehrají Lucie na Spotify.');
  assert.equal(first.heard.transcript, 'Přehraj Lucie na Spotify.');
  assert.deepEqual(first.client.action, { operation: 'spotify.play', query: 'Lucie' });
  const second = await command('Zahrali Lucie.');
  assert.equal(second.heard.transcript, 'Zahraj Lucie.');
  assert.deepEqual(second.client.action, { operation: 'spotify.play', query: 'Lucie' });
  const search = await command('Najdi Lucie na Spotify.');
  assert.deepEqual(search.client.action, { operation: 'spotify.search', query: 'Lucie' });
  assert.deepEqual(requests, []);
  assert.deepEqual(calls, []);
});
