import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { cachedSource } from './cache.mjs';
import { env, stateDir } from './config.mjs';

const setup = join(stateDir, 'coffeelink-probe');
const auth = join(setup, 'session.json');
const script = fileURLToPath(new URL('./coffeelink_cloud.py', import.meta.url));
const run = promisify(execFile);

async function request(wake = false) {
  try {
    const args = wake ? [script, setup, 'wake'] : [script, setup];
    const { stdout } = await run(join(setup, 'venv', 'bin', 'python'), args, {
      timeout: wake ? 53_000 : 16_000,
      maxBuffer: 4096,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    return JSON.parse(stdout);
  } catch {
    throw new Error(wake ? 'Kávovar probuzení nepotvrdil.' : 'Stav kávovaru se nepodařilo načíst z Coffee Link.');
  }
}

const source = cachedSource('coffeelink', () => request(), 60_000, 5 * 60_000);
let waking;

export function coffeeConfigured() {
  return Boolean(env.COFFEELINK_OEM_MODEL?.trim()) && existsSync(auth);
}

export function coffeeStatus() {
  if (waking) return { state: 'live', data: { status: 'wake_pending' } };
  return coffeeConfigured() ? source.get() : { state: 'off' };
}

export function wakeCoffee() {
  if (!coffeeConfigured()) return { result: 'unavailable' };
  if (waking) return { result: 'busy' };
  waking = request(true).finally(() => {
    source.invalidate();
    waking = null;
  });
  return waking;
}
