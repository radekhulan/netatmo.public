import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logEvent } from './log.mjs';

const interval = 8 * 60 * 60_000;
const keys = ['heating', 'station'];

export function createBatteryCache(directory) {
  const file = join(directory, 'netatmo-batteries.json');
  const records = {};
  let saving = Promise.resolve();
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    for (const key of keys) {
      const record = saved?.[key];
      if (Number.isFinite(record?.at) && record.at > 0 && record.at <= Date.now() && Array.isArray(record.data)) records[key] = record;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') logEvent('warning', 'batteries.load_failed', {}, error);
  }

  function readings() {
    return Object.fromEntries(Object.entries(records).map(([key, record]) => [key, {
      ...record, stale: Date.now() - record.at >= interval,
    }]));
  }

  async function update(sources, force = false) {
    let changed = false;
    for (const key of keys) {
      const { state, at, data } = sources[key];
      const previous = records[key]?.at;
      if (state !== 'live' || !Number.isFinite(at) ||
          (previous != null && (at <= previous || (!force && at - previous < interval)))) continue;
      records[key] = { at, data };
      changed = true;
    }
    if (changed) {
      const snapshot = JSON.stringify(records);
      saving = saving.then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(file + '.tmp', snapshot, { mode: 0o600 });
        await rename(file + '.tmp', file);
      }).catch((error) => logEvent('warning', 'batteries.save_failed', {}, error));
      await saving;
    }
    return readings();
  }

  return { update };
}
