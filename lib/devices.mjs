import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { config, env, enabled, goodweSems, stateDir } from './config.mjs';
import { goodweCloud } from './goodwe-cloud.mjs';
import { logEvent } from './log.mjs';
import { heatingPlan, heatingProgram, repeatHeatingDay } from './heating-plan.mjs';

const run = promisify(execFile);
const netatmoBase = 'https://api.netatmo.com';
const netatmoReadPaths = new Set(['getstationsdata', 'getmeasure', 'getroommeasure', 'homesdata', 'homestatus']);
const tokenFile = join(stateDir, 'netatmo.json');
let token;
let refreshPending;

async function accessToken() {
  if (token?.expires > Date.now() + 60_000) return token.access;
  if (refreshPending) return refreshPending;
  refreshPending = (async () => {
    if (!token) {
      try {
        token = JSON.parse(await readFile(tokenFile, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (token?.expires > Date.now() + 60_000) return token.access;
    const refresh = token?.refresh || env.NETATMO_REFRESH_TOKEN;
    if (!refresh) throw new Error('Chybí Netatmo refresh token');
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    await chmod(stateDir, 0o700);
    const response = await fetch(netatmoBase + '/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.NETATMO_CLIENT_ID,
        client_secret: env.NETATMO_CLIENT_SECRET,
        refresh_token: refresh,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Netatmo OAuth HTTP ' + response.status);
    const result = await response.json();
    if (!result.access_token || !result.expires_in) throw new Error('Netatmo nevrátil přístupový token');
    token = {
      access: result.access_token,
      refresh: result.refresh_token || refresh,
      expires: Date.now() + result.expires_in * 1000,
    };
    const temporary = tokenFile + '.tmp';
    await writeFile(temporary, JSON.stringify(token), { mode: 0o600 });
    await rename(temporary, tokenFile);
    return token.access;
  })().finally(() => {
    refreshPending = null;
  });
  return refreshPending;
}

async function netatmo(path, params = {}) {
  const url = new URL('/api/' + path, netatmoBase);
  const access = await accessToken();
  const request = () =>
    fetch(url, {
      method: 'POST',
      body: new URLSearchParams(params),
      headers: { Authorization: 'Bearer ' + access },
      signal: AbortSignal.timeout(8000),
    });
  let response = await request();
  if (netatmoReadPaths.has(path) && [502, 503, 504].includes(response.status)) {
    logEvent('warning', 'request.retry', { source: 'netatmo', operation: path, status: response.status });
    await response.body?.cancel().catch(() => {});
    await delay(800);
    response = await request();
  }
  if (response.status === 401 && token?.access === access) token.expires = 0;
  if (!response.ok) {
    const error = new Error('Netatmo ' + path + ' HTTP ' + response.status);
    if (response.status === 403 && ['setthermmode', 'setroomthermpoint', 'synchomeschedule'].includes(path)) {
      error.code = 'NETATMO_WRITE_FORBIDDEN';
    }
    throw error;
  }
  const result = await response.json();
  if (result.error || (result.status && result.status !== 'ok'))
    throw new Error('Netatmo ' + path + ' odmítlo požadavek');
  return result.body;
}

function batteryReading(module) {
  const percent = module?.battery_percent;
  return {
    percent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null,
    state: module?.battery_state ?? null,
    reachable: Boolean(module && module.reachable !== false),
  };
}

function netatmoConnection(module, wifi = false) {
  const strength = wifi ? module?.wifi_status ?? module?.wifi_strength : module?.rf_status ?? module?.rf_strength;
  return {
    kind: wifi ? 'wifi' : 'radio',
    strength: Number.isFinite(strength) ? strength : null,
    state: wifi ? module?.wifi_state : module?.rf_state,
    reachable: Boolean(module && module.reachable !== false),
    lastSeen: module?.last_seen ? module.last_seen * 1000 : null,
    firmware: module?.firmware_revision ?? module?.firmware,
  };
}

export async function station() {
  const { devices = [] } = await netatmo('getstationsdata');
  return devices
    .flatMap((base) => [base, ...(base.modules ?? [])].map((module) => {
      const data = module.dashboard_data ?? {};
      return {
        id: module._id,
        deviceId: base._id,
        name: module.module_name || module.station_name || module.type,
        outdoor: module.type === 'NAModule1',
        battery: module !== base ? batteryReading(module) : null,
        connection: netatmoConnection(module, module === base),
        temperature: data.Temperature,
        humidity: data.Humidity,
        co2: data.CO2,
        noise: data.Noise,
        measuresNoise: module.type === 'NAMain',
        pressure: data.Pressure,
        min: data.min_temp,
        max: data.max_temp,
        time: data.time_utc ? data.time_utc * 1000 : null,
      };
    }));
}

async function netatmoHistory(path, params, fields) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 86_400;
  const data = await netatmo(path, {
    ...params,
    scale: 'max', type: fields.join(','), date_begin: start, date_end: end,
    optimize: 'false', real_time: 'true',
  });
  const series = Object.fromEntries(fields.map((key) => [key.toLowerCase(), []]));
  for (const [key, values] of Object.entries(data ?? {})) {
    const time = Number(key);
    if (!Array.isArray(values) || time < start || time > end || !Number.isFinite(time)) continue;
    fields.forEach((field, index) => {
      if (Number.isFinite(values[index])) series[field.toLowerCase()].push([time * 1000, values[index]]);
    });
  }
  for (const points of Object.values(series)) points.sort(([a], [b]) => a - b);
  return { start: start * 1000, end: end * 1000, series };
}

export function stationHistory(meter) {
  const fields = meter.outdoor ? ['Temperature'] : ['Temperature', 'Humidity', 'CO2'];
  if (meter.measuresNoise) fields.push('Noise');
  const params = { device_id: meter.deviceId };
  if (meter.id !== meter.deviceId) params.module_id = meter.id;
  return netatmoHistory('getmeasure', params, fields);
}

export function heatingHistory(homeId, roomId) {
  return netatmoHistory('getroommeasure', { home_id: homeId, room_id: roomId }, ['temperature']);
}

export async function homes() {
  return (await netatmo('homesdata'))?.homes ?? [];
}

async function heatingHome() {
  const available = await homes();
  const homeId = env.NETATMO_HOME_ID || config.netatmoHomeId;
  const home = homeId ? available.find((item) => item.id === homeId) : available.length === 1 ? available[0] : null;
  if (!home) throw new Error('Nastavte NETATMO_HOME_ID pro domácnost s topením');
  return home;
}

export async function getHeatingProgram() {
  return heatingProgram(await heatingHome());
}

export async function saveHeatingProgram({ revision, periods, temperatures }) {
  if (typeof revision !== 'string' || !Array.isArray(temperatures)) {
    return { status: 400, error: 'Neplatná změna programu.' };
  }
  const home = await heatingHome();
  const program = heatingProgram(home);
  if (!program?.editable) return { status: 503, error: 'Program topení je nedostupný.' };
  if (program.revision !== revision) {
    return { status: 409, error: 'Program se mezitím změnil. Otevřete jej znovu.' };
  }
  const timetable = repeatHeatingDay(program, periods);
  if (!timetable) return { status: 400, error: 'Rozvrh musí začínat o půlnoci a časy musí být seřazené bez duplicit.' };
  const zoneRooms = new Map(program.zones.map(({ id, rooms }) => [id, new Map(rooms.map((room) => [room.id, room]))]));
  const seen = new Set();
  let temperaturesChanged = false;
  for (const change of temperatures) {
    const room = change && zoneRooms.get(change.zoneId)?.get(change.roomId);
    const key = change && JSON.stringify([change.zoneId, change.roomId]);
    if (!room || seen.has(key) || !Number.isFinite(change.temperature) || change.temperature < 5 ||
        change.temperature > 30 || !Number.isInteger(change.temperature * 2)) {
      return { status: 400, error: 'Zvolte teplotu 5 až 30 °C po půl stupni.' };
    }
    seen.add(key);
    temperaturesChanged ||= room.therm_setpoint_temperature !== change.temperature;
    room.therm_setpoint_temperature = change.temperature;
  }
  if (!temperaturesChanged && JSON.stringify(timetable) === JSON.stringify(program.timetable)) return { status: 200, ok: true };
  await netatmo('synchomeschedule', {
    home_id: home.id,
    schedule_id: program.id,
    name: program.name,
    zones: JSON.stringify(program.zones),
    timetable: JSON.stringify(timetable),
    away_temp: program.away_temp,
    hg_temp: program.hg_temp,
  });
  return { status: 200, ok: true };
}

export async function heating() {
  const home = await heatingHome();
  const { home: status, errors } = await netatmo('homestatus', { home_id: home.id });
  if (
    !status?.rooms?.some((room) => room.therm_measured_temperature != null || room.therm_setpoint_temperature != null)
  ) {
    const relayUnavailable = errors?.some(
      (error) => error.code === 6 && home.modules?.some((module) => module.id === error.id && module.type === 'NAPlug'),
    );
    throw new Error(relayUnavailable ? 'Relé topení Netatmo je nedostupné' : 'Netatmo nevrátilo údaje o topení');
  }
  const names = new Map((home.rooms || []).map((room) => [room.id, room.name]));
  const boiler = status.modules?.find((module) =>
    module.reachable !== false && typeof module.boiler_status === 'boolean' &&
    !errors?.some(({ id }) => id === module.id || id === module.bridge),
  );
  const boilerDemandRooms = boiler?.boiler_valve_comfort_boost === true
    ? status.rooms
      .filter((room) => room.reachable !== false && room.heating_power_request > 0)
      .map((room) => names.get(room.id))
      .filter(Boolean)
    : [];
  const { roomPlans, scheduleName, awayTarget } = heatingPlan(home, status);
  const statusByModule = new Map(status.modules?.map((module) => [module.id, module]));
  const roomsByModule = new Map((home.rooms ?? []).flatMap((room) =>
    (room.module_ids ?? []).map((id) => [id, room]),
  ));
  return {
    homeId: home.id,
    boilerOn: boiler?.boiler_status ?? null,
    boilerDemandRooms,
    mode: status.therm_mode ?? home.therm_mode ?? null,
    scheduleName,
    awayTarget,
    relays: (home.modules ?? []).filter(({ type }) => type === 'NAPlug').map(({ id, name }) => ({
      id,
      name: roomsByModule.get(id)?.name ?? name ?? 'Bez místnosti',
      kind: 'Relé kotle',
      connection: netatmoConnection(errors?.some((error) => error.id === id) ? null : statusByModule.get(id), true),
    })),
    batteries: (home.modules ?? []).filter(({ type }) => ['NRV', 'NATherm1', 'OTM'].includes(type))
      .map(({ id, name, type }) => ({
        id,
        roomId: roomsByModule.get(id)?.id,
        name: roomsByModule.get(id)?.name ?? name ?? 'Bez místnosti',
        kind: type === 'NRV' ? 'Hlavice' : 'Termostat',
        ...batteryReading(statusByModule.get(id)),
        connection: netatmoConnection(statusByModule.get(id)),
      })),
    rooms: (status.rooms ?? [])
      .filter((room) => room.therm_measured_temperature != null || room.therm_setpoint_temperature != null)
      .map((room) => ({
        id: room.id,
        name: names.get(room.id) || room.id,
        reachable: room.reachable !== false,
        temperature: room.therm_measured_temperature,
        target: room.therm_setpoint_temperature,
        power: room.heating_power_request,
        mode: room.therm_setpoint_mode,
        endsAt: room.therm_setpoint_end_time ? room.therm_setpoint_end_time * 1000 : null,
        ...roomPlans.get(room.id),
      })),
  };
}

export async function setHeatingMode(homeId, mode) {
  await netatmo('setthermmode', { home_id: homeId, mode });
}

export async function setHeating(homeId, roomId, temperature, durationHours = 2) {
  const params = { home_id: homeId, room_id: roomId, mode: temperature === null ? 'home' : 'manual' };
  if (temperature !== null) {
    params.temp = temperature;
    params.endtime = Math.floor(Date.now() / 1000) + durationHours * 3600;
  }
  await netatmo('setroomthermpoint', params);
}

async function fibaroRequest(path, body, signal = AbortSignal.timeout(6000)) {
  const url = new URL(path, env.FIBARO_URL);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = {
    Authorization: 'Basic ' + Buffer.from(env.FIBARO_USER + ':' + env.FIBARO_PASSWORD).toString('base64'),
    Accept: 'application/json',
  };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  const method = body === undefined ? 'GET' : 'POST';
  if (url.protocol === 'http:') {
    const response = await fetch(url, {
      method,
      body: payload,
      headers,
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error('Fibaro HTTP ' + response.status);
    const data = await response.text();
    return method === 'GET' && data ? JSON.parse(data) : null;
  }
  if (url.protocol !== 'https:') throw new Error('Neplatná URL Fibaro');
  const fingerprint = (env.FIBARO_TLS_FINGERPRINT || '').replaceAll(':', '').toUpperCase();
  const options = { method, headers, agent: false };
  if (env.FIBARO_CA_FILE) options.ca = await readFile(env.FIBARO_CA_FILE);
  if (fingerprint) {
    if (!/^[0-9A-F]{64}$/.test(fingerprint)) throw new Error('Neplatný otisk Fibaro');
    const agent = new https.Agent();
    agent.createConnection = (connection, done) => {
      const socket = tls.connect({ ...connection, rejectUnauthorized: false });
      const onError = (error) => done(error);
      socket.once('error', onError);
      socket.setTimeout(5000, () => socket.destroy(new Error('Fibaro TLS timeout')));
      socket.once('secureConnect', () => {
        if (socket.getPeerCertificate().fingerprint256?.replaceAll(':', '') !== fingerprint) {
          socket.destroy(new Error('Otisk certifikátu Fibaro nesouhlasí'));
          return;
        }
        socket.removeListener('error', onError);
        socket.setTimeout(0);
        done(null, socket);
      });
    };
    options.agent = agent;
  }
  try {
    return await new Promise((resolve, reject) => {
      const request = https.request(url, { ...options, signal }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error('Fibaro HTTP ' + response.statusCode));
            return;
          }
          try {
            const data = Buffer.concat(chunks).toString();
            resolve(method === 'GET' && data ? JSON.parse(data) : null);
          } catch (error) {
            reject(error);
          }
        });
      });
      request.on('error', reject);
      request.end(payload);
    });
  } finally {
    if (fingerprint) options.agent.destroy();
  }
}

const isVisibleFibaroDevice = (device) => device.enabled !== false && device.visible !== false;
const canSwitchFibaroDevice = (device) => Object.hasOwn(device?.actions ?? {}, 'turnOn') && Object.hasOwn(device?.actions ?? {}, 'turnOff');
const isFibaroDeviceOn = (value) => value === true || value === 'true' || (Number.isFinite(Number(value)) && Number(value) > 0);
const fibaroDeviceState = (properties) => {
  const state = properties?.state ?? properties?.value;
  return state == null ? null : isFibaroDeviceOn(state);
};

export const fibaroColorPresets = new Map([
  ['red', [255, 0, 0, 0]],
  ['pink', [255, 45, 115, 0]],
  ['yellow', [255, 215, 0, 0]],
  ['green', [0, 255, 0, 0]],
  ['blue', [0, 0, 255, 0]],
  ['white', [0, 0, 0, 255]],
  ['purple', [140, 0, 255, 0]],
]);

function parseFibaroColor(value) {
  if (typeof value !== 'string' || !/^\s*\d{1,3}(?:\s*,\s*\d{1,3}){3}\s*$/.test(value)) return null;
  const channels = value.split(',').map(Number);
  return channels.every((channel) => channel <= 255) ? channels : null;
}

function fibaroColorReading(properties, on) {
  const current = parseFibaroColor(properties?.color);
  const saved = parseFibaroColor(properties?.lastColorSet);
  const channels = (on === false ? [saved, current] : [current, saved])
    .find((color) => color?.some((channel) => channel > 0));
  if (!channels) return null;

  const peak = Math.max(...channels);
  const brightness = Math.max(1, Math.round(peak * 100 / 255));
  const matches = [];
  for (const [name, preset] of fibaroColorPresets) {
    const differences = preset.map((channel, index) => Math.abs(Math.round(channel * peak / 255) - channels[index]));
    if (differences.every((difference) => difference === 0)) {
      return { preset: name, channels: preset, brightness };
    }
    if (differences.every((difference) => difference <= 1)) matches.push(name);
  }
  if (matches.length === 1) return { preset: matches[0], channels: fibaroColorPresets.get(matches[0]), brightness };
  return { preset: null, channels: channels.map((channel) => channel * 255 / peak), brightness };
}

export async function fibaroDevices() {
  const [devices, rooms] = await Promise.all([
    fibaroRequest('/api/devices'),
    fibaroRequest('/api/rooms').catch((error) => {
      logEvent('warning', 'fibaro.rooms_failed', { source: 'fibaroDevices' }, error);
      return [];
    }),
  ]);
  const roomNames = new Map((Array.isArray(rooms) ? rooms : []).map(({ id, name }) => [id, name]));
  const settings = config.fibaro?.devices ?? {};
  const meters = new Map((config.fibaro?.powerMeters ?? []).map((meter) => [meter.id, meter]));
  const lights = new Set((config.fibaro?.actions ?? []).filter(({ type }) => type === 'light').map(({ id }) => id));
  return devices.flatMap((device) => {
    const custom = settings[device.id] ?? {};
    if (!isVisibleFibaroDevice(device) || custom.hidden === true) return [];
    const meter = meters.get(device.id);
    const showPower = Boolean(meter) || custom.power === true;
    const switchable = !showPower && (custom.light === true || lights.has(device.id)) && canSwitchFibaroDevice(device);
    if (!switchable && !showPower) return [];
    const { value, dead, power, unit } = device.properties ?? {};
    const online = dead !== true && dead !== 'true';
    const rgb = switchable && device.type === 'com.fibaro.FGRGBW441M' && Object.hasOwn(device.actions, 'setColor');
    const on = switchable ? fibaroDeviceState(device.properties) : null;
    return [{
      id: device.id,
      name: custom.name ?? meter?.name ?? device.name,
      room: custom.room ?? meter?.room ?? roomNames.get(device.roomID) ?? null,
      icon: custom.icon ?? meter?.icon ?? (switchable ? 'bulb' : 'home'),
      online,
      switchable,
      rgb,
      on,
      ...(rgb && online ? { rgbColor: fibaroColorReading(device.properties, on) } : {}),
      reading: !online ? null : showPower && Number.isFinite(power) ? { value: power, unit: 'W' }
        : Number.isFinite(value) && ['°C', 'W', 'kWh'].includes(unit) ? { value, unit } : null,
    }];
  });
}

export async function fibaroInventory() {
  const [devices, scenes] = await Promise.all([fibaroRequest('/api/devices'), fibaroRequest('/api/scenes')]);
  return {
    devices: devices
      .filter(isVisibleFibaroDevice)
      .map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        actions: Object.keys(device.actions ?? {}),
        value: device.properties?.value,
      })),
    scenes: scenes.map((scene) => ({ id: scene.id, name: scene.name })),
  };
}

