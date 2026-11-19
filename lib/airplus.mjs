import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { cachedSource } from './cache.mjs';
import { config, stateDir } from './config.mjs';

const setup = join(stateDir, 'airplus-probe');
const auth = join(setup, 'session.json');
const script = fileURLToPath(new URL('./airplus_cloud.py', import.meta.url));
const run = promisify(execFile);
const devices = Object.fromEntries(Object.entries(config.airplus?.devices ?? {})
  .filter(([model, profile]) => model.trim() && typeof profile?.room === 'string' && profile.room.trim())
  .map(([model, profile]) => [model, { room: profile.room.trim(), humidity: profile.humidity === true }]));
const profiles = JSON.stringify(devices);
let pendingCommand;
async function request(command) {
  try {
    const args = [script, auth, profiles];
    if (command) args.push(JSON.stringify(command));
    const { stdout } = await run(join(setup, 'venv', 'bin', 'python'), args, { timeout: command ? 23_000 : 15_000, maxBuffer: 8192 });
    return JSON.parse(stdout);
  } catch {
    throw new Error(command ? 'Čistička změnu nepotvrdila.' : 'Stav čističek se nepodařilo načíst z Philips Air+.');
  }
}
const source = cachedSource('airplus', () => request(), 60_000, 5 * 60_000);

export function airplusConfigured() {
  return Object.keys(devices).length > 0 && existsSync(auth);
}

export function airplusStatus() {
  if (pendingCommand) return pendingCommand.catch(() => {}).then(() => airplusStatus());
  return airplusConfigured() ? source.get() : { state: 'off' };
}

export function airplusCommand({ model, action, value }) {
  if (typeof model !== 'string' || !Object.hasOwn(devices, model)) return null;
  const valid = (action === 'power' && typeof value === 'boolean') ||
    (action === 'mode' && ['auto', 'sleep', 'medium', 'turbo'].includes(value)) ||
    (action === 'humidity' && devices[model].humidity && [40, 50, 60, 70].includes(value));
  if (!valid) return null;
  pendingCommand = request({ model, action, value }).finally(() => {
    source.invalidate();
    pendingCommand = null;
  });
  return pendingCommand;
}
