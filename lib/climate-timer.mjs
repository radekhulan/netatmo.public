import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stateDir } from './config.mjs';
import { logEvent } from './log.mjs';
import { executeSensiboTimerStep, readSensiboDevice } from './sensibo.mjs';

const file = join(stateDir, 'climate-timer.json');
const minute = 60_000;
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
let timer = null;
let lastDraft = null;
let presets = [];

function nextClockTime(after, time) {
  const first = (Math.floor(after / minute) + 1) * minute;
  for (let at = first; at < first + 26 * 60 * minute; at += minute) {
    if (clock.format(at) === time) return at;
  }
  throw new Error('Čas kroku nelze naplánovat.');
}

function active(job) {
  const last = job?.steps.at(-1);
  return Boolean(job?.steps.some(({ status }) => status === 'pending' || status === 'running') ||
    (last?.eco === true && last.status === 'done'));
}

async function persist(next, draft = lastDraft, nextPresets = presets) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await writeFile(file + '.tmp', JSON.stringify({ timer: next, draft, presets: nextPresets }), { mode: 0o600 });
  await rename(file + '.tmp', file);
  timer = next;
  lastDraft = draft;
  presets = nextPresets;
}

export async function loadClimateTimer() {
  let saved;
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') logEvent('error', 'climate_timer.load_failed', {}, error);
    return;
  }
  if (saved && Object.hasOwn(saved, 'timer')) {
    lastDraft = saved.draft ?? null;
    presets = Array.isArray(saved.presets) ? saved.presets : [];
    saved = saved.timer;
  }
  if (!saved || typeof saved.deviceId !== 'string' || typeof saved.id !== 'string' ||
      !['C', 'F'].includes(saved.unit) || !Array.isArray(saved.steps) || !saved.steps.length || saved.steps.length > 4 ||
      !saved.steps.every((step) => step && ['start', 'temperature', 'stop'].includes(step.kind) &&
        Number.isSafeInteger(step.at) && Math.abs(step.at) <= 8.64e15 &&
        ['pending', 'running', 'done', 'skipped', 'failed'].includes(step.status))) return;
  timer = saved;
  if (saved.steps.some(({ status }) => status === 'running')) {
    const steps = saved.steps.map((step) => step.status === 'running'
      ? { ...step, status: 'failed', detail: 'Provedení kroku se přerušilo.' }
      : step);
    timer = { ...saved, steps };
    await persist(timer);
  }
}

export function climateTimerState() {
  return timer ? { id: timer.id, unit: timer.unit, mode: timer.mode, ecoPercent: timer.ecoPercent,
    steps: timer.steps, active: active(timer) } : null;
}

export function climateTimerDraft() {
  return lastDraft;
}

export function climateTimerPresets() {
  return presets;
}

export function climateTimerSummary() {
  const step = timer?.steps.find(({ status }) => status === 'pending' || status === 'running');
  const applied = timer?.steps.some(({ kind, status }) => kind !== 'stop' && status === 'done');
  return { next: step && { ...step, unit: timer.unit, mode: timer.mode }, timerStage: active(timer) ? applied ? 'active' : 'pending' : undefined };
}

const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function timerDraft(body) {
  const { startTime, startTemperature, startEco, change, extraChange = null, stopTime, mode, ecoPercent } = body;
  const validEco = (value) => value === undefined || typeof value === 'boolean';
  const validChange = (step) => step === null || (validTime(step?.time) && Number.isInteger(step.temperature) && validEco(step.eco));
  if ((startTime !== null && !validTime(startTime)) || !Number.isInteger(startTemperature) || !validEco(startEco) ||
      !validChange(change) || !validChange(extraChange) || (extraChange && !change) || (stopTime !== null && !validTime(stopTime)) ||
      (mode != null && !['cool', 'heat'].includes(mode)) ||
      (ecoPercent != null && (!Number.isInteger(ecoPercent) || ecoPercent < 50 || ecoPercent > 500))) return null;
  const clean = (step) => step && { time: step.time, temperature: step.temperature, ...(step.eco !== undefined && { eco: step.eco }) };
  return { startTime, startTemperature, startEco, change: clean(change), extraChange: clean(extraChange), stopTime,
    ...(mode != null && { mode }), ...(ecoPercent != null && { ecoPercent }) };
}

