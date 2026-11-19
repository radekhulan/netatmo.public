import { vacuumSettingsByMode } from './voice-actions.mjs';

const sourceStates = new Set(['live', 'stale', 'demo', 'off', 'reauth', 'error']);
const readTimeout = 2500;
const pending = new WeakMap();
const vacuumActions = ['start', 'pause', 'resume', 'dock'];
const climateLimits = ['climatePercent', 'householdPercent', 'minimumSolarW'];
const airModes = ['auto', 'sleep', 'medium', 'turbo'];

const array = (value) => Array.isArray(value) ? value : [];
const label = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && !/[\r\n\0]/.test(value);
const labels = (values) => [...new Set(array(values).filter(label))];
const ints = (values) => [...new Set(array(values).filter(Number.isSafeInteger))];
const flags = (object, keys) => Object.fromEntries(keys.flatMap((key) =>
  typeof object?.[key] === 'boolean' ? [[key, object[key]]] : []));

async function read(deps, key, enabled, load) {
  if (!enabled) return { state: 'off' };
  if (typeof load !== 'function') return { state: 'unknown' };
  if (!pending.has(deps)) pending.set(deps, new Map());
  const requests = pending.get(deps);
  if (!requests.has(key)) {
    requests.set(key, Promise.resolve().then(load).then((result) =>
      sourceStates.has(result?.state) ? result : { state: 'error' }, () => ({ state: 'error' }))
      .finally(() => requests.delete(key)));
  }
  let timeout;
  try {
    return await Promise.race([requests.get(key), new Promise((resolve) => {
      timeout = setTimeout(resolve, readTimeout, { state: 'pending' });
    })]);
  } finally {
    clearTimeout(timeout);
  }
}

async function local(load) {
  const data = await load();
  return data == null ? { state: 'off' } : { state: 'live', data };
}

function fibaroCapabilities(config, source, sceneSource) {
  const devices = array(source.data).filter((device) => label(device?.name)).map((device) => ({
    name: device.name, room: label(device.room) ? device.room : null,
    ...flags(device, ['online', 'switchable', 'rgb', 'on']),
    ...(Number.isFinite(device.rgbColor?.brightness) && { brightness: device.rgbColor.brightness }),
    ...(label(device.rgbColor?.preset) && { color: device.rgbColor.preset }),
    ...(label(device.reading?.unit) && { meterUnit: device.reading.unit }),
  }));
  const configuredScenes = sceneSource.state === 'off' ? [] : array(config?.fibaro?.actions);
  const scenes = configuredScenes.filter((item) => item?.type === 'scene' && label(item.key) && label(item.name))
    .map(({ key, name }) => {
      const availability = array(sceneSource.data).find((scene) => scene?.key === key)?.available;
      return { key, name, available: sceneSource.state === 'live' && typeof availability === 'boolean' ? availability : null };
    });
  return { state: source.state, devices, sceneState: sceneSource.state, scenes };
}

function heatingCapabilities(source, programSource, writeAllowed) {
  const rooms = array(source.data?.rooms).filter((room) => label(room?.name)).map(({ name, reachable }) => ({
    name, reachable: typeof reachable === 'boolean' ? reachable : null,
    canSet: writeAllowed && source.state === 'live' && reachable === true,
  }));
  const program = programSource.data;
  return {
    state: source.state, writeAllowed, rooms,
    program: {
      state: programSource.state,
      ...(label(program?.name) && { name: program.name }),
      editable: writeAllowed && programSource.state === 'live' && program?.editable === true,
      rooms: labels(array(program?.rooms).map((room) => room?.name)),
      zones: labels(array(program?.zones).map((zone) => zone?.name)),
    },
  };
}