export async function fibaro() {
  const actions = config.fibaro?.actions ?? [];
  const devices = actions.some((action) => action.type === 'light') ? await fibaroRequest('/api/devices') : [];
  const scenes =
    actions.some((action) => action.type === 'scene') || !devices.length ? await fibaroRequest('/api/scenes') : [];
  return actions.map((action) => {
    if (action.type === 'scene') {
      return {
        key: action.key,
        name: action.name,
        type: action.type,
        available: scenes.some((scene) => scene.id === action.id),
      };
    }
    const device = devices.find((item) => item.id === action.id);
    const value = device?.properties?.value;
    const available =
      device?.enabled !== false &&
      device?.properties?.dead !== true &&
      canSwitchFibaroDevice(device);
    const on = isFibaroDeviceOn(value);
    return { key: action.key, name: action.name, type: action.type, available, on };
  });
}

export async function fibaroPower() {
  const meters = config.fibaro?.powerMeters ?? [];
  const readings = await Promise.allSettled(meters.map(async ({ id }) => {
    const { enabled, properties } = await fibaroRequest('/api/devices/' + id);
    const power = properties?.power;
    if (enabled === false || properties?.dead === true || properties?.dead === 'true' || !Number.isFinite(power)) {
      throw new Error('Měřič ' + id + ' nevrátil příkon');
    }
    return power;
  }));
  const result = readings.map((item, index) => {
    const { id } = meters[index];
    if (item.status === 'rejected') {
      logEvent('warning', 'meter.failed', { source: 'fibaroPower', id }, item.reason);
      return { id, power: null };
    }
    return { id, power: item.value };
  });
  if (readings.length && readings.every((item) => item.status === 'rejected')) {
    throw new Error('Žádný měřič Fibaro nevrátil příkon');
  }
  return result;
}

const fibaroDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', dateStyle: 'short' });

export async function fibaroConsumption(id, date = fibaroDay.format(Date.now())) {
  const data = await fibaroRequest('/api/energy/consumption/device/' + id + '/detail?' + new URLSearchParams({ periods: date }));
  const consumption = data?.energy?.find((item) => item.period === date)?.consumption;
  return Number.isFinite(consumption) ? consumption : null;
}

export async function fibaroHistory(id, current, includeConsumption) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 86_400;
  const date = fibaroDay.format(end * 1000);
  const limit = 12_000;
  const getEvents = (to) => fibaroRequest('/api/events/history?' + new URLSearchParams({
    from: start, to, eventType: 'DevicePropertyUpdatedEvent',
    objectType: 'device', objectId: id, numberOfRecords: limit,
  }));
  const [events, energy] = await Promise.allSettled([
    getEvents(end),
    includeConsumption ? fibaroConsumption(id, date) : null,
  ]);
  if (events.status === 'rejected' && (!includeConsumption || energy.status === 'rejected')) throw events.reason;
  if (events.status === 'rejected') logEvent('warning', 'fibaro.history_events_failed', { id }, events.reason);
  if (energy.status === 'rejected') logEvent('warning', 'fibaro.history_energy_failed', { id }, energy.reason);
  const points = new Map();
  const rows = Array.isArray(events.value) ? events.value : [];
  const oldest = rows.at(-1)?.timestamp;
  const older = rows.length === limit && oldest > start
    ? await getEvents(oldest - 1).catch((error) => {
      logEvent('warning', 'fibaro.history_events_failed', { id }, error);
      return [];
    }) : [];
  for (const event of [...rows, ...(Array.isArray(older) ? older : [])].reverse()) {
    const { data, timestamp } = event;
    if (data?.id === id && data.property === 'power' && Number.isFinite(data.newValue) && timestamp >= start && timestamp <= end) {
      points.set(timestamp * 1000, data.newValue);
    }
  }
  if (Number.isFinite(current?.power) && current.at >= start * 1000 && current.at <= (end + 1) * 1000) {
    points.set(Math.min(current.at, end * 1000), current.power);
  }
  const buckets = new Map();
  for (const point of [...points].sort(([a], [b]) => a - b)) {
    const key = Math.floor(point[0] / 120_000);
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, [point, point, point, point]);
      continue;
    }
    if (point[1] < bucket[1][1]) bucket[1] = point;
    if (point[1] > bucket[2][1]) bucket[2] = point;
    bucket[3] = point;
  }
  return {
    start: start * 1000, end: end * 1000,
    series: { power: [...buckets.values()].flatMap((bucket) => [...new Set(bucket)].sort(([a], [b]) => a - b)) },
    consumption: energy.value ?? null,
  };
}

