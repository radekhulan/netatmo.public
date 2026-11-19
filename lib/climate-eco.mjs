import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logEvent } from './log.mjs';

const minute = 60_000;
const warmup = 30 * minute;
const stableFor = 5 * minute;
const baseline = { cool: 1000, heat: 1400 };
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
const phases = ['warmup', 'steady'];
const bandWidth = 5;
const minimumSamples = 30;
const defaultLimits = { climatePercent: 200, householdPercent: 60, minimumSolarW: 2000 };
const validLimits = ({ climatePercent, householdPercent, minimumSolarW }) => Number.isFinite(climatePercent) &&
  climatePercent >= 50 && climatePercent <= 500 && Number.isFinite(householdPercent) && householdPercent >= 1 &&
  householdPercent <= 100 && Number.isSafeInteger(minimumSolarW) && minimumSolarW >= 0;
const supported = (mode) => Object.hasOwn(baseline, mode);
const watts = (value) => Number.isFinite(value) && value >= 0;
const recent = (at, now, age) => Number.isFinite(at) && at <= now && at >= now - age;

function temperatureBand(temperature) {
  return Number.isFinite(temperature) ? Math.floor(temperature / bandWidth) * bandWidth : null;
}

function demandBand(mode, measured, target, unit) {
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return null;
  const celsius = unit === 'F' ? (target - 32) * 5 / 9 : target;
  const gap = mode === 'heat' ? celsius - measured : measured - celsius;
  return gap < 1 ? 0 : gap < 3 ? 1 : 3;
}

function learnedPower(histograms) {
  const bins = new Map();
  for (const histogram of histograms) {
    for (const [bucket, count] of Object.entries(histogram ?? {})) {
      const power = Number(bucket);
      bins.set(power, (bins.get(power) ?? 0) + count);
    }
  }
  const samples = [...bins.values()].reduce((sum, count) => sum + count, 0);
  if (samples < minimumSamples) return null;
  let rank = Math.ceil(samples * 0.7);
  return [...bins.keys()].sort((a, b) => a - b).find((power) => (rank -= bins.get(power)) <= 0);
}

function solarRequirement(estimate, percent, householdPower, { householdPercent, minimumSolarW }) {
  const climate = estimate * percent / 100;
  const household = (householdPower ?? 0) * 100 / householdPercent;
  const threshold = Math.max(climate, household, minimumSolarW);
  const constraint = threshold === minimumSolarW ? 'solar' : household > climate ? 'household' : 'climate';
  return { threshold, constraint };
}

