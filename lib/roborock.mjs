import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { cachedSource } from './cache.mjs';
import { env, stateDir } from './config.mjs';

const authFile = join(stateDir, 'roborock.json');
const python = env.ROBOROCK_PYTHON || join(stateDir, 'roborock-venv', 'bin', 'python');
const script = fileURLToPath(new URL('./roborock_cloud.py', import.meta.url));
const modes = ['vacuum', 'mop', 'vac_then_mop', 'vac_and_mop', 'smart_mode', 'custom'];
const cleaningSettings = ['fan', 'water', 'route', 'waterLevel'];
const actions = ['start', 'pause', 'resume', 'dock'];
let worker;
let queue = Promise.resolve();
let rejectedRevision;
let readRevision;

export function vacuumConfigured() {
  return Boolean(env.ROBOROCK_MODEL?.trim()) && existsSync(authFile);
}

function startWorker(revision) {
  const process = spawn(python, [script, authFile], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: process.stdout });
  let pending;
  const instance = { process, revision, send };

  function settle(error, data) {
    if (!pending) return;
    const { timer, resolve, reject } = pending;
    pending = undefined;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(data);
  }

  function close(error) {
    if (worker === instance) worker = undefined;
    settle(error);
    process.kill();
  }

  process.on('error', close);
  process.on('exit', () => close(new Error('Spojení s Roborockem se ukončilo.')));
  process.stdin.on('error', close);
  lines.on('line', (line) => {
    let response;
    try { response = JSON.parse(line); } catch { return close(new Error('Neplatná odpověď Roborocku.')); }
    if (response?.ok === true) return settle(null, response.data);
    const error = new Error('Roborock nepotvrdil požadavek.');
    if (typeof response?.code === 'string' && /^[A-Za-z0-9_]{1,70}$/.test(response.code)) error.code = response.code;
    if (error.code === 'RoborockInvalidCredentials') rejectedRevision = revision;
    if (response?.fatal || rejectedRevision === revision) close(error);
    else settle(error);
  });

  function send(request) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => close(new Error('Roborock neodpověděl včas.')), 45_000);
      pending = { resolve, reject, timer };
      process.stdin.write(JSON.stringify(request) + '\n', (error) => { if (error) close(error); });
    });
  }

  return instance;
}

function requestVacuum(request) {
  const result = queue.then(() => {
    const revision = statSync(authFile).mtimeMs;
    if (revision === rejectedRevision) throw new Error('Roborock vyžaduje nové přihlášení.');
    if (worker?.revision !== revision) {
      worker?.process.kill();
      worker = startWorker(revision);
    }
    return worker.send(request);
  });
  queue = result.catch(() => {});
  return result;
}

const vacuumStatus = cachedSource('roborock', () => requestVacuum({ operation: 'status' }), 8_000, 90_000);
const vacuumScope = cachedSource('roborockScope', () => requestVacuum({ operation: 'scope' }), 30_000, 90_000);
const vacuumDetails = cachedSource('roborockDetails', () => requestVacuum({ operation: 'details' }), 50_000, 3 * 60_000);

export async function vacuumRead(details) {
  if (!vacuumConfigured()) return { state: 'off' };
  const revision = statSync(authFile).mtimeMs;
  if (revision === rejectedRevision) return { state: 'reauth' };
  if (readRevision !== revision) {
    readRevision = revision;
    vacuumStatus.invalidate();
    vacuumDetails.invalidate();
    vacuumScope.invalidate();
  }
  const result = await (details === 'scope' ? vacuumScope : details ? vacuumDetails : vacuumStatus).get();
  return revision === rejectedRevision ? { state: 'reauth' } : result;
}

export function vacuumCommand(body) {
  if (!actions.includes(body.action)) return null;
  const request = { operation: 'control', action: body.action };
  if (body.action === 'start') {
    const { mode, segments, mapId, settings } = body;
    if (!modes.includes(mode) || !Array.isArray(segments) || segments.length > 32 ||
        segments.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 255) ||
        new Set(segments).size !== segments.length ||
        (segments.length && (!Number.isSafeInteger(mapId) || mapId < 0))) return null;
    Object.assign(request, { mode, segments, mapId });
    if (settings !== undefined) {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
          Object.entries(settings).some(([key, value]) => !cleaningSettings.includes(key) || !Number.isSafeInteger(value))) return null;
      request.settings = settings;
    }
  }
  return requestVacuum(request).finally(() => vacuumStatus.invalidate());
}
