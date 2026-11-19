import { setTimeout as delay } from 'node:timers/promises';
import { env } from './config.mjs';

export const sensiboEnabled = Boolean(env.SENSIBO_API_KEY?.trim());
const modes = { cool: 'Chlazení', heat: 'Topení', auto: 'Automaticky', dry: 'Odvlhčování', fan: 'Ventilace' };
let retryAt = 0;

async function request(path, { params, body, method = 'GET', signal = AbortSignal.timeout(7000) } = {}) {
  if (Date.now() < retryAt) throw new Error('Sensibo dočasně omezuje počet požadavků');
  const url = new URL('https://home.sensibo.com/api/v2' + path);
  url.search = new URLSearchParams({ ...params, apiKey: env.SENSIBO_API_KEY.trim() });
  let response;
  try {
    response = await fetch(url, {
      method, redirect: 'error',
      headers: { 'Accept-Encoding': 'gzip', ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body), signal,
    });
  } catch {
    throw new Error('Sensibo neodpovídá');
  }
  if (response.status === 429) {
    const retry = response.headers.get('Retry-After');
    const wait = /^\d+$/.test(retry ?? '') ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    retryAt = Date.now() + (Number.isFinite(wait) && wait > 0 ? wait : 60_000);
  }
  if (!response.ok) throw new Error('Sensibo HTTP ' + response.status);
  const data = await response.json().catch(() => null);
  if (data?.status !== 'success') throw new Error('Sensibo nepotvrdilo požadavek');
  return data.result;
}

async function controller(signal) {
  const pods = await request('/users/me/pods', { params: { fields: 'id,room,acState,measurements,isAlive,remoteCapabilities' }, signal });
  if (!Array.isArray(pods)) throw new Error('Sensibo nevrátilo zařízení');
  const available = pods.filter((pod) => typeof pod.id === 'string' && typeof pod.acState?.on === 'boolean');
  const id = env.SENSIBO_DEVICE_ID?.trim();
  return id ? available.find((pod) => pod.id === id) : available.length === 1 ? available[0] : null;
}

function controls(pod) {
  const { acState, remoteCapabilities, measurements } = pod;
  const supported = remoteCapabilities?.modes ?? {};
  const current = supported[acState.mode];
  const unit = acState.temperatureUnit === 'F' ? 'F' : 'C';
  const temperaturesByMode = Object.fromEntries(Object.entries(supported).map(([mode, capabilities]) => {
    const values = capabilities?.temperatures?.[unit]?.values;
    return [mode, Array.isArray(values) ? values.filter(Number.isInteger) : []];
  }));
  return {
    name: typeof pod.room?.name === 'string' ? pod.room.name : null,
    online: pod.isAlive !== false,
    on: acState.on,
    mode: acState.mode,
    temperature: acState.targetTemperature,
    unit,
    fan: acState.fanLevel,
    measured: measurements?.temperature,
    modes: Object.keys(modes).filter((key) => Object.hasOwn(supported, key)).map((key) => [key, modes[key]]),
    temperatures: temperaturesByMode[acState.mode] ?? [],
    temperaturesByMode,
    fanLevels: Array.isArray(current?.fanLevels) ? current.fanLevels.filter((level) => typeof level === 'string') : [],
  };
}

export async function readSensiboDevice() {
  const pod = await controller();
  return pod ? { id: pod.id, ...controls(pod) } : null;
}

async function confirmState(podId, matches) {
  const signal = AbortSignal.timeout(4000);
  for (const wait of [0, 400, 900]) {
    if (wait) await delay(wait, undefined, { signal });
    const updated = await controller(signal);
    if (updated?.id === podId && updated.isAlive !== false && matches(updated.acState)) return updated;
  }
  throw new Error('Sensibo nepotvrdilo změnu stavu klimatizace');
}

function changeProperty(pod, property, value) {
  const path = '/pods/' + encodeURIComponent(pod.id) + '/acStates/' + property;
  return request(path, { method: 'PATCH', body: { currentAcState: pod.acState, newValue: value } });
}

