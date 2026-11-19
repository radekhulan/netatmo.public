const origin = 'https://api.elevenlabs.io';
const sttLanguages = { cs: 'ces', en: 'eng', th: 'tha' };
const voiceIdPattern = /^[a-zA-Z0-9_-]{10,64}$/;
const voicePrefix = 'elevenlabs:';
const catalogLifetime = 10 * 60_000;
const retryDelay = 30_000;
const sttModels = new Set(['scribe_v3', 'scribe_v2']);
const ttsModels = new Set(['eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3', 'eleven_v4', 'eleven_v4_turbo']);

async function readBody(response, limit) {
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel();
    throw new Error('body_limit');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > limit) throw new Error('body_limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function shortVoiceName(name) {
  const [first, ...description] = name.trim().split(/\s+[-–—|]\s+/u);
  const last = description.at(-1);
  if (last && first.split(/\s+/).length >= 3 && /^\p{L}+(?: \p{L}+)?$/u.test(last)) return last;
  return first.slice(0, 85);
}

export function createElevenLabsSpeech(env, { fetchApi = fetch, reportFailure = () => {} } = {}) {
  const key = env.ELEVENLABS_ENABLED === 'true' ? env.ELEVENLABS_KEY?.trim() : '';
  const enabled = Boolean(key);
  const sttModel = sttModels.has(env.ELEVENLABS_STT_MODEL) ? env.ELEVENLABS_STT_MODEL : 'scribe_v3';
  const ttsModel = (language) => ttsModels.has(env.ELEVENLABS_TTS_MODEL) ? env.ELEVENLABS_TTS_MODEL
    : language === 'th' ? 'eleven_v3' : 'eleven_flash_v2_5';
  const failures = {};
  const blocked = new Set();
  let storedVoices = [];
  let expires = 0;
  let catalogRequest;

  async function run(operation, deadline, signal, work) {
    if (!enabled || blocked.has(operation) || failures[operation] > Date.now() || signal?.aborted) return null;
    const timeout = AbortSignal.timeout(deadline);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      return await work(async (path, { method = 'GET', body, type, accept = 'application/json' } = {}) => {
        const response = await fetchApi(origin + path, { method, body, redirect: 'error', signal: combined,
          headers: { 'xi-api-key': key, Accept: accept, ...(type && { 'Content-Type': type }) } });
        if (!response.ok) {
          await response.body?.cancel();
          throw Object.assign(new Error('http_error'), { status: response.status });
        }
        return response;
      });
    } catch (error) {
      if (signal?.aborted) return null;
      if (error.status === 401 || error.status === 403) blocked.add(operation);
      else if (!error.status || error.status === 429 || error.status >= 500 || operation === 'voices') {
        failures[operation] = Date.now() + retryDelay;
      }
      reportFailure(operation, error.status ?? (timeout.aborted ? 'timeout' : 'request_failed'));
      return null;
    }
  }

  async function catalog() {
    if (Date.now() < expires) return storedVoices;
    if (!catalogRequest) {
      catalogRequest = run('voices', 1800, undefined, async (request) => {
        const items = [];
        let page;
        for (let index = 0; index < 3; index++) {
          const params = new URLSearchParams({ page_size: '100', include_total_count: 'false' });
          if (page) params.set('next_page_token', page);
          const response = await request('/v2/voices?' + params);
          const data = JSON.parse(await readBody(response, 1_500_000));
          if (!Array.isArray(data.voices)) throw new Error('invalid_voices');
          for (const item of data.voices) {
            if (typeof item?.voice_id !== 'string' || !voiceIdPattern.test(item.voice_id) || typeof item.name !== 'string' || !item.name.trim()) continue;
            const verified = Array.isArray(item.verified_languages) ? item.verified_languages.filter((value) => typeof value?.language === 'string') : [];
            items.push({ id: voicePrefix + item.voice_id, name: shortVoiceName(item.name), provider: 'elevenlabs',
              language: item.labels?.language, verified });
          }
          if (!data.has_more || typeof data.next_page_token !== 'string' || data.next_page_token === page) break;
          page = data.next_page_token;
        }
        storedVoices = [...new Map(items.map((item) => [item.id, item])).values()];
        expires = Date.now() + catalogLifetime;
      }).finally(() => { catalogRequest = undefined; });
    }
    await catalogRequest;
    return storedVoices;
  }

  async function voices(language) {
    if (!enabled || blocked.has('tts')) return [];
    const model = ttsModel(language);
    if (language === 'th' && ['eleven_flash_v2_5', 'eleven_multilingual_v2'].includes(model)) return [];
    const matchesLanguage = (code) => code === language || code === sttLanguages[language];
    const available = await catalog();
    return available.filter((item) => {
      const perModel = item.verified.filter((entry) => matchesLanguage(entry.language) && entry.model_id);
      const verifiedForModel = perModel.some(({ model_id }) => model_id === model);
      if (language === 'cs') return matchesLanguage(item.language) && verifiedForModel;
      return perModel.length ? verifiedForModel : matchesLanguage(item.language);
    }).map(({ id, name, provider }) => ({ id, name, provider }));
  }

  return {
    enabled,
    sttModel,
    get canTranscribe() { return enabled && !blocked.has('stt'); },
    voices,
    transcribe(audio, language, signal) {
      return run('stt', 4000, signal, async (request) => {
        const body = new FormData();
        body.set('file', new Blob([audio], { type: 'audio/wav' }), 'command.wav');
        body.set('model_id', sttModel);
        body.set('language_code', sttLanguages[language]);
        body.set('tag_audio_events', 'false');
        body.set('timestamps_granularity', 'none');
        if (sttModel === 'scribe_v3') body.set('numbers_format', 'digits');
        const response = await request('/v1/speech-to-text', { method: 'POST', body });
        const result = JSON.parse(await readBody(response, 16_384));
        if (typeof result.text !== 'string') throw new Error('invalid_transcript');
        return result.text.trim().slice(0, 400);
      });
    },
    async speak(text, id, language, signal) {
      if (typeof id !== 'string' || !id.startsWith(voicePrefix)) return null;
      if (!(await voices(language)).some((voice) => voice.id === id)) return null;
      return run('tts', 3200, signal, async (request) => {
        const modelId = ttsModel(language);
        const body = JSON.stringify({ text, model_id: modelId, ...(modelId !== 'eleven_multilingual_v2' && { language_code: language }) });
        const response = await request('/v1/text-to-speech/' + id.slice(voicePrefix.length) + '?output_format=mp3_44100_64',
          { method: 'POST', body, type: 'application/json', accept: 'audio/mpeg' });
        if (!/^audio\//i.test(response.headers.get('Content-Type') ?? '')) {
          await response.body?.cancel();
          throw new Error('invalid_audio');
        }
        const audio = await readBody(response, 2_250_000);
        if (!audio.length) throw new Error('empty_audio');
        return { audio: audio.toString('base64'), model: modelId };
      });
    },
  };
}