function climateCapabilities(source, ecoSource, timerSource) {
  const device = source.data;
  const modes = array(device?.modes).filter((mode) => Array.isArray(mode) && label(mode[0]) && label(mode[1]))
    .map(([value, name]) => ({ value, name }));
  const eco = ecoSource.data;
  const timer = timerSource.data;
  return {
    state: source.state, ...flags(device, ['online', 'on']),
    unit: ['C', 'F'].includes(device?.unit) ? device.unit : null,
    modes, temperaturesByMode: Object.fromEntries(modes.map(({ value }) => [value, ints(device?.temperaturesByMode?.[value])])),
    mode: label(device?.mode) ? device.mode : null, fan: label(device?.fan) ? device.fan : null,
    fanLevels: labels(device?.fanLevels),
    eco: {
      state: ecoSource.state, ...flags(eco, ['available', 'enabled', 'timerControlled']),
      limits: Object.fromEntries(climateLimits.flatMap((key) => Number.isFinite(eco?.limits?.[key]) ? [[key, eco.limits[key]]] : [])),
    },
    timer: {
      state: timerSource.state, ...flags(timer, ['enabled']),
      active: timer?.timer?.active === true,
      presets: labels(array(timer?.presets).map((preset) => preset?.name)),
    },
  };
}

function airCapabilities(source) {
  const devices = array(source.data).filter((device) => label(device?.room) && label(device.model)).map((device) => ({
    name: device.room, room: device.room, model: device.model,
    ...flags(device, ['available', 'on']),
    mode: airModes.includes(device.mode) ? device.mode : null, modes: [...airModes],
    humidityTargets: device.humiditySupported === true ? [40, 50, 60, 70] : [],
  }));
  return { state: source.state, devices };
}

function vacuumCapabilities(status, details) {
  const data = details.data;
  const mapId = status.data?.mapId;
  const activeMap = status.state === 'live' && details.state === 'live' && Number.isSafeInteger(mapId) && mapId === data?.mapId;
  const cleaningOptions = Object.fromEntries(['fan', 'water', 'route'].map((key) => [key, Object.fromEntries(
    Object.entries(data?.cleaningOptions?.[key] ?? {}).filter(([name, code]) => label(name) && Number.isSafeInteger(code)),
  )]));
  const scopes = array(data?.rooms).filter((room) => label(room?.name) && Number.isSafeInteger(room.id));
  return {
    state: status.state, detailsState: details.state, activeMap,
    rooms: labels(scopes.map(({ name }) => name)), modes: labels(data?.modes), cleaningOptions,
    settingsByMode: Object.fromEntries(labels(data?.modes).filter((mode) => Object.hasOwn(vacuumSettingsByMode, mode))
      .map((mode) => [mode, vacuumSettingsByMode[mode]])),
    customWaterLevel: Object.hasOwn(cleaningOptions.water, 'custom_water_flow') ? { minimum: 1, maximum: 30 } : null,
    actions: status.state === 'live' ? flags(status.data?.actions, vacuumActions) : {},
  };
}

export async function discoverVoiceCapabilities(deps, permissions) {
  const roomsEnabled = permissions.heating || permissions.heat;
  const [lights, scenes, heating, program, climate, eco, timer, air, vacuum, vacuumDetails] = await Promise.all([
    read(deps, 'lights', permissions.fibaro, deps.lights),
    read(deps, 'scenes', permissions.fibaro, deps.scenes),
    read(deps, 'heating', roomsEnabled, deps.heating),
    read(deps, 'heatingProgram', roomsEnabled, () => local(deps.heatingProgram)),
    read(deps, 'climate', permissions.climate, deps.climate),
    read(deps, 'eco', permissions.climate, () => local(deps.eco)),
    read(deps, 'timer', permissions.climate, () => local(deps.timer)),
    read(deps, 'air', permissions.air, deps.air),
    read(deps, 'vacuum', permissions.vacuum, () => deps.vacuum(false)),
    read(deps, 'vacuumDetails', permissions.vacuum, deps.vacuumMap ?? (() => deps.vacuum(true))),
  ]);
  return {
    fibaro: fibaroCapabilities(deps.config, lights, scenes),
    heating: heatingCapabilities(heating, program, permissions.heat === true),
    climate: climateCapabilities(climate, eco, timer),
    air: airCapabilities(air),
    vacuum: vacuumCapabilities(vacuum, vacuumDetails),
  };
}