export async function changeClimateTimer(body, ecoAvailable = false) {
  if (body.action === 'cancel') {
    if (!active(timer) || timer.id !== body.id) return { status: 409, error: 'Časovač se mezitím změnil.' };
    await persist(null);
    return { ok: true, timer: null, draft: lastDraft };
  }
  if (body.action === 'deletePreset') {
    if (!presets.some(({ id }) => id === body.id)) return { status: 404, error: 'Uložený plán nenalezen.' };
    await persist(timer, lastDraft, presets.filter(({ id }) => id !== body.id));
    return { ok: true, presets };
  }
  const draft = timerDraft(body);
  if (!draft || !['start', 'savePreset'].includes(body.action)) return { status: 400, error: 'Zkontrolujte čas a teplotu časovače.' };
  if (body.action === 'savePreset') {
    const name = typeof body.name === 'string' && body.name.trim();
    if (!name || name.length > 40 || !['C', 'F'].includes(body.unit)) return { status: 400, error: 'Zadejte název plánu.' };
    const existing = presets.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!existing && presets.length >= 12) return { status: 409, error: 'Lze uložit nejvýše 12 plánů.' };
    const preset = { id: existing?.id ?? randomUUID(), name, draft: { ...draft, unit: body.unit } };
    const next = existing ? presets.map((item) => item.id === preset.id ? preset : item) : [...presets, preset];
    await persist(timer, lastDraft, next);
    return { ok: true, presets };
  }
  const { startTime, startTemperature, startEco, change, extraChange, stopTime } = draft;
  const ecoFlags = [startEco, change?.eco, extraChange?.eco];
  if (active(timer)) return { status: 409, error: 'Nejprve zrušte běžící časovač.' };
  const device = await readSensiboDevice();
  if (!device?.online) return { status: 503, error: 'Klimatizace je nedostupná' };
  const mode = draft.mode ?? device.mode;
  if (ecoFlags.includes(true)) {
    if (!ecoAvailable) return { status: 503, error: 'Eco potřebuje SEMS+ a měřič klimatizace.' };
    if (!['cool', 'heat'].includes(mode)) return { status: 409, error: 'Pro Eco zvolte chlazení nebo topení.' };
  }
  if (![startTemperature, ...[change, extraChange].filter(Boolean).map(({ temperature }) => temperature)]
    .every((temperature) => device.temperaturesByMode[mode]?.includes(temperature))) {
    return { status: 400, error: 'Klimatizace tuto teplotu v aktuálním režimu nepodporuje.' };
  }
  const now = Date.now();
  const start = startTime === null ? now : nextClockTime(now, startTime);
  const explicitEco = ecoFlags.some((value) => value !== undefined);
  const eco = (value) => explicitEco ? { eco: value === true } : {};
  const steps = [{ kind: 'start', at: start, temperature: startTemperature, status: 'pending', ...eco(startEco) }];
  for (const next of [change, extraChange].filter(Boolean)) {
    steps.push({ kind: 'temperature', at: nextClockTime(steps.at(-1).at, next.time), temperature: next.temperature,
      status: 'pending', ...eco(next.eco) });
  }
  if (stopTime) steps.push({ kind: 'stop', at: nextClockTime(steps.at(-1).at, stopTime), status: 'pending' });
  const savedDraft = { ...draft, ...(explicitEco ? { startEco: startEco === true } : {}), unit: device.unit };
  if (!explicitEco) delete savedDraft.startEco;
  await persist({ id: randomUUID(), deviceId: device.id, unit: device.unit, steps,
    ...(draft.mode && { mode }), ...(draft.ecoPercent != null && { ecoPercent: draft.ecoPercent }) }, savedDraft);
  return { ok: true, timer: climateTimerState(), draft: savedDraft };
}

export function climateTimerDue() {
  return Boolean(timer?.steps.some(({ status, at }) => status === 'pending' && at <= Date.now()));
}

export function climateTimerWaitingForStart() {
  return timer?.steps[0]?.status === 'pending';
}

export function climateTimerControlsEco() {
  return active(timer) && typeof timer.steps[0].eco === 'boolean';
}

export function climateTimerOwnsEco(id) {
  if (!climateTimerControlsEco() || timer.id !== id) return false;
  const phase = timer.steps.findLast(({ status }) => status === 'done' || status === 'failed');
  return phase?.status === 'done' && phase.eco === true;
}

export async function runClimateTimer(execute = executeSensiboTimerStep) {
  const now = Date.now();
  const index = timer.steps.findLastIndex(({ status, at }) => status === 'pending' && at <= now);
  if (index < 0) return;
  const steps = timer.steps.map((step, position) => {
    if (step.status !== 'pending' || position > index) return step;
    return position === index ? { ...step, status: 'running' }
      : { ...step, status: 'skipped', detail: 'Přeskočeno, nastal další krok.' };
  });
  await persist({ ...timer, steps });
  const step = steps[index];
  let status;
  let detail;
  try {
    const result = await execute(timer, step);
    status = typeof result === 'string' ? result : result.status;
    detail = status === 'skipped' ? 'Vynecháno, klimatizace je vypnutá.' : result.detail;
  } catch (error) {
    logEvent('error', 'climate_timer.step_failed', { kind: step.kind, at: step.at }, error);
    status = 'failed';
    detail = error.message;
  }
  const result = { ...timer, steps: steps.map((entry, position) => position === index ? { ...entry, status, detail } : entry) };
  try {
    await persist(result);
  } catch (error) {
    timer = result;
    throw error;
  }
}