export async function executeSensiboTimerStep({ deviceId, unit, mode }, { kind, temperature }) {
  let pod = await controller();
  if (!pod || pod.id !== deviceId || pod.isAlive === false) throw new Error('Klimatizace je nedostupná');
  if (kind === 'temperature' && !pod.acState.on) return 'skipped';
  if (kind !== 'stop') {
    const options = controls(pod);
    const requestedMode = mode ?? pod.acState.mode;
    if (options.unit !== unit || !options.temperaturesByMode[requestedMode]?.includes(temperature)) {
      throw new Error('Klimatizace tuto teplotu v aktuálním režimu nepodporuje.');
    }
    if (requestedMode !== pod.acState.mode) {
      await startInMode(pod, requestedMode, temperature);
      return 'done';
    }
  }
  if (kind !== 'temperature') {
    const on = kind === 'start';
    if (pod.acState.on !== on) {
      await changeProperty(pod, 'on', on);
      pod = await confirmState(pod.id, (state) => state.on === on);
    }
  }
  if (kind !== 'stop' && (pod.acState.targetTemperature !== temperature)) {
    const options = controls(pod);
    if (options.unit !== unit || !options.temperatures.includes(temperature)) {
      throw new Error('Klimatizace tuto teplotu v aktuálním režimu nepodporuje.');
    }
    await changeProperty(pod, 'targetTemperature', temperature);
    await confirmState(pod.id, (state) => state.on === true && state.targetTemperature === temperature);
  }
  return 'done';
}

export async function setSensiboEcoPower(device, on, targetTemperature, mode = device.mode) {
  const pod = await controller();
  if (pod?.id !== device.id || pod.isAlive === false || pod.acState.mode !== device.mode || pod.acState.on !== device.on) return false;
  if (on && targetTemperature != null) {
    const options = controls(pod);
    if (options.unit !== device.unit || !options.temperaturesByMode[mode]?.includes(targetTemperature)) {
      throw new Error('Klimatizace tuto teplotu v aktuálním režimu nepodporuje.');
    }
    await startInMode(pod, mode, targetTemperature);
  } else {
    await changeProperty(pod, 'on', on);
    await confirmState(pod.id, (state) => state.on === on);
  }
  return true;
}

async function startInMode(pod, mode, targetTemperature) {
  const acState = { ...modeState(pod, mode), targetTemperature };
  await request('/pods/' + encodeURIComponent(pod.id) + '/acStates', { method: 'POST', body: { acState } });
  await confirmState(pod.id, (state) => state.on === true && state.mode === mode && state.targetTemperature === targetTemperature);
}

function modeState(pod, mode) {
  const { acState } = pod;
  const capabilities = pod.remoteCapabilities.modes[mode];
  const unit = acState.temperatureUnit === 'F' ? 'F' : 'C';
  const temperatures = capabilities.temperatures?.[unit]?.values;
  const state = { on: true, mode };
  if (temperatures?.length) {
    const preferred = acState.targetTemperature ?? (unit === 'F' ? 75 : 24);
    state.targetTemperature = temperatures.reduce((closest, value) =>
      Math.abs(value - preferred) < Math.abs(closest - preferred) ? value : closest);
    state.temperatureUnit = unit;
  }
  const fans = capabilities.fanLevels;
  if (fans?.length) state.fanLevel = fans.includes(acState.fanLevel) ? acState.fanLevel : fans.includes('auto') ? 'auto' : fans[0];
  if (capabilities.swing?.includes(acState.swing)) state.swing = acState.swing;
  return state;
}

export async function setSensibo({ property, value, temperature }) {
  const pod = await controller();
  if (!pod || pod.isAlive === false) return { error: 'Klimatizace je nedostupná', status: 503 };
  const options = controls(pod);
  const valid = property === 'on' || property === 'syncOn' ? typeof value === 'boolean'
    : property === 'mode' ? options.modes.some(([mode]) => mode === value)
    : property === 'targetTemperature' ? options.temperatures.includes(value)
    : property === 'fanLevel' && options.fanLevels.includes(value);
  if (!valid) return { error: 'Klimatizace tuto volbu nepodporuje', status: 400 };
  if (property === 'mode' && temperature != null) {
    if (options.unit !== 'C' || !options.temperaturesByMode[value]?.includes(temperature)) {
      return { error: 'Klimatizace tuto teplotu v režimu nepodporuje.', status: 400 };
    }
    await startInMode(pod, value, temperature);
    return { ok: true };
  }
  if ((property === 'on' || property === 'syncOn') && pod.acState.on === value) return { ok: true };
  const path = '/pods/' + encodeURIComponent(pod.id) + '/acStates';
  if (property === 'mode') {
    await request(path, { method: 'POST', body: { acState: modeState(pod, value) } });
  } else if (property === 'syncOn') {
    await request(path + '/on', { method: 'PATCH', body: { newValue: value, reason: 'StateCorrectionByUser' } });
  } else {
    await changeProperty(pod, property, value);
  }
  if (property === 'mode' || property === 'on' || property === 'syncOn') {
    const field = property === 'syncOn' ? 'on' : property;
    await confirmState(pod.id, (state) => state[field] === value && (property !== 'mode' || state.on === true));
  }
  return { ok: true };
}
