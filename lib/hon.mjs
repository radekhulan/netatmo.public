import { execFile } from 'node:child_process';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { cachedSource } from './cache.mjs';
import { stateDir } from './config.mjs';

const script = fileURLToPath(new URL('./hon_probe.py', import.meta.url));
const cycleFile = join(stateDir, 'hon-cycle.json');
const run = promisify(execFile);
let revision;
let signInRequired = false;
let cycle;

async function recordCycle(data) {
  cycle ??= await readFile(cycleFile, 'utf8').then(JSON.parse).catch(() => ({}));
  const mode = Number(data.machMode);
  if (data.connected === false || ![1, 2, 3, 4, 5, 6, 7, 9].includes(mode)) return cycle.completedAt;
  const phase = [2, 3, 9].includes(mode) ? 'active' : mode === 7 ? 'finished' : 'idle';
  if (cycle.phase === phase) return cycle.completedAt;

  const next = { ...cycle, phase };
  if (phase === 'finished' && cycle.phase === 'active') next.completedAt = Date.now();
  await writeFile(cycleFile + '.tmp', JSON.stringify(next), { mode: 0o600 });
  await rename(cycleFile + '.tmp', cycleFile);
  cycle = next;
  return cycle.completedAt;
}

const washer = cachedSource('hon', async () => {
  if (signInRequired) return { reauth: true };
  let response;
  try {
    const { stdout } = await run('python3', [script, '--status'], {
      env: { ...process.env, STATE_DIR: stateDir }, timeout: 14_000, maxBuffer: 8192,
    });
    response = JSON.parse(stdout);
  } catch {
    throw new Error('Stav pračky se nepodařilo načíst z hOn.');
  }
  signInRequired = response.reauth === true;
  if (signInRequired) return { reauth: true };
  return { ...response.data, completedAt: await recordCycle(response.data) };
}, 30_000);

export async function washerStatus() {
  const session = await stat(join(stateDir, 'hon.json')).catch(() => null);
  if (!session) return { state: 'off' };
  if (revision !== session.ino) {
    revision = session.ino;
    signInRequired = false;
    washer.invalidate();
  }
  return washer.get();
}