export async function activateFibaro(action, on) {
  if (action.type === 'scene') {
    const result = await fibaroRequest('/api/scenes/' + action.id + '/execute', {});
    if (action.key === 'lamps-on' || action.key === 'lamps-off') {
      const sceneOn = action.key === 'lamps-on';
      await Promise.all((config.fibaro?.ledSceneDevices ?? []).map((id) =>
        confirmFibaroLight(id, (properties) => fibaroDeviceState(properties) === sceneOn),
      ));
    }
    return result;
  }
  return fibaroRequest('/api/devices/' + action.id + '/action/' + (on ? 'turnOn' : 'turnOff'), { args: [] });
}

export async function switchFibaroDevice(device, on) {
  await activateFibaro(device, on);
  await confirmFibaroLight(device.id, (properties) => fibaroDeviceState(properties) === on);
}

export async function setFibaroLightColor(device, color, brightness) {
  const channels = color.map((channel) => Math.round(channel * brightness / 100));
  await fibaroRequest('/api/devices/' + device.id + '/action/setColor', { args: channels });
  await confirmFibaroLight(device.id, (properties) => {
    const current = parseFibaroColor(properties.color);
    return fibaroDeviceState(properties) === true && current &&
      current.every((channel, index) => Math.abs(channel - channels[index]) <= 1);
  });
}

async function confirmFibaroLight(id, matches) {
  const signal = AbortSignal.timeout(5000);
  for (const wait of [0, 250, 500, 1000, 1500]) {
    if (wait) await delay(wait, undefined, { signal });
    const { properties } = await fibaroRequest('/api/devices/' + id, undefined, signal);
    if (properties && ![true, 'true'].includes(properties.dead) && matches(properties)) return;
  }
  throw new Error('Fibaro nepotvrdilo změnu stavu světla');
}

export async function goodwe() {
  if (goodweSems) return goodweCloud();
  const port = Number(env.GOODWE_PORT || 8899);
  if (![8899, 502].includes(port)) throw new Error('Neplatný GoodWe port');
  try {
    const { stdout } = await run(
      env.GOODWE_PYTHON || '.venv/bin/python',
      ['lib/goodwe_reader.py', env.GOODWE_HOST, String(port)],
      { timeout: 8500 },
    );
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error('GoodWe LAN neodpovídá nebo chybí knihovna goodwe (' + (error.code || 'chyba') + ')');
  }
}

export const loaders = { station, heating, fibaro, fibaroPower, goodwe };
export { enabled };
