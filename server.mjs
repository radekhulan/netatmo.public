import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { config, demo, enabled, env, goodweSems, heatControl, stateDir } from './lib/config.mjs';
import { cachedSource } from './lib/cache.mjs';
import { createBatteryCache } from './lib/battery-cache.mjs';
import { logEvent } from './lib/log.mjs';
import { activateFibaro, fibaroColorPresets, fibaroConsumption, fibaroDevices, fibaroHistory, getHeatingProgram, heatingHistory, loaders, saveHeatingProgram, setFibaroLightColor, setHeating, setHeatingMode, stationHistory, switchFibaroDevice } from './lib/devices.mjs';
import { radar, radarImage, weather } from './lib/weather.mjs';
import { goodweDay } from './lib/goodwe-cloud.mjs';
import { executeSensiboTimerStep, readSensiboDevice, sensiboEnabled, setSensibo, setSensiboEcoPower } from './lib/sensibo.mjs';
import { changeClimateTimer, climateTimerControlsEco, climateTimerDraft, climateTimerDue, climateTimerSummary, climateTimerOwnsEco, climateTimerPresets, climateTimerState, climateTimerWaitingForStart, loadClimateTimer, runClimateTimer } from './lib/climate-timer.mjs';
import { createClimateEco } from './lib/climate-eco.mjs';
import { createEcoHistory } from './lib/climate-eco-history.mjs';
import { vacuumCommand, vacuumConfigured, vacuumRead } from './lib/roborock.mjs';
import { washerStatus } from './lib/hon.mjs';
import { airplusCommand, airplusConfigured, airplusStatus } from './lib/airplus.mjs';
import { coffeeConfigured, coffeeStatus, wakeCoffee } from './lib/coffeelink.mjs';
import { createVoiceHttp } from './lib/voice-http.mjs';
import { resolveVoiceRoom } from './lib/voice-intents.mjs';
import { voiceWeatherData, voiceWeatherRequest } from './lib/voice-weather.mjs';

const originList = (env.PANEL_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
const port = Number(env.PORT || 8765);
const allowedOrigins = new Set([...originList, 'http://127.0.0.1:' + port, 'http://localhost:' + port]);
const spotifyEnabled = Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_REDIRECT_URI);
const pragueDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
const sources = {
  weather: cachedSource('weather', weather, 10 * 60_000, 3 * 3600_000, pragueDate.format),
  radar: cachedSource('radar', radar, 2 * 60_000, 30 * 60_000),
  station: cachedSource('station', loaders.station, 3 * 60_000),
  heating: cachedSource('heating', loaders.heating, 60_000),
  fibaro: cachedSource('fibaro', loaders.fibaro, 15_000),
  fibaroPower: cachedSource('fibaroPower', loaders.fibaroPower, 15_000),
  goodwe: cachedSource('goodwe', loaders.goodwe, goodweSems ? 120_000 : 30_000, 30 * 60_000, pragueDate.format),
};
const powerMeters = config.fibaro?.powerMeters ?? [];
const fibaroDeviceSource = cachedSource('fibaroDevices', fibaroDevices, 15_000);
const washerPlugId = Number(Object.keys(config.fibaro?.devices ?? {}).find((id) => config.fibaro.devices[id].icon === 'washer'));
const washerEnergy = cachedSource('washerEnergy', async () => {
  const date = pragueDate.format(Date.now());
  return { date, consumption: await fibaroConsumption(washerPlugId, date) };
}, 2 * 60_000, 12 * 60_000, pragueDate.format);
const sensiboSource = cachedSource('sensibo', readSensiboDevice, 30_000);
const climateMeterId = config.climate?.powerMeterId;
const householdMeterId = config.climate?.householdPowerMeterId;
const ecoMeterAvailable = sensiboEnabled && enabled.fibaroPower && powerMeters.some(({ id }) => id === climateMeterId);
const limitHousehold = householdMeterId != null;
const ecoAvailable = ecoMeterAvailable && goodweSems && (!limitHousehold || (householdMeterId !== climateMeterId &&
  powerMeters.some(({ id }) => id === householdMeterId)));
