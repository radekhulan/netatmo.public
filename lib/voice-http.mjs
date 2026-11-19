import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { request as requestSocket } from 'node:http';
import { join, resolve } from 'node:path';
import { mentionedVoiceRoom, normalizeVoiceText, repairCzechVoiceCommand, resolveVoiceRoom } from './voice-intents.mjs';
import { createVoiceHistory } from './voice-history.mjs';
import { createVoiceSpeech } from './voice-speech.mjs';
import { createElevenLabsSpeech } from './voice-elevenlabs.mjs';
import { repairVoiceFollowUp } from './voice-assistant.mjs';
import { voiceActions } from './voice-actions.mjs';
import { voiceContextDomain } from './voice-context.mjs';
import { voiceFarewell } from './voice-farewell.mjs';
import { planCatalogOperation, voiceCatalog } from './voice-catalog.mjs';
import { discoverVoiceCapabilities } from './voice-discovery.mjs';
import { voiceModelContext, voicePowerDirection, voiceWritePermission } from './voice-request.mjs';
import { confirmation, interruptsVoice, planVoiceInLanguage, voiceLanguage, voiceMessages, wantsAction } from './voice-languages.mjs';

const assets = new Map([
  ['melspectrogram.onnx', 'application/octet-stream'],
  ['embedding_model.onnx', 'application/octet-stream'],
  ['hey_jarvis_v0.1.onnx', 'application/octet-stream'],
  ['ort.wasm.min.mjs', 'text/javascript; charset=utf-8'],
  ['ort-wasm-simd-threaded.mjs', 'text/javascript; charset=utf-8'],
  ['ort-wasm-simd-threaded.wasm', 'application/wasm'],
]);
const maxAudio = 256_044;
const maxInterruptAudio = 48_044;
const piperVoices = [
  { id: 'kasandra', name: 'Kasandra', language: 'cs', path: 'cs/cs_CZ/kasandra/medium/cs_CZ-kasandra-medium.onnx' },
  { id: 'jirka', name: 'Jirka', language: 'cs', path: 'cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx' },
  { id: 'honza', name: 'Honza', language: 'cs', path: 'honza/medium/model.onnx' },
  { id: 'lessac', name: 'Lessac', language: 'en', path: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx' },
  { id: 'thai', name: 'ภาษาไทย', language: 'th', path: 'thai/th_TH-mms_female-medium.onnx' },
];

function askCodex(socketPath, input) {
  const body = JSON.stringify(input);
  return new Promise((resolve, reject) => {
    const request = requestSocket({ socketPath, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      signal: AbortSignal.timeout(25_000),
    }, async (response) => {
      try {
        if (response.statusCode !== 200) throw new Error('Codex je nedostupný.');
        let text = '';
        for await (const chunk of response.setEncoding('utf8')) {
          text += chunk;
          if (text.length > 16_384) throw new Error('Odpověď je příliš dlouhá.');
        }
        const { answer, operation, args } = JSON.parse(text);
        if (typeof answer !== 'string' || typeof operation !== 'string' || typeof args !== 'string') throw new Error('Chybí odpověď.');
        resolve({ answer: answer.trim().slice(0, 400), operation, args });
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    request.on('error', reject);
    request.end(body);
  });
}

export function createVoiceHttp({ env, stateDir, allowedOrigins, deps, send, log, fetchElevenLabs }) {
  const directory = resolve(stateDir, 'voice');
  const assetDir = resolve(env.VOICE_ASSETS_DIR || join(directory, 'assets'));
  const models = join(directory, 'models');
  const python = env.VOICE_PYTHON || join(directory, 'venv', 'bin', 'python');
  const requested = env.VOICE_ENABLED === 'true';
  const turbo = join(models, 'whisper-turbo');
  const turboInstalled = ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json', 'preprocessor_config.json']
    .every((filename) => existsSync(join(turbo, filename)));
  const whisperDirectory = turboInstalled ? turbo : join(models, 'whisper');
  const hasVoice = (voice) => {
    const path = join(models, 'piper', voice.path);
    return existsSync(path) && existsSync(path + '.json');
  };
  const localVoices = (language) => piperVoices.filter((voice) => voice.language === language && hasVoice(voice))
    .map(({ id, name }) => ({ id, name }));
  const localVoice = (value, language) => {
    const available = localVoices(language);
    return available.some(({ id }) => id === value) ? value : available[0]?.id;
  };
  const ready = () => requested && existsSync(python) && existsSync(join(whisperDirectory, 'model.bin')) &&
    piperVoices.some((voice) => voice.language === 'cs' && hasVoice(voice)) &&
    [...assets.keys()].every((asset) => existsSync(join(assetDir, asset)));
  const voice = createVoiceSpeech(python, models, whisperDirectory);
  const eleven = createElevenLabsSpeech(env, { fetchApi: fetchElevenLabs,
    reportFailure: (operation, status) => log('warning', 'voice.elevenlabs.failed', { operation, status }) });
  const localRecognitionModel = turboInstalled ? 'whisper-large-v3-turbo' : 'whisper-small';
  if (ready()) {
    voice.warm();
    if (eleven.enabled) void eleven.voices('cs');
  }
  async function speak(message, name, language, signal, localOnly = false) {
    if (!localOnly && eleven.enabled && typeof name === 'string' && name.startsWith('elevenlabs:')) {
      const prepared = await voice.prepare(message, language).catch(() => message);
      const result = await eleven.speak(prepared, name, language, signal);
      if (result) return { audio: result.audio, voice: name, synthesisEngine: 'elevenlabs', synthesisModel: result.model };
    }
    const chosen = localVoice(name, language);
    const audio = chosen && !signal?.aborted ? await voice.speak(message, chosen, language).catch(() => null) : null;
    return { audio, voice: chosen, synthesisEngine: audio ? 'piper' : undefined };
  }
  function logSpeech(trace, speech) {
    const { audio, ...details } = speech;
    Object.assign(trace, details, { audio: Boolean(audio) });
  }
  const socketPath = env.VOICE_CODEX_SOCKET ? resolve(env.VOICE_CODEX_SOCKET) : null;
  const contexts = new Map();
  const clientReplies = new Map();
  const saveTurn = createVoiceHistory(directory, (error) => log('warning', 'voice.history.failed', {}, error));
  let busy = false;
  const originAllowed = (request) => allowedOrigins.has(request.headers.origin) && request.headers['sec-fetch-site'] !== 'cross-site';

  async function command(request, response, interrupt = false) {
    if (!ready()) return send(response, 503, { error: 'Hlasová služba není připravená.' });
    const origin = request.headers.origin;
    const language = voiceLanguage(request.headers['x-voice-language']);
    const messages = voiceMessages[language];
    if (!originAllowed(request) || request.headers['content-type'] !== 'audio/wav') {
      return send(response, 403, { error: 'Povel musí přijít z panelu.' });
    }
    const bytes = Number(request.headers['content-length']);
    if (!Number.isSafeInteger(bytes) || bytes < 6444 || bytes > (interrupt ? maxInterruptAudio : maxAudio)) {
      return send(response, 413, { error: interrupt ? 'Přerušení musí mít nejvýš 1,5 sekundy.' : 'Nahrávka musí mít nejvýš osm sekund.' });
    }
    if (busy) return send(response, 409, { error: 'Asistent právě vyřizuje jiný povel.' });
    busy = true;
    const client = new AbortController();
    response.once('close', () => client.abort());
    let streaming = false;
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    let trace;
    function event(data) {
      if (!response.destroyed && !response.writableEnded) response.write(JSON.stringify(data) + '\n');
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > bytes) throw new Error('Příliš dlouhá nahrávka.');
        chunks.push(chunk);
      }
      if (size !== bytes) return send(response, 400, { error: 'Nahrávka je neúplná.' });
      const audio = Buffer.concat(chunks, size);
      if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
        return send(response, 400, { error: 'Nahrávka nemá formát WAV.' });
      }
      if (interrupt) {
        const { transcript, engine } = await voice.interrupt(audio, language);
        if (response.destroyed) return;
        const end = interruptsVoice(transcript, language);
        if (end) {
          const contextId = request.headers['x-voice-context'];
          const context = contexts.get(contextId);
          if (context?.origin === origin && context.language === language) contexts.delete(contextId);
          trace = { id: randomUUID(), at: new Date().toISOString(), source: engine, language,
            operation: 'conversation.interrupt', transcript, outcome: 'canceled', transcriptionMs: elapsed() };
          const message = voiceFarewell(language);
          const farewell = await speak(message, request.headers['x-voice-name'], language, client.signal, true);
          trace.answer = message;
          logSpeech(trace, farewell);
          if (!response.destroyed) return send(response, 200, { end, message, audio: farewell.audio });
          return;
        }
        return send(response, 200, { end });
      }
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
      response.flushHeaders();
      streaming = true;
      trace = { id: randomUUID(), at: new Date().toISOString(), language, source: 'whisper', outcome: 'aborted' };

      const contextId = request.headers['x-voice-context'];
      const previous = contexts.get(contextId);
      const validContext = previous?.origin === origin && previous.language === language;
      if (validContext) contexts.delete(contextId);
      for (const [id, item] of contexts) if (item.expires < Date.now()) contexts.delete(id);
      const cloud = eleven.canTranscribe && request.headers['x-voice-recognition'] !== 'whisper'
        ? await eleven.transcribe(audio, language, client.signal) : null;
      if (response.destroyed) return;
      const rawTranscript = cloud ?? await voice.transcribe(audio, language);
      trace.recognitionEngine = cloud === null ? 'whisper' : 'elevenlabs';
      trace.recognitionModel = cloud === null ? localRecognitionModel : eleven.sttModel;
      const remembered = validContext && previous.expires >= Date.now() ? previous.context : null;
      const transcript = language === 'cs'
        ? repairVoiceFollowUp(repairCzechVoiceCommand(rawTranscript, deps.connections()), remembered) : rawTranscript;
      trace.transcript = rawTranscript;
      if (transcript !== rawTranscript) trace.interpretedTranscript = transcript;
      trace.transcriptionMs = elapsed();
      if (response.destroyed) return;
      if (transcript) event({ phase: 'heard', transcript, recognitionEngine: trace.recognitionEngine,
        recognitionUnavailable: eleven.enabled && !eleven.canTranscribe });
      const catalog = voiceCatalog(deps);
      const mention = mentionedVoiceRoom(transcript, catalog.rooms);
      const room = mention === undefined ? remembered?.room : mention;
      const action = remembered?.intent?.action;
      const recentTopic = voiceActions[action]?.access === 'read' || voiceContextDomain(remembered)
        ? remembered.intent : undefined;
      const prior = request.headers['x-voice-focus-only'] === '1'
        ? { room, intent: recentTopic, question: recentTopic && remembered.question, setting: recentTopic && remembered.setting } : { ...remembered, room };
      const spokenText = language === 'cs' ? normalizeVoiceText(transcript) : transcript.trim();
      function saveContext(result) {
        if (response.destroyed || result.end) return undefined;
        const focus = result.operation === 'outdoor.read' ? null : result.context?.intent?.room ?? room;
        if (focus) trace.room = focus;
        if (!result.context && !focus) return undefined;
        if (contexts.size >= 32) contexts.delete(contexts.keys().next().value);
        const id = randomUUID();
        const question = result.context?.intent ? transcript || prior.question : undefined;
        contexts.set(id, { context: { ...result.context, room: focus, question }, origin, language, expires: Date.now() + 40_000 });
        return id;
      }
      async function planOperation(operation, args, confirmed = false, contextual = false) {
        trace.operation = operation;
        const direction = voicePowerDirection(transcript, language);
        if (operation === 'light.allOff' && (direction !== false || mention !== undefined ||
            (language === 'cs' && !/\b(?:vsude|vsechna|vsechny|vsechno|cely (?:dum|byt))\b/.test(spokenText)))) return null;
        if (operation === 'coffee.wake' && direction !== true) return null;
        if (direction !== undefined && ['light.set', 'light.lamps', 'climate.power', 'climate.eco.set', 'air.set'].includes(operation) &&
            args?.value !== direction) return null;
        if (operation === 'light.brightness' && /\b(?:o .+ procent|stup\w*)\b/.test(spokenText)) return null;
        if (args && !Array.isArray(args) && typeof args === 'object') {
          if (/^light\.(?:set|read|brightness|color)$/.test(operation) && language === 'cs') {
            const explicit = contextual || /\b(?:led|pasek|lamp)\w*/.test(spokenText);
            const label = normalizeVoiceText(args.device);
            if (!explicit && ['led', 'lamp'].includes(args.target)) return null;
            if (label && label !== 'svetlo' && !explicit && !mentionedVoiceRoom(spokenText, [label])) return null;
            if (label === 'svetlo' && !explicit) {
              args = { ...args, target: 'ceiling' };
              delete args.device;
            }
          }
          if (room && /^(?:light\.(?:set|read|brightness|color)|heat\.(?:set|adjust|read|resume))$/.test(operation)) {
            if (args.room && resolveVoiceRoom(args.room) !== room) return null;
            if (!args.device || args.room || mention) args = { ...args, room };
          }
        }
        const selection = contextual ? prior.intent : undefined;
        if (selection && args && typeof args === 'object' && !Array.isArray(args)) {
          if (args.device && selection.device && normalizeVoiceText(args.device) !== normalizeVoiceText(selection.device)) return null;
          if (selection.room && /^(?:heat|light|air)\./.test(operation)) {
            if (args.room && resolveVoiceRoom(args.room) !== selection.room) return null;
            args = { ...args, room: selection.room };
          }
          if (operation.startsWith('light.') && selection.device) args = { ...args, device: selection.device, target: undefined };
          if (Object.hasOwn(args, 'target') && args.target === undefined) delete args.target;
        }
        const plan = await planCatalogOperation(operation, args, deps, confirmed, selection);
        if (!plan) return null;
        if (language === 'cs') return { ...plan, operation };
        if (plan.context?.confirm) return { ...plan,
          message: operation === 'heating.program' ? messages.programConfirm : messages.presetConfirm };
        if (plan.context?.clarify) return { message: messages.clarify,
          context: { model: { question: transcript, answer: messages.clarify, write: true } } };
        if (plan.failed) return { ...plan, message: messages.failed };
        return plan;
      }
      let result;
      trace.source = 'parser';
      const confirm = confirmation(spokenText, language);
      if (prior?.confirm && confirm !== null) {
        trace.source = 'confirmation';
        result = confirm ? await planOperation(prior.confirm.operation, prior.confirm.args, true)
          : { message: messages.canceled };
        if (!confirm) trace.outcome = 'canceled';
      }
      result ??= await planVoiceInLanguage(transcript, deps, prior, language);
      if (!result && socketPath && spokenText.length >= 3) {
        trace.source = 'codex';
        event({ phase: 'working', message: messages.lookup });
        try {
          const write = voiceWritePermission(transcript, language, prior, wantsAction);
          const spotifyPlayback = write.domains.includes('spotify') && /^(?:(?:a|tak|prosim|chci|chtel bych)[, ]+)*(?:prehraj|prehrat|zahraj|zahrat|pust)(?:mi)?\b/.test(spokenText);
          const operations = Object.fromEntries(Object.entries(catalog.actions).filter(([name, spec]) =>
            (spec.access === 'read' && (language === 'cs' || name.startsWith('spotify.')) && (!spotifyPlayback || name !== 'spotify.search')) ||
            (spec.access === 'write' && write.allowed && write.domains.includes(name.split('.')[0]) &&
              (!write.operations || write.operations.includes(name)))));
          const requestedDomains = write.domains.join(' ');
          const current = deps.connections();
          const previousQuestion = prior.model?.question ?? (/^(?:a|tak|co|and|then) /i.test(spokenText) ? prior.question : undefined);
          const relevant = normalizeVoiceText(transcript + ' ' + (previousQuestion ?? '') + ' ' + requestedDomains);
          const scope = {
            fibaro: current.fibaro && /light|svetl|lamp|led|osvetl|sviti/.test(relevant),
            heat: current.heat && /heat|top|teplot|hlavic/.test(relevant),
            heating: current.heating && /heat|top|teplot|hlavic/.test(relevant),
            climate: current.climate && /climate|klima|eco|chlaz|casovac|sensibo/.test(relevant),
            air: current.air && /air|cistick|philips|zvlh/.test(relevant),
            vacuum: current.vacuum && /vacuum|vysav|vysaj|mop|vytr|uklid|roborock/.test(relevant),
          };
          const [data, discovered] = await Promise.all([
            deps.diagnostics(transcript, [previousQuestion, room].filter(Boolean).join(' ')),
            discoverVoiceCapabilities(deps, scope),
          ]);
          const capabilities = Object.fromEntries(Object.entries(discovered).filter(([name]) => scope[name]));
          const availableRooms = [...new Set([...catalog.rooms, ...(capabilities.heating?.rooms ?? []).map(({ name }) => name),
            ...(capabilities.air?.devices ?? []).map(({ room }) => room), ...(capabilities.vacuum?.rooms ?? [])])];
          const input = { question: transcript, language, room: availableRooms.find((name) => resolveVoiceRoom(name) === room),
            previous: voiceModelContext(prior), operationAllowlist: operations, readableDevices: catalog.reads,
            rooms: availableRooms, lights: catalog.lights, scenes: catalog.scenes, meters: catalog.meters, capabilities, data };
          if (Buffer.byteLength(JSON.stringify(input)) > 60_000) input.data = { note: 'Podrobnosti dotazu přesáhly dostupný kontext.' };
          const modelStarted = performance.now();
          const reply = await askCodex(socketPath, input).finally(() => {
            trace.codexMs = Math.round(performance.now() - modelStarted);
          });
          if (Object.hasOwn(operations, reply.operation)) {
            let args;
            try { args = JSON.parse(reply.args); } catch {}
            if (reply.operation === 'vacuum.start' && args && typeof args === 'object' && !Array.isArray(args)) {
              const requested = args.rooms ?? (args.room ? [args.room] : []);
              const scopeText = [transcript, write.followUp && prior.model?.question].filter(Boolean).join(' ');
              if (write.wholeHouse && !requested.length) args.wholeHome = true;
              if ((args.wholeHome && (!write.wholeHouse || mentionedVoiceRoom(scopeText, availableRooms) !== undefined)) || (language === 'cs' && Array.isArray(requested) &&
                  requested.some((name) => !mentionedVoiceRoom(scopeText, [name])))) args = null;
            }
            result = await planOperation(reply.operation, args, false, write.contextual);
            if (!result) trace.outcome = 'rejected_operation';
          } else if (!reply.operation && reply.answer) {
            const question = reply.answer.endsWith('?') || (language === 'th' && /ไหน|หรือไม่/.test(reply.answer));
            const slot = /místnost|kde|kam|room|ห้อง/i.test(reply.answer) ? 'room' :
              /kolik stupň|na jakou teplot|how many degrees|what temperature|กี่องศา/i.test(reply.answer) ? 'temperature' :
              /jak dlouho|na kolik hodin|how long|กี่ชั่วโมง/i.test(reply.answer) ? 'duration' :
              /na kolik procent|what percentage|กี่เปอร์เซ็นต์/i.test(reply.answer) ? 'brightness' : undefined;
            result = { message: reply.answer, context: { ...(write.contextual && prior.intent && { intent: prior.intent }), model: { question: write.followUp ? prior.model.question : transcript,
              answer: reply.answer, write: write.allowed && question && Boolean(slot), slot, domains: write.domains } } };
            if (write.allowed && !result.context.model.write) trace.outcome = 'no_action';
          } else if (reply.operation) {
            trace.operation = Object.hasOwn(catalog.operations, reply.operation) ? reply.operation : undefined;
            trace.outcome = 'rejected_operation';
          }
        } catch {
          trace.outcome = 'codex_error';
          result = { message: messages.noAnswer, failed: true };
        }
      }
      if (!spokenText) {
        trace.source = 'whisper';
        trace.outcome = 'no_speech';
        if (result && prior.intent) result.context = { intent: prior.intent, setting: prior.setting };
      } else if (!result && trace.outcome === 'aborted') trace.outcome = 'unrecognized';
      result ??= { message: messages.unknown };
      if (result.client) {
        trace.operation = result.client.operation;
        trace.outcome = 'pending_client';
        const now = Date.now();
        for (const [id, client] of clientReplies) if (client.expires <= now) clientReplies.delete(id);
        if (clientReplies.size >= 32) clientReplies.delete(clientReplies.keys().next().value);
        clientReplies.set(trace.id, { trace, origin, expires: now + 30_000, elapsed });
        event({ phase: 'client', message: messages.sending ?? result.announcement, action: result.client });
        event({ phase: 'result', client: true, historyId: trace.id,
          context: saveContext({ ...result, context: { intent: { action: result.client.operation } } }) });
        return;
      }
      trace.operation ??= result.operation ?? result.context?.intent?.action;
      const change = Boolean(result.run);
      const waiting = result.context?.confirm ? 'confirmation' :
        (result.context?.clarify || result.context?.setting || result.context?.model?.write) ? 'clarification' : null;
      if (result.run) {
        if (response.destroyed) return;
        event({ phase: 'working', message: messages.sending ?? result.announcement });
        const plan = result;
        result = await plan.run();
        if (!result.failed) result.context = plan.context;
        result.operation = plan.operation;
        if (language !== 'cs') result.message = result.failed ? messages.failed : messages.accepted;
      }
      const message = result.message.slice(0, 450);
      trace.answer = message;
      trace.replyMs = elapsed();
      if (trace.outcome === 'aborted') trace.outcome = result.failed ? 'failed' : waiting ?? (change ? 'changed' : 'answered');
      event({ phase: 'answer', message, failed: result.failed === true });
      const spoken = await speak(message, request.headers['x-voice-name'], language, client.signal);
      logSpeech(trace, spoken);
      event({ phase: 'result', audio: spoken.audio, context: saveContext(result), end: result.end === true, changed: change && !result.failed });
    } catch (error) {
      log('warning', 'voice.failed', {}, error);
      if (!streaming) return send(response, 400, { error: 'Nahrávku se nepodařilo zpracovat.' });
      trace.outcome = 'error';
      trace.answer = messages.unavailable;
      trace.replyMs = elapsed();
      event({ phase: 'answer', message: messages.unavailable, failed: true });
      event({ phase: 'result', audio: null });
    } finally {
      if (trace) {
        trace.elapsedMs = elapsed();
        void saveTurn(trace);
      }
      busy = false;
      if (streaming && !response.writableEnded) response.end();
    }
  }

  return async function voiceRoute(path, request, response) {
    if ((path === '/api/voice/command' || path === '/api/voice/interrupt') && request.method === 'POST') {
      await command(request, response, path === '/api/voice/interrupt');
      return true;
    }
    if (path === '/api/voice/speak' && request.method === 'POST') {
      if (!ready()) send(response, 503, { error: 'Hlasová služba není připravená.' });
      else if (!originAllowed(request) || request.headers['content-type'] !== 'application/json') {
        send(response, 403, { error: 'Požadavek musí přijít z panelu.' });
      } else if (busy) send(response, 409, { error: 'Asistent zpracovává jiný povel.' });
      else {
        const size = Number(request.headers['content-length']);
        if (!Number.isSafeInteger(size) || size < 2 || size > 2048) send(response, 413, { error: 'Příliš dlouhá odpověď.' });
        else {
          busy = true;
          try {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const { text, voice: name, historyId, failed } = JSON.parse(Buffer.concat(chunks));
            if (typeof text !== 'string' || !text.trim() || text.length > 450) send(response, 400, { error: 'Neplatná odpověď.' });
            else {
              const language = voiceLanguage(request.headers['x-voice-language']);
              const cancel = new AbortController();
              response.once('close', () => cancel.abort());
              const client = clientReplies.get(historyId);
              const replyMs = client?.elapsed();
              let spoken;
              try {
                spoken = await speak(text, name, language, cancel.signal);
                if (!response.destroyed) send(response, 200, { audio: spoken.audio });
              } finally {
                if (client?.origin === request.headers.origin && client.trace.language === language && client.expires > Date.now()) {
                  clientReplies.delete(historyId);
                  const trace = { ...client.trace, answer: text, outcome: failed === true ? 'failed' : 'answered',
                    replyMs, elapsedMs: client.elapsed() };
                  if (spoken) logSpeech(trace, spoken);
                  void saveTurn(trace);
                }
              }
            }
          } catch {
            send(response, 502, { error: 'Odpověď se nepodařilo přečíst.' });
          } finally { busy = false; }
        }
      }
      return true;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    if (path === '/api/voice/config') {
      const enabled = ready();
      const language = voiceLanguage(request.headers['x-voice-language']);
      const cloudVoices = enabled && request.method === 'GET' ? await eleven.voices(language) : [];
      const recognitionOptions = enabled ? [{ id: 'whisper', name: 'Whisper', available: true }] : [];
      if (enabled && eleven.enabled) recognitionOptions.push({ id: 'elevenlabs', name: 'ElevenLabs', available: eleven.canTranscribe });
      const recognitionDefault = eleven.canTranscribe ? 'elevenlabs' : 'whisper';
      send(response, 200, { enabled, wakeWord: 'Hey Jarvis', language,
        voices: enabled ? [...localVoices(language), ...cloudVoices] : [], recognitionOptions, recognitionDefault,
        recognitionModel: enabled ? (eleven.canTranscribe ? eleven.sttModel : localRecognitionModel) : null });
      return true;
    }
    if (path === '/api/voice/catalog') {
      if (!requested) send(response, 404, { error: 'Hlasová služba je vypnutá.' });
      else if (request.method === 'HEAD') send(response, 200, {});
      else send(response, 200, { ...voiceCatalog(deps), capabilities: await discoverVoiceCapabilities(deps, deps.connections()) });
      return true;
    }
    const asset = path.startsWith('/voice-assets/') && path.slice('/voice-assets/'.length);
    if (!assets.has(asset)) return false;
    const data = requested ? await readFile(join(assetDir, asset)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    }) : null;
    if (data) send(response, 200, data, assets.get(asset), 'private, max-age=86400');
    else send(response, 404, { error: 'Hlasový model není nainstalovaný.' });
    return true;
  };
}