export function createClimateEco(stateDir, { limitHousehold = false } = {}) {
  const file = join(stateDir, 'climate-eco.json');
  let saved = { enabled: false, requested: false, restart: false, days: {} };
  let limits = defaultLimits;
  let inputs = {};
  let previous;
  let lastDevice;
  let startedAt;
  let condition;
  let changedAt;
  let status = 'off';

  async function persist(next) {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    await rename(file + '.tmp', file);
    saved = next;
  }

  function cutoff(now, days) {
    return new Date(Date.parse(localDate.format(now)) - (days - 1) * 24 * 60 * minute).toISOString().slice(0, 10);
  }

  function estimates(now, outside, device, target) {
    const oldest = cutoff(now, 365);
    const lastMonth = cutoff(now, 30);
    const days = Object.entries(saved.days).filter(([date]) => date >= oldest);
    const band = temperatureBand(outside);
    return Object.fromEntries(Object.entries(baseline).map(([mode, initial]) => {
      const entries = days.filter(([date, values]) => date >= lastMonth && values[mode]).map(([, values]) => values[mode]);
      const conditioned = band === null ? [] : days.map(([, values]) => values[mode]?.outdoor?.[band]).filter(Boolean);
      const demand = device?.mode === mode ? demandBand(mode, device.measured, target, device.unit) : null;
      const stats = Object.fromEntries(phases.map((phase) => {
        const matched = demand === null ? null : learnedPower(conditioned.map((entry) => entry.load?.[demand]?.[phase]));
        if (matched !== null) return [phase, { watts: matched, learned: true, range: [band, band + bandWidth],
          demand: [demand, demand === 3 ? null : demand === 1 ? 3 : 1] }];
        const local = learnedPower(conditioned.map((entry) => entry[phase]));
        if (local !== null) return [phase, { watts: local, learned: true, range: [band, band + bandWidth] }];
        const general = learnedPower(entries.map((entry) => entry[phase]));
        return [phase, { watts: general ?? initial, learned: general !== null }];
      }));
      return [mode, { ...stats, energy: entries.reduce((sum, entry) => sum + entry.wh, 0) / 1000 }];
    }));
  }

  async function learn(now, device, power, phase, outside) {
    const last = previous;
    previous = { device, power, now };
    if (!device?.on || !supported(device.mode) || !watts(power) || last?.device?.id !== device.id ||
        last.device.mode !== device.mode || !last.device.on || !watts(last.power)) return;
    const elapsed = now - last.now;
    if (elapsed < 45_000 || elapsed > 2 * minute) return;
    const date = localDate.format(now);
    const oldest = cutoff(now, 365);
    const days = Object.fromEntries(Object.entries(saved.days).filter(([day]) => day >= oldest));
    const modes = { ...days[date] };
    const entry = modes[device.mode] ?? { wh: 0, warmup: {}, steady: {} };
    const next = { ...entry, wh: entry.wh + (last.power + power) * elapsed / 7_200_000 };
    if (power >= 100 && power <= 20_000) {
      const bucket = Math.round(power / 50) * 50;
      const bins = entry[phase];
      next[phase] = { ...bins, [bucket]: (bins[bucket] ?? 0) + 1 };
      const band = temperatureBand(outside);
      if (band !== null) {
        const profile = entry.outdoor?.[band];
        const local = profile?.[phase];
        const updated = { ...profile, [phase]: { ...local, [bucket]: (local?.[bucket] ?? 0) + 1 } };
        const demand = demandBand(device.mode, device.measured, device.temperature, device.unit);
        if (demand !== null) {
          const loaded = profile?.load?.[demand];
          const binsForDemand = loaded?.[phase];
          updated.load = { ...profile?.load, [demand]: { ...loaded, [phase]: {
            ...binsForDemand, [bucket]: (binsForDemand?.[bucket] ?? 0) + 1,
          } } };
        }
        next.outdoor = { ...entry.outdoor, [band]: updated };
      }
    }
    modes[device.mode] = next;
    await persist({ ...saved, days: { ...days, [date]: modes } });
  }

  function overview(now = Date.now()) {
    return { enabled: saved.enabled, timerId: saved.timerId, controlMode: saved.mode, ecoPercent: saved.ecoPercent, limits, status, ...inputs,
      waitMinutes: condition ? Math.min(5, Math.floor((now - condition.since) / minute)) : 0 };
  }

  function state(now = Date.now()) {
    const device = lastDevice && saved.enabled ? { ...lastDevice, mode: saved.mode } : lastDevice;
    return { ...overview(now), statistics: estimates(now, inputs.outdoorTemperature, device, saved.target ?? device?.temperature) };
  }

  async function enable(enabled, device, { timerId, target = device?.temperature ?? null, mode = device?.mode, ecoPercent } = {}) {
    await persist({ ...saved, enabled, requested: enabled, restart: false, deviceId: device?.id,
      mode, unit: device?.unit, target, timerId, ecoPercent });
    if (device && !device.on) lastDevice = device;
    status = enabled ? 'waiting' : 'off';
    condition = undefined;
    inputs = { ...inputs, threshold: null, percent: undefined, constraint: undefined };
    logEvent('info', enabled ? 'climate_eco.enabled' : 'climate_eco.disabled');
  }

  return {
    state,
    overview,
    async load() {
      try {
        const next = JSON.parse(await readFile(file, 'utf8'));
        if (typeof next?.enabled !== 'boolean' || !next.days) throw new Error('Neplatná data Eco');
        saved = next;
        const storedLimits = { ...defaultLimits, ...next.limits };
        limits = validLimits(storedLimits) ? storedLimits : defaultLimits;
        status = saved.enabled ? 'waiting' : 'off';
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
    async setLimits({ climatePercent, householdPercent, minimumSolarW = limits.minimumSolarW }) {
      const next = { climatePercent, householdPercent, minimumSolarW };
      if (!validLimits(next)) return false;
      if (climatePercent === limits.climatePercent && householdPercent === limits.householdPercent && minimumSolarW === limits.minimumSolarW) return true;
      await persist({ ...saved, limits: next });
      limits = next;
      inputs = { ...inputs, threshold: null, percent: undefined, constraint: undefined };
      condition = undefined;
      return true;
    },
    enable,
    async schedule(kind, target) {
      await persist({ ...saved, requested: kind !== 'stop',
        restart: kind === 'start' ? false : saved.restart, target: kind === 'stop' ? null : target });
      if (kind !== 'temperature') condition = undefined;
    },
    async setTarget(target) {
      if (saved.target !== target) await persist({ ...saved, target });
    },
    async observe({ now = Date.now(), device, power, householdPower, solar, solarAt, outdoor, waitingForTimer, setPower }) {
      const last = lastDevice;
      if (device) {
        if (device.on && last && (!last.on || last.id !== device.id || last.mode !== device.mode)) startedAt = now;
        if (!device.on) startedAt = undefined;
        if (device.on || !(power >= 100)) lastDevice = device;
      }
      const phase = device?.on && startedAt != null && now - startedAt < warmup ? 'warmup' : 'steady';
      const outside = Number.isFinite(outdoor?.temperature) && recent(outdoor.time, now, 20 * minute) ? outdoor.temperature : null;
      await learn(now, device, power, phase, outside);
      inputs = { mode: device?.mode, on: device?.on, power, householdPower, solar, outdoorTemperature: outside, threshold: null };
      const mode = saved.mode;
      let inactive;
      if (!saved.enabled) inactive = 'off';
      else if (!saved.requested || waitingForTimer) inactive = 'timer';
      else if (!device) inactive = 'missing';
      else if (!supported(mode) || device.id !== saved.deviceId || device.unit !== saved.unit ||
        (mode !== device.mode && (device.on || !saved.timerId))) inactive = 'mode';
      else if (!device.on && power >= 100) inactive = 'mismatch';
      else if (last?.on && !device.on && !saved.restart) {
        await enable(false);
        return false;
      } else if (!watts(power) || !watts(solar) || !recent(solarAt, now, 8 * minute)) inactive = 'missing';
      else if (limitHousehold && !watts(householdPower)) inactive = 'householdMissing';
      if (inactive) {
        status = inactive;
        condition = undefined;
        return false;
      }
      const profile = estimates(now, outside, { ...device, mode }, saved.target ?? device.temperature)[mode];
      const estimate = device.on ? Math.max(profile[phase].watts, power)
        : saved.restart ? Math.max(profile.warmup.watts, profile.steady.watts) : profile.warmup.watts;
      const percent = saved.ecoPercent ?? ((device.on ? phase === 'steady' : saved.restart) ? limits.climatePercent : 100);
      const otherPower = limitHousehold ? Math.max(0, householdPower - power) : null;
      const projectedHousehold = limitHousehold ? (device.on ? householdPower : otherPower + estimate) : null;
      const { threshold, constraint } = solarRequirement(estimate, percent, projectedHousehold, limits);
      Object.assign(inputs, { threshold, constraint });
      inputs.percent = percent;
      const wantsOn = !device.on;
      const needsChange = device.on ? solar < threshold : solar >= threshold;
      status = device.on ? (needsChange ? 'low' : phase === 'warmup' ? 'warmup' : 'running') : needsChange ? 'ready' : 'waiting';
      if (!needsChange) {
        condition = undefined;
        return false;
      }
      if (!condition || condition.wantsOn !== wantsOn || condition.mode !== mode || now - condition.seen > 2 * minute) {
        condition = { wantsOn, mode, since: now, seen: now, solarAt };
        return false;
      }
      condition.seen = now;
      if (now - condition.since < stableFor || solarAt <= condition.solarAt || now - (changedAt ?? -Infinity) < stableFor) return false;
      condition = undefined;
      changedAt = now;
      try {
        const changed = await setPower(device, wantsOn, saved.target, mode);
        if (!changed) return false;
        lastDevice = { ...device, on: wantsOn, mode };
        startedAt = wantsOn ? now : undefined;
        await persist({ ...saved, restart: !wantsOn });
        logEvent('info', 'climate_eco.power_changed', { on: wantsOn, mode, solar, power, householdPower, threshold, constraint, outside });
        status = wantsOn ? 'warmup' : 'waiting';
        inputs.on = wantsOn;
        inputs.lastDecision = { at: now, on: wantsOn, threshold, constraint, householdPercent: limits.householdPercent };
        inputs.percent = saved.ecoPercent ?? (wantsOn ? 100 : limits.climatePercent);
        const nextEstimate = wantsOn ? profile.warmup.watts : Math.max(profile.warmup.watts, profile.steady.watts);
        Object.assign(inputs, solarRequirement(nextEstimate, inputs.percent, limitHousehold ? otherPower + nextEstimate : null, limits));
        return true;
      } catch (error) {
        status = 'error';
        logEvent('error', 'climate_eco.command_failed', { on: wantsOn, mode, solar, power, threshold }, error);
        return false;
      }
    },
  };
}