const climateEco = createClimateEco(stateDir, { limitHousehold });
const ecoHistory = createEcoHistory(stateDir);
const batteryCache = createBatteryCache(stateDir);
const roomHistory = config.rooms.map((room) => cachedSource('roomHistory', async () => {
  const meter = stationForRoom(await source('station'), room);
  return meter ? stationHistory(meter) : null;
}, 5 * 60_000));
const heatingHistories = new Map();
const outdoorHistory = cachedSource('outdoorHistory', async () => {
  const meter = outdoorStation(await source('station'));
  return meter ? stationHistory(meter) : null;
}, 5 * 60_000);
const powerHistory = new Map(powerMeters.map(({ id, placement }) => [id, cachedSource('powerHistory', async () => {
  const current = await source('fibaroPower');
  return fibaroHistory(id, { power: current.data?.find((item) => item.id === id)?.power, at: contactTimes.get(powerMeterKey(id)) },
    id !== householdMeterId && placement !== 'solar');
}, 2 * 60_000)]));
const powerMeterKey = (id) => 'fibaroPower-' + id;
const demoActions = [
  { key: 'lamps-on', name: 'Zapnout lampičky', type: 'scene', available: true },
  { key: 'lamps-off', name: 'Vypnout lampičky', type: 'scene', available: true },
  { key: 'all-off', name: 'Vypnout všechna', type: 'scene', available: true },
  { key: 'lamp', name: 'Lampa', type: 'light', available: true },
];
const demoRoomValues = [
  [20.6, 46, 685, 21, 20.4],
  [21.2, 43, 917, 21.5, 21.0],
  [19.1, 51, 540, 19, 19.2],
  [21.0, 47, 720, 21, 20.8],
];
const files = new Set([
  'index.html',
  'style.css',
  'app.js',
  'spotify.js',
  'roborock.js',
  'i18n.js',
  'history.js',
  'voice.css',
  'voice.js',
  'voice-mic.js',
  'voice-worker.js',
  'voice-wake.js',
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'dm-sans.woff2',
  'dm-sans-ext.woff2',
  'dm-sans-license.txt',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(response, status, data, type = 'application/json; charset=utf-8', cache = 'no-store') {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      `default-src 'self'; script-src 'self'${env.VOICE_ENABLED === 'true' ? " 'wasm-unsafe-eval'" : ''} https://sdk.scdn.co; connect-src 'self' https://accounts.spotify.com https://api.spotify.com; img-src 'self' data: https://*.scdn.co https://*.spotifycdn.com; style-src 'self' 'unsafe-inline'; frame-src https://sdk.scdn.co; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`,
  });
  response.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

function demoReading(value) {
  return { state: 'demo', data: value };
}

const contactTimes = new Map(
  [...Object.keys(sources), ...powerMeters.map(({ id }) => powerMeterKey(id))].map((key) => {
    try {
      const value = Number(readFileSync(join(stateDir, key + '.last-seen'), 'utf8'));
      return [key, value > 0 && value <= Date.now() ? value : undefined];
    } catch {
      return [key, undefined];
    }
  }),
);

async function recordContact(key, at) {
  if (at <= (contactTimes.get(key) ?? 0)) return;
  contactTimes.set(key, at);
  const file = join(stateDir, key + '.last-seen');
  try {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const temporary = file + '.' + at + '.tmp';
    await writeFile(temporary, String(at), { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    logEvent('warning', 'contact.save_failed', { source: key }, error);
  }
}

async function source(key, force = false) {
  if (enabled[key]) {
    const result = await sources[key].get(force);
    if (result.state === 'live' && !result.data?.offline) {
      await recordContact(key, result.at);
      if (key === 'fibaroPower') {
        await Promise.all(result.data.filter(({ power }) => power != null).map(({ id }) =>
          recordContact(powerMeterKey(id), result.at),
        ));
      }
      return result;
    }
    return { ...result, at: contactTimes.get(key) };
  }
  if (!demo) return { state: 'off', at: contactTimes.get(key) };
  if (key === 'fibaro') return demoReading(demoActions);
  if (key === 'goodwe') return demoReading({ power: 2840, day: 12.7, yesterday: 13.1 });
  return demoReading(null);
}

function match(items, id, name) {
  return id
    ? items.find((item) => item.id === id)
    : items.find((item) => item.name?.localeCompare(name, 'cs', { sensitivity: 'base' }) === 0);
}

function stationForRoom(station, room) {
  return match((station.data ?? []).filter((item) => !item.outdoor), room.stationId, room.name);
}

function roomHeating(heat, source) {
  return {
    heat: heat && {
      id: heat.id,
      temperature: heat.temperature,
      target: heat.target,
      power: heat.power,
      mode: heat.mode,
      endsAt: heat.endsAt,
      next: heat.next,
      resumeAt: heat.resumeAt,
      reachable: heat.reachable,
    },
    canHeat: heatControl && source.state === 'live' && Boolean(heat?.reachable),
  };
}

function roomsFor(station, heating) {
  return config.rooms.map((room, index) => {
    const meter = stationForRoom(station, room);
    const heater = match(heating.data?.rooms ?? [], room.heatingId, room.name);
    const [temperature, humidity, co2, target, heatTemperature] = demoRoomValues[index % demoRoomValues.length];
    const roomMeter = station.state === 'demo' ? { temperature, humidity, co2, noise: index === 0 ? 37 : undefined } : meter;
    const roomHeat = heating.state === 'demo' ? { target, temperature: heatTemperature, mode: 'program' } : heater;
    return {
      name: room.name,
      icon: room.icon,
      meter: {
        temperature: roomMeter?.temperature,
        humidity: roomMeter?.humidity,
        co2: roomMeter?.co2,
        noise: roomMeter?.noise,
        measuresNoise: roomMeter?.measuresNoise,
        time: roomMeter?.time,
      },
      ...roomHeating(roomHeat, heating),
    };
  });
}

function outdoorStation(station) {
  const items = station.data ?? [];
  return config.outdoorStationId
    ? items.find((item) => item.id === config.outdoorStationId && item.outdoor)
    : items.find((item) => item.outdoor);
}

function outdoorFor(station) {
  if (station.state === 'demo') return { temperature: 8.1, humidity: 53, pressure: 1009, min: 2.1, max: 17 };
  const outdoor = outdoorStation(station);
  if (!outdoor) return null;
  const { temperature, humidity, min, max, time } = outdoor;
  return { temperature, humidity, min, max, time, pressure: station.data.find((item) => item.pressure != null)?.pressure };
}

function cacheBatteries(heating, station, force = false) {
  return batteryCache.update({
    heating: { state: heating.state, at: heating.at,
      data: heating.data?.batteries?.map(({ connection, ...battery }) => battery) ?? [] },
    station: { state: station.state, at: station.at,
      data: (station.data ?? []).filter(({ battery }) => battery).map(({ id, name, battery }) => ({ id, name, ...battery })) },
  }, force);
}

function batteryDiagnostics(heating, station) {
  const heatingRooms = new Map(heating.data?.rooms?.map((room) => [room.id, room]));
  return {
    heating: heating.state === 'live' ? [
      ...(heating.data?.batteries ?? []).map(({ id, name, roomId, kind, connection }) => {
        const room = heatingRooms.get(roomId);
        const power = kind === 'Hlavice' && connection.reachable && room?.reachable ? room.power : null;
        return { id, name, roomId, kind, connection, opening: Number.isFinite(power) && power >= 0 && power <= 100 ? power : null };
      }),
      ...(heating.data?.relays ?? []),
    ] : [],
    station: station.state === 'live' ? (station.data ?? []).map(({ id, name, battery, connection }) =>
      ({ id, name, kind: battery ? null : 'Základna', connection })) : [],
  };
}

let refreshingNetatmo;
async function refreshBatteries(force) {
  refreshingNetatmo ??= Promise.all([source('heating', true), source('station', true)])
    .finally(() => { refreshingNetatmo = null; });
  const [heating, station] = await refreshingNetatmo;
  const batteries = await cacheBatteries(heating, station, force);
  const available = [heating, station].filter(({ state }) => state === 'live').length;
  const failed = [heating, station].filter(({ state }) => ['error', 'stale'].includes(state)).length;
  return { batteries, available, failed, diagnostics: batteryDiagnostics(heating, station) };
}

async function goodweForDisplay(source) {
  const data = source.data;
  if (!goodweSems || source.state === 'demo' || (data && (data.provider !== 'SEMS+' || data.chart))) return source;
  try {
    const { start, end, points } = await ecoHistory.recent();
    const measuredAt = data?.measuredAt;
    const readings = points.filter(({ at, solar, status }) => Number.isFinite(solar) && solar >= 0 &&
      (Number.isFinite(measuredAt) ? at <= measuredAt : status !== 'missing'))
      .map(({ at, solar }) => [at, solar / 1000]);
    return readings.length > 1
      ? { ...source, state: data ? source.state : 'stale', data: {
        provider: 'SEMS+', ...data, chart: { start, end, points: readings, partial: true },
      } }
      : source;
  } catch (error) {
    logEvent('warning', 'goodwe.local_chart_failed', { source: 'goodwe' }, error);
    return source;
  }
}

async function snapshot() {
  const ledIds = config.fibaro?.ledSceneDevices ?? [];
  const [weather, radar, station, heating, fibaro, fibaroPower, goodwe, devices] = await Promise.all([
    ...['weather', 'radar', 'station', 'heating', 'fibaro', 'fibaroPower', 'goodwe'].map((key) => source(key)),
    enabled.fibaro && ledIds.length ? fibaroDeviceSource.get() : null,
  ]);
  const ledGroupOn = devices?.state === 'live' && ledIds.every((id) =>
    devices.data.some((device) => device.id === id && device.online && device.switchable && device.on === true),
  );
  const meters = powerMeters.map(({ id, name, room, icon }) => {
    const power = fibaroPower.data?.find((item) => item.id === id)?.power ?? null;
    return {
      id, name, room, icon, power,
      state: fibaroPower.state,
      at: contactTimes.get(powerMeterKey(id)),
    };
  });
  const rooms = roomsFor(station, heating);
  const heatingRooms = rooms.filter(({ heat }) => heat);
  const assigned = new Set(heatingRooms.map(({ heat }) => heat.id));
  for (const room of heating.data?.rooms ?? []) {
    if (!assigned.has(room.id)) heatingRooms.push({ name: room.name, ...roomHeating(room, heating) });
  }
  return {
    location: config.location?.name,
    rooms,
    heatingRooms,
    climate: sensiboEnabled ? { ...climateEco.overview(), ...climateTimerSummary() } : undefined,
    vacuum: vacuumConfigured(),
    ledGroupOn,
    powerMeters: meters,
    outdoor: outdoorFor(station),
    batteries: await cacheBatteries(heating, station),
    sources: {
      weather,
      radar,
      station: { state: station.state, at: station.at },
      heating: {
        state: heating.state,
        at: heating.at,
        boilerOn: heating.state === 'live' ? heating.data?.boilerOn ?? null : null,
        boilerDemandRooms: heating.state === 'live' ? heating.data?.boilerDemandRooms ?? [] : [],
        mode: heating.state === 'demo' ? 'schedule' : heating.data?.mode,
        scheduleName: heating.data?.scheduleName,
        programAvailable: Boolean(enabled.heating && heating.data?.scheduleName),
        awayTarget: heating.data?.awayTarget,
        canSetMode: heatControl && heating.state === 'live' && Boolean(heating.data?.rooms.length),
      },
      fibaro,
      goodwe: await goodweForDisplay(goodwe),
    },
    demo: [station, heating, fibaro, goodwe].some((item) => item.state === 'demo'),
  };
}

async function bodyOf(request, limit = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Příliš velký požadavek');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

const writes = new Set();
let climateRevision = 0;
let checkingEco = false;

async function checkClimateEco() {
  if (checkingEco || writes.has('sensibo')) return;
  checkingEco = true;
  const revision = climateRevision;
  try {
    const eco = climateEco.overview();
    const waitingForTimer = climateTimerWaitingForStart() || (eco.timerId && !climateTimerOwnsEco(eco.timerId));
    const [ac, meter, goodwe, station] = await Promise.all([sensiboSource.get(), source('fibaroPower'),
      ecoAvailable && eco.enabled && !waitingForTimer ? source('goodwe') : null, enabled.station ? source('station') : null]);
    if (revision !== climateRevision || writes.has('sensibo') || climateTimerDue()) return;
    writes.add('sensibo');
    let record;
    try {
      const solar = goodwe?.state === 'live' && !goodwe.data.offline ? goodwe.data : null;
      const meters = meter.state === 'live' ? meter.data : [];
      const changed = await climateEco.observe({
        device: ac.state === 'live' && ac.data?.online ? ac.data : null,
        power: meters.find(({ id }) => id === climateMeterId)?.power,
        householdPower: meters.find(({ id }) => id === householdMeterId)?.power,
        solar: solar?.power,
        solarAt: solar?.chart?.partial ? undefined : solar?.chart?.points.at(-1)?.[0],
        outdoor: station?.state === 'live' ? outdoorStation(station) : null,
        waitingForTimer,
        setPower: setSensiboEcoPower,
      });
      if (changed) sensiboSource.invalidate();
      if (eco.enabled) {
        const summary = climateEco.overview();
        const decision = summary.lastDecision;
        record = { at: decision?.at ?? Date.now(), solar: summary.solar, power: summary.power, householdPower: summary.householdPower,
          threshold: decision?.threshold ?? summary.threshold, ...(decision && { on: decision.on, constraint: decision.constraint,
            householdPercent: decision.householdPercent }), status: summary.status };
      }
    } finally {
      writes.delete('sensibo');
    }
    if (record) await ecoHistory.add(record).catch((error) => logEvent('warning', 'climate_eco.history_failed', {}, error));
  } catch (error) {
    logEvent('error', 'climate_eco.poll_failed', {}, error);
  } finally {
    checkingEco = false;
  }
}

async function runClimateTimerStep(timer, step) {
  const eco = climateEco.overview();
  const { kind, temperature } = step;
  if (typeof timer.steps[0].eco === 'boolean') {
    if (kind === 'stop' || !step.eco) {
      if (eco.enabled) await climateEco.enable(false);
      return executeSensiboTimerStep(timer, kind === 'temperature' ? { ...step, kind: 'start' } : step);
    }
    if (!ecoAvailable) throw new Error('Eco potřebuje SEMS+ a měřič klimatizace.');
  } else if (!ecoAvailable || !eco.enabled) return executeSensiboTimerStep(timer, step);
  if (kind === 'stop') {
    await climateEco.schedule(kind);
    return executeSensiboTimerStep(timer, step);
  }
  let device = await readSensiboDevice();
  if (device?.id !== timer.deviceId || !device.online) throw new Error('Klimatizace je nedostupná');
  const mode = timer.mode ?? device.mode;
  if (timer.unit !== device.unit || !device.temperaturesByMode[mode]?.includes(temperature)) {
    throw new Error('Klimatizace tuto teplotu v aktuálním režimu nepodporuje.');
  }
  if (step.eco && (!eco.enabled || eco.timerId !== timer.id || eco.controlMode !== mode || (device.on && device.mode !== mode))) {
    if (!['cool', 'heat'].includes(mode)) throw new Error('Pro Eco zvolte chlazení nebo topení.');
    if (device.on && device.mode !== mode) {
      await executeSensiboTimerStep(timer, { kind: 'stop' });
      device = { ...device, on: false };
    }
    await climateEco.enable(true, device, { timerId: timer.id, target: temperature, mode, ecoPercent: timer.ecoPercent });
  } else await climateEco.schedule(kind, temperature);
  if (!device.on) return { status: 'done', detail: kind === 'start' || step.eco
    ? 'Eco čeká na výrobu FVE.' : 'Teplota se použije při zapnutí.' };
  return executeSensiboTimerStep(timer, { ...step, kind: 'temperature' });
}

async function checkClimateTimer() {
  if (writes.has('sensibo') || !climateTimerDue()) return;
  writes.add('sensibo');
  try {
    await runClimateTimer(runClimateTimerStep);
  } catch (error) {
    logEvent('error', 'climate_timer.run_failed', {}, error);
  } finally {
    climateRevision++;
    sensiboSource.invalidate();
    writes.delete('sensibo');
    if (ecoAvailable && climateEco.state().enabled) setImmediate(checkClimateEco);
  }
}

function ecoResponse() {
  return { available: ecoAvailable, meterId: climateMeterId, householdMeterId,
    timerControlled: climateTimerControlsEco(), ...climateEco.state() };
}

async function command(path, request, response) {
  if (
    !allowedOrigins.has(request.headers.origin) ||
    request.headers['sec-fetch-site'] === 'cross-site' ||
    request.headers['content-type']?.split(';')[0] !== 'application/json'
  ) {
    return send(response, 403, { error: 'Požadavek musí přijít z panelu' });
  }
  let body;
  try {
    body = await bodyOf(request, path === '/api/heating/program' ? 32768 : undefined);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return send(response, 400, { error: 'Neplatný požadavek' });
  }
  return runCommand(path, body, (status, data) => send(response, status, data));
}

async function runCommand(path, body, respond) {
  if (path === '/api/batteries/refresh') {
    const result = await refreshBatteries(body.batteries !== false);
    return respond(result.available ? 200 : 502, result);
  }
  if (path === '/api/coffeelink') {
    if (body.action !== 'wake') return respond(400, { error: 'Neplatný požadavek' });
    try {
      const result = await wakeCoffee();
      const code = result.result === 'confirmed' ? 200 : result.result === 'unconfirmed' ? 502 : 409;
      return respond(code, result);
    } catch (error) {
      logEvent('warning', 'coffeelink.wake_failed', {}, error);
      return respond(502, { result: 'unconfirmed' });
    }
  }
  if (path === '/api/airplus') {
    if (writes.has('airplus')) return respond(409, { error: 'Počkejte na dokončení předchozí akce' });
    const run = airplusCommand(body);
    if (!run) return respond(400, { error: 'Neplatný požadavek' });
    writes.add('airplus');
    try {
      return respond(200, { data: await run });
    } catch (error) {
      logEvent('warning', 'airplus.command_failed', {}, error);
      return respond(502, { error: 'Čistička změnu nepotvrdila.' });
    } finally {
      writes.delete('airplus');
    }
  }
  if (path === '/api/roborock') {
    if (!vacuumConfigured()) return respond(503, { error: 'Roborock není připojený.' });
    if (writes.has('roborock')) return respond(409, { error: 'Počkejte na dokončení předchozí akce' });
    const run = vacuumCommand(body);
    if (!run) return respond(400, { error: 'Neplatný požadavek' });
    writes.add('roborock');
    try {
      await run;
      return respond(200, { ok: true });
    } catch (error) {
      if (error.code === 'InvalidRooms')
        return respond(409, { error: 'Mapa se změnila. Obnovte údaje a zvolte místnosti znovu.' });
      if (error.code === 'VacuumBusy')
        return respond(409, { error: 'Akce není v aktuálním stavu vysavače dostupná.' });
      if (error.code === 'RoborockUnsupportedFeature')
        return respond(409, { error: 'Roborock tento režim nepřijal.' });
      logEvent('warning', 'roborock.command_failed', { action: body.action }, error);
      return respond(502, { error: 'Vysavač nepotvrdil požadavek.' });
    } finally {
      writes.delete('roborock');
    }
  }
  const deviceCommand = path === '/api/fibaro/devices';
  const fibaro = path === '/api/fibaro' || deviceCommand;
  const timerCommand = path === '/api/sensibo/timer';
  const ecoCommand = path === '/api/sensibo/eco';
  const ecoSettingsCommand = path === '/api/sensibo/eco/settings';
  const sensibo = path === '/api/sensibo' || timerCommand || ecoCommand || ecoSettingsCommand;
  const key = sensibo ? 'sensibo' : fibaro ? 'fibaro' : 'heating';
  if (writes.has(key)) return respond(409, { error: 'Počkejte na dokončení předchozí akce' });
  writes.add(key);
  try {
    if (sensibo) {
      if (!sensiboEnabled) return respond(503, { error: 'Sensibo zatím není připojené' });
      if (ecoSettingsCommand) {
        if (!await climateEco.setLimits(body)) return respond(400, { error: 'Zkontrolujte limity Eco.' });
        return respond(200, { ok: true, ...ecoResponse() });
      }
      if (ecoCommand) {
        if (typeof body.enabled !== 'boolean') return respond(400, { error: 'Neplatný požadavek' });
        if (!ecoAvailable) return respond(503, { error: 'Eco potřebuje SEMS+ a měřič klimatizace.' });
        if (climateTimerControlsEco()) return respond(409, { error: 'Eco teď určuje časovač.' });
        if (body.enabled !== climateEco.state().enabled) {
          const device = body.enabled ? await readSensiboDevice() : null;
          if (body.enabled && (!device?.online || !['cool', 'heat'].includes(device.mode) || !device.temperatures.includes(device.temperature))) {
            return respond(409, { error: 'Pro Eco zvolte chlazení nebo topení.' });
          }
          await climateEco.enable(body.enabled, device);
        }
        return respond(200, { ok: true, ...ecoResponse() });
      }
      const result = await (timerCommand ? changeClimateTimer(body, ecoAvailable) : setSensibo(body));
      if (timerCommand && result.ok && body.action === 'cancel' && climateEco.state().timerId === body.id) {
        await climateEco.enable(false);
      }
      if (!timerCommand && result.ok && climateEco.state().enabled) {
        if (['on', 'mode', 'syncOn'].includes(body.property)) await climateEco.enable(false);
        if (body.property === 'targetTemperature') await climateEco.setTarget(body.value);
      }
      return respond(result.status ?? 200, result);
    } else if (deviceCommand) {
      const colorChange = Object.hasOwn(body, 'color');
      const valid = colorChange
        ? (fibaroColorPresets.has(body.color) || body.color === 'current') &&
          Number.isInteger(body.brightness) && body.brightness >= 1 && body.brightness <= 100
        : typeof body.on === 'boolean';
      if (!enabled.fibaro || !Number.isSafeInteger(body.id) || !valid) {
        return respond(400, { error: 'Akce Fibaro není povolena' });
      }
      const state = await fibaroDeviceSource.get();
      if (state.state !== 'live') return respond(503, { error: 'Akce Fibaro je nedostupná' });
      const device = state.data.find(({ id }) => id === body.id);
      if (!device?.switchable || (colorChange && !device.rgb)) {
        return respond(403, { error: 'Akce Fibaro není povolena' });
      }
      if (!device.online) return respond(503, { error: 'Akce Fibaro je nedostupná' });
      if (colorChange) {
        const channels = body.color === 'current' ? device.rgbColor?.channels : fibaroColorPresets.get(body.color);
        if (!channels) return respond(409, { error: 'Barvu světla se nepodařilo načíst.' });
        await setFibaroLightColor(device, channels, body.brightness);
        return respond(200, { ok: true });
      }
      await switchFibaroDevice(device, body.on);
      return respond(200, { ok: true, on: body.on });
    } else if (fibaro) {
      const action = (config.fibaro?.actions ?? []).find((item) => item.key === body.key);
      if (
        !enabled.fibaro ||
        !action ||
        !Number.isSafeInteger(action.id) ||
        !['light', 'scene'].includes(action.type) ||
        (action.type === 'light' && (typeof body.on !== 'boolean' || powerMeters.some(({ id }) => id === action.id)))
      ) {
        return respond(400, { error: 'Akce Fibaro není povolena' });
      }
      const state = await sources.fibaro.get();
      if (state.state !== 'live' || !state.data.find((item) => item.key === action.key)?.available) {
        return respond(503, { error: 'Akce Fibaro je nedostupná' });
      }
      await activateFibaro(action, body.on);
    } else {
      if (!heatControl || !enabled.heating) return respond(403, { error: 'Ovládání topení je vypnuté' });
      if (path === '/api/heating/program') {
        const { status, ...result } = await saveHeatingProgram(body);
        return respond(status, result);
      }
      if (path === '/api/heating/mode') {
        if (!['schedule', 'away'].includes(body.mode)) {
          return respond(400, { error: 'Zvolte běžný režim nebo Pryč' });
        }
        const state = await sources.heating.get();
        if (state.state !== 'live' || !state.data.rooms.length) {
          return respond(503, { error: 'Topení domácnosti je nedostupné' });
        }
        if (state.data.mode !== body.mode) await setHeatingMode(state.data.homeId, body.mode);
      } else {
        let { temperature } = body;
        const { delta, durationHours = 2 } = body;
        if (delta !== undefined && (temperature !== undefined || !Number.isFinite(delta) || delta === 0 ||
          Math.abs(delta) > 10 || !Number.isInteger(delta * 2))) {
          return respond(400, { error: 'Změna cíle musí být v půlstupních a nejvýš o 10 °C.' });
        }
        const validTemperature = (value) => Number.isFinite(value) && value >= 7 && value <= 28 && Number.isInteger(value * 2);
        if (delta === undefined && temperature !== null && !validTemperature(temperature)) {
          return respond(400, { error: 'Zvolte teplotu 7 až 28 °C po půl stupni' });
        }
        if (temperature !== null && ![1, 2, 3, 6, 8, 12].includes(durationHours)) {
          return respond(400, { error: 'Zvolte délku ručního nastavení' });
        }
        const state = await sources.heating.get(delta !== undefined);
        const room = state.state === 'live' && state.data.rooms.find((item) => item.id === body.id && item.reachable);
        if (!room) return respond(503, { error: 'Topení v místnosti je nedostupné' });
        if (delta !== undefined) {
          if (!Number.isFinite(room.target)) return respond(409, { error: 'Stávající cíl topení není dostupný.' });
          temperature = room.target + delta;
          if (!validTemperature(temperature)) return respond(400, { error: 'Výsledný cíl musí být 7 až 28 °C.' });
        }
        await setHeating(state.data.homeId, body.id, temperature, durationHours);
        if (delta !== undefined) return respond(200, { ok: true, temperature });
      }
    }
    return respond(200, { ok: true });
  } catch (error) {
    logEvent('error', 'command.failed', { source: key, operation: path }, error);
    if (error.code === 'NETATMO_WRITE_FORBIDDEN') {
      return respond(403, { error: 'Netatmo odmítlo změnu topení. Ověřte oprávnění write_thermostat.' });
    }
    return respond(502, { error: 'Zařízení nepotvrdilo akci. Ověřte stav na panelu.' });
  } finally {
    if (sensibo) {
      climateRevision++;
      if (timerCommand) setImmediate(checkClimateTimer);
      else if (!ecoCommand && !ecoSettingsCommand) sensiboSource.invalidate();
    }
    else sources[key].invalidate();
    if (fibaro) fibaroDeviceSource.invalidate();
    writes.delete(key);
    if (ecoMeterAvailable && (ecoCommand || ecoSettingsCommand || timerCommand)) setImmediate(checkClimateEco);
  }
}

function voiceHistory(source) {
  const { state, data } = source;
  if (!data) return { state };
  const series = Object.fromEntries(Object.entries(data.series).map(([name, rows]) => {
    if (!rows.length) return [name, { count: 0 }];
    const values = rows.map(([, value]) => value);
    return [name, {
      count: values.length, first: rows[0], last: rows.at(-1), min: Math.min(...values), max: Math.max(...values),
      sampleMean: values.reduce((sum, value) => sum + value, 0) / values.length,
      samples: rows.filter((_, index) => index % Math.max(1, Math.ceil(rows.length / 36)) === 0),
    }];
  }));
  return { state, start: data.start, end: data.end, consumptionKwh: data.consumption, series };
}

const voiceRoute = createVoiceHttp({
  env, stateDir, allowedOrigins, send, log: logEvent,
  deps: {
    config, rooms: roomsFor, outdoor: outdoorFor, eco: ecoResponse,
    station: () => source('station'), heating: () => source('heating'),
    solar: () => source('goodwe'), power: () => source('fibaroPower'), scenes: () => source('fibaro'),
    lights: () => enabled.fibaro ? fibaroDeviceSource.get() : { state: 'off' },
    climate: () => sensiboEnabled ? sensiboSource.get() : { state: 'off' },
    air: airplusStatus, washer: washerStatus, coffee: coffeeStatus, vacuum: vacuumRead, vacuumMap: () => vacuumRead('scope'),
    timer: () => ({ enabled: sensiboEnabled, timer: climateTimerState(), presets: climateTimerPresets() }),
    heatingProgram: getHeatingProgram,
    connections: () => ({
      fibaro: enabled.fibaro, heat: enabled.heating && heatControl, station: enabled.station, heating: enabled.heating,
      climate: sensiboEnabled, eco: ecoAvailable, power: enabled.fibaroPower, vacuum: vacuumConfigured(), solar: enabled.goodwe, batteries: enabled.station || enabled.heating,
      air: airplusConfigured(),
      washer: existsSync(join(stateDir, 'hon.json')),
      coffee: coffeeConfigured(),
      spotify: spotifyEnabled, weather: enabled.weather,
    }),
    command: (path, body) => runCommand(path, body, (status, data) => ({ status, data })),
    async diagnostics(question, previous) {
      const raw = [question, previous].filter(Boolean).join(' ').toLowerCase();
      const keywords = [
        [/temperature|heating|thermostat|living room|bedroom|humidity|co2|อุณหภูมิ|ห้องนอน|ความชื้น/, 'teplota'],
        [/air condition|cooling|ventilator|เครื่องปรับอากาศ|แอร์/, 'klimatizace'],
        [/solar|photovoltaic|แผงโซลาร์|โซลาร์เซลล์/, 'fotovoltaika'],
        [/light|electricity|consumption|หลอดไฟ|ไฟฟ้า/, 'svetlo spotreba'],
        [/vacuum|roborock|mop|clean the floor|ดูดฝุ่น|ถูพื้น|หุ่นยนต์/, 'vysavac uklid'],
        [/air purifier|particle|filter|เครื่องฟอกอากาศ/, 'cisticka vzduch'],
        [/washing machine|laundry|washer|เครื่องซักผ้า/, 'pracka'],
        [/coffee machine|coffee maker|espresso|เครื่องชงกาแฟ/, 'kavovar'],
      ];
      const text = raw.normalize('NFD').replace(/\p{M}/gu, '') + ' ' +
        keywords.filter(([pattern]) => pattern.test(raw)).map(([, word]) => word).join(' ');
      const historyWanted = /\b(histor|vcera|prumer|maximum|minimum|nejvyssi|nejnizsi|poslednich|vyvoj|od rana)\w*/.test(text);
      const mentionedRooms = new Set(text.split(/[^a-z]+/).map(resolveVoiceRoom).filter(Boolean));
      const jobs = [];
      const add = (name, read) => jobs.push(Promise.resolve().then(async () => [name, await read()])
        .catch(() => [name, { state: 'error' }]));
      if (/\b(eco|klimatizac|chlazen|ventilator|casovac|plan klimatizac)/.test(text)) {
        add('sensibo', async () => {
          const current = sensiboEnabled ? await sensiboSource.get() : { state: 'off' };
          const { online, on, mode, unit, temperature, measured, modes, temperaturesByMode, fanLevels, fan } = current.data ?? {};
          return { state: current.state, at: current.at, online, on, mode, unit, temperature, measured, modes, temperaturesByMode, fanLevels, fan,
            timer: climateTimerState(), draft: climateTimerDraft(), presets: climateTimerPresets().map(({ name, draft }) => ({ name, draft })) };
        });
      }
      if (/\b(eco|klimatizac|fotovoltaik|fve|chlazen|vyrob|solar)/.test(text)) add('energy', async () => {
        const current = climateEco.overview();
        const { points } = await ecoHistory.recent();
        const today = pragueDate.format(Date.now());
        const statusCounts = {};
        for (const point of points.filter((item) => Number.isFinite(item.at) && pragueDate.format(item.at) === today)) {
          statusCounts[point.status] = (statusCounts[point.status] ?? 0) + 1;
        }
        const solar = await source('goodwe');
        return {
          today, statusCounts,
          eco: { available: ecoAvailable, enabled: current.enabled, status: current.status, constraint: current.constraint,
            thresholdW: current.threshold, solarW: current.solar, householdW: current.householdPower,
            climateW: current.power, on: current.on, limits: current.limits, waitMinutes: current.waitMinutes },
          solar: { source: solar.state, powerW: solar.data?.power, productionKwh: solar.data?.day,
            yesterdayKwh: solar.data?.yesterday, measuredAt: solar.data?.measuredAt, productionDate: solar.data?.productionDate },
          ...(historyWanted && { recentEco: points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 30)) === 0) }),
        };
      });
      const date = /\b\d{4}-\d{2}-\d{2}\b/.exec(text)?.[0];
      if (goodweSems && date && /\b(fotovoltaik|fve|vyrob|solar)/.test(text)) {
        add('solarDay', async () => {
          const data = await goodweDay(date);
          const points = data?.chart?.points ?? [];
          return { date, productionKwh: data?.production, powerKw: points.filter((_, index) =>
            index % Math.max(1, Math.ceil(points.length / 36)) === 0) };
        });
      }
      if (/\b(topi|topen|kotel|teplot|vlhk|co2|vzduch|pracovn|obyv|loznic|studovn|hluk|venku|hlavic|bateri)/.test(text) ||
          /\b(?:program|rozvrh|harmonogram)\b.*\btop/.test(text)) {
        add('netatmo', async () => {
          const [station, heating] = await Promise.all([source('station'), source('heating')]);
          return {
            stationSource: station.state, heatingSource: heating.state,
            rooms: roomsFor(station, heating).map(({ name, meter, heat }) => ({ name,
              ...meter, heating: heat && { temperature: heat.temperature, target: heat.target, mode: heat.mode,
                reachable: heat.reachable, power: heat.power, endsAt: heat.endsAt } })),
            outdoor: outdoorFor(station), boilerOn: heating.data?.boilerOn, homeMode: heating.data?.mode,
            ...(text.includes('bateri') && { batteries: batteryDiagnostics(heating, station) }),
          };
        });
        if (/program|rozvrh|harmonogram/.test(text)) add('heatingProgram', async () => {
          const { name, rooms, zones, monday, editable } = await getHeatingProgram();
          return { name, rooms, zones, monday, editable };
        });
        if (historyWanted && enabled.station) {
          for (const [index, room] of config.rooms.entries()) {
            if (mentionedRooms.has(resolveVoiceRoom(room.name))) add('history' + room.name, async () => voiceHistory(await roomHistory[index].get()));
          }
          if (/\b(venku|venkovn)/.test(text)) add('outdoorHistory', async () => voiceHistory(await outdoorHistory.get()));
        }
      }
      if (/\b(svetl|sviti|led|lamp|rozsv|zhas|prikon|odber|spotreb)/.test(text) && enabled.fibaro) {
        add('fibaro', async () => {
          const result = await fibaroDeviceSource.get();
          return { state: result.state, at: result.at, devices: result.data?.map(({ name, room, switchable, online, rgb, on, rgbColor, reading }) =>
            ({ name, room, switchable, online, rgb, on, brightness: rgbColor?.brightness, color: rgbColor?.preset, reading })) };
        });
        if (/\b(prikon|odber|spotreb)/.test(text) && historyWanted) {
          const meter = powerMeters.find(({ name }) => text.includes(name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())) ??
            powerMeters.find(({ id }) => id === householdMeterId);
          if (meter) add('powerHistory', async () => ({ meter: meter.name, ...voiceHistory(await powerHistory.get(meter.id).get()) }));
        }
      }
      if (/\b(vysav|vysaj|vysat|vytr|roborock|uklid|mop)/.test(text)) {
        add('vacuum', () => vacuumRead(false));
        if (/\b(vytr|mop|vysavan|moznost|nastav|histor|udrzb|mistnost|uklid|kuchyn)/.test(text)) add('vacuumOptions', async () => {
          const { state, data } = await vacuumRead(/\b(?:histor|udrzb)\w*/.test(text) ? true : 'scope');
          return { state, modes: data?.modes, rooms: data?.rooms?.map(({ name }) => name),
            cleaningOptions: data?.cleaningOptions, maintenance: data?.maintenance, history: data?.history };
        });
      }
      if (/\b(cistic|pm2|vlhk|alergen|nadrzk|filtr|vzduch)/.test(text)) add('air', airplusStatus);
      if (/\b(prack|pere|prani|doper|susick)/.test(text)) {
        add('washer', washerStatus);
        if (/\b(spotreb|prikon|kwh|el\b|energie)/.test(text)) add('washerEnergy', () => washerEnergy.get());
      }
      if (/\b(kavovar|kav[auy]|delonghi|espresso|cappuccino|odvapn|sedlin)/.test(text)) add('coffee', coffeeStatus);
      const weatherRequest = voiceWeatherRequest(question, previous);
      if (weatherRequest) add('weather', async () => voiceWeatherData(await source('weather'), weatherRequest, config.location?.name));
      return Object.fromEntries(await Promise.all(jobs));
    },
  },
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const { pathname: path } = url;
    if ((path.startsWith('/api/voice/') || path.startsWith('/voice-assets/')) && await voiceRoute(path, request, response)) return;
    if (request.method === 'POST' && ['/api/fibaro', '/api/fibaro/devices', '/api/heating', '/api/heating/mode', '/api/heating/program', '/api/sensibo', '/api/sensibo/timer', '/api/sensibo/eco', '/api/sensibo/eco/settings', '/api/batteries/refresh', '/api/roborock', '/api/airplus', '/api/coffeelink'].includes(path)) {
      return await command(path, request, response);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return send(response, 405, { error: 'Metoda není povolena' });
    if (path === '/api/health') return send(response, 200, { ok: true });
    if (path === '/api/panel') return send(response, 200, await snapshot());
    if (path === '/api/airplus') return send(response, 200, await airplusStatus());
    if (path === '/api/coffeelink') return send(response, 200, await coffeeStatus());
    if (path === '/api/washer') return send(response, 200, await washerStatus());
    if (path === '/api/washer/power') {
      if (!enabled.fibaro || !Number.isSafeInteger(washerPlugId)) return send(response, 200, { state: 'off' });
      const [devices, energy] = await Promise.all([fibaroDeviceSource.get(), washerEnergy.get()]);
      const reading = devices.state === 'live' && devices.data.find(({ id }) => id === washerPlugId)?.reading;
      const consumption = energy.data?.date === pragueDate.format(Date.now()) ? energy.data.consumption : null;
      return send(response, 200, { power: reading?.unit === 'W' ? reading.value : null, consumption });
    }
    if (path === '/api/roborock' || path === '/api/roborock/details') {
      return send(response, 200, await vacuumRead(path.endsWith('/details')));
    }
    if (path === '/api/heating/program') {
      if (!enabled.heating) return send(response, 503, { error: 'Program topení je nedostupný.' });
      try {
        const program = await getHeatingProgram();
        if (!program) return send(response, 404, { error: 'Program topení je nedostupný.' });
        const { name, rooms, zones, monday, revision, editable } = program;
        return send(response, 200, { name, rooms, zones, monday, revision, editable: editable && heatControl });
      } catch (error) {
        logEvent('warning', 'heating.program_failed', { source: 'heating' }, error);
        return send(response, 502, { error: 'Program topení se nepodařilo načíst.' });
      }
    }
    if (path === '/api/sensibo') return send(response, 200, sensiboEnabled ? await sensiboSource.get() : { state: 'off' });
    if (path === '/api/sensibo/timer') return send(response, 200, { enabled: sensiboEnabled, ecoAvailable,
      timer: climateTimerState(), draft: climateTimerDraft(), presets: climateTimerPresets() });
    if (path === '/api/sensibo/eco') return send(response, 200, ecoResponse());
    if (path === '/api/sensibo/eco/history') return send(response, 200, await ecoHistory.recent());
    if (path === '/api/sensibo/eco/history/week') return send(response, 200, await ecoHistory.weekly());
    if (path === '/api/fibaro/devices') {
      if (!enabled.fibaro) return send(response, 200, { state: 'off', data: [] });
      return send(response, 200, await fibaroDeviceSource.get());
    }
    const historyPath = path.match(/^\/api\/history\/(room|power)\/(\d+)$/);
    if (historyPath || path === '/api/history/outdoor' || path === '/api/history/heating') {
      const [, type, id] = historyPath ?? [];
      let history = type === 'power' ? enabled.fibaroPower && powerHistory.get(Number(id))
        : enabled.station && (type === 'room' ? roomHistory[Number(id)] : outdoorHistory);
      if (path === '/api/history/heating') {
        const roomId = url.searchParams.get('room');
        history = undefined;
        if (enabled.heating && roomId) {
          const heating = await sources.heating.get();
          if (heating.data?.rooms.some(({ id }) => String(id) === roomId)) {
            const homeId = heating.data.homeId;
            const key = JSON.stringify([homeId, roomId]);
            history = heatingHistories.get(key) ?? cachedSource('heatingHistory', () => heatingHistory(homeId, roomId), 5 * 60_000);
            heatingHistories.set(key, history);
          }
        }
      }
      if (!history) return send(response, 404, { error: 'Historie není dostupná.' });
      const result = await history.get();
      if (result.state === 'error') return send(response, 502, { error: 'Historii se nepodařilo načíst.' });
      if (!result.data) return send(response, 404, { error: 'Historie není dostupná.' });
      return send(response, 200, { ...result.data, state: result.state });
    }
    if (path === '/api/spotify/config') {
      return send(response, 200, {
        clientId: spotifyEnabled ? env.SPOTIFY_CLIENT_ID : null,
        redirectUri: spotifyEnabled ? env.SPOTIFY_REDIRECT_URI : null,
      });
    }
    if (path === '/api/goodwe/day') {
      if (!goodweSems) return send(response, 404, { error: 'Historie SEMS+ není připojena.' });
      const date = url.searchParams.get('date') ?? '';
      try {
        const history = goodweDay(date);
        if (!history) return send(response, 400, { error: 'Zvolte minulý den.' });
        return send(response, 200, await history);
      } catch (error) {
        logEvent('warning', 'goodwe.day_failed', { source: 'goodwe', date }, error);
        return send(response, 502, { error: 'Historii SEMS+ se nepodařilo načíst.' });
      }
    }
    if (path.startsWith('/api/radar/')) {
      const id = path.slice('/api/radar/'.length);
      const bytes = await radarImage(id);
      if (bytes) return send(response, 200, bytes, 'image/png', 'public, max-age=86400, immutable');
    }
    const file = path === '/' || path === '/spotify/callback' ? 'index.html' : path.slice(1);
    if (files.has(file)) {
      try {
        const data = await readFile(join('public', file));
        return send(response, 200, data, types[extname(file)], 'no-cache');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return send(response, 404, { error: 'Nenalezeno' });
  } catch (error) {
    logEvent('error', 'http.failed', {}, error);
    if (!response.headersSent && !response.destroyed)
      send(response, 502, { error: 'Požadavek se nepodařilo dokončit' });
  }
});

if (sensiboEnabled) {
  await climateEco.load().catch((error) => logEvent('error', 'climate_eco.load_failed', {}, error));
  await loadClimateTimer().catch((error) => logEvent('error', 'climate_timer.load_failed', {}, error));
  setInterval(checkClimateTimer, 1000).unref();
}
if (ecoMeterAvailable) {
  setImmediate(checkClimateEco);
  setInterval(checkClimateEco, 60_000).unref();
}
const monitorWasher = () => washerStatus().catch((error) => logEvent('warning', 'washer.monitor_failed', {}, error));
setImmediate(monitorWasher);
setInterval(monitorWasher, 30_000).unref();
server.listen(port, env.HOST || '127.0.0.1', () => console.log('Panel poslouchá na portu ' + port));
