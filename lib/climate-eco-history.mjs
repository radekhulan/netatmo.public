import { appendFile, mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' });
const day = 86_400_000;
const maxSampleGap = 180_000;

export function createEcoHistory(directory) {
  const path = (date) => join(directory, `climate-eco-${date}.jsonl`);
  let currentDate;

  async function read(now, days) {
    const start = now - days * day;
    const dates = new Set(Array.from({ length: 2 * days + 1 }, (_, i) => dateKey.format(start + i * day / 2)));
    const files = await Promise.all([...dates].map((date) => readFile(path(date), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    })));
    const points = files.flatMap((file) => file.split('\n').flatMap((line) => {
      if (!line) return [];
      try {
        const row = JSON.parse(line);
        return Number.isFinite(row?.at) && row.at >= start && row.at <= now ? [row] : [];
      } catch {
        return [];
      }
    }));
    return { start, end: now, points: points.sort((a, b) => a.at - b.at) };
  }

  return {
    async add(record) {
      const date = dateKey.format(record.at);
      if (date !== currentDate) {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const cutoff = dateKey.format(record.at - 7 * day);
        const files = await readdir(directory);
        await Promise.all(files.filter((name) => /^climate-eco-\d{4}-\d\d-\d\d\.jsonl$/.test(name) && name.slice(12, -6) < cutoff)
          .map((name) => unlink(join(directory, name))));
        currentDate = date;
      }
      await appendFile(path(date), JSON.stringify(record) + '\n', { mode: 0o600 });
    },
    recent(now = Date.now()) {
      return read(now, 1);
    },
    async weekly(now = Date.now()) {
      const { points } = await read(now, 7);
      const runs = [];
      let run;
      let previousAt;
      for (const point of points) {
        if (run && point.at - previousAt > maxSampleGap) run = undefined;
        if (point.on === true) {
          run = { started: point };
          runs.push(run);
        } else if (point.on === false) {
          if (run) run.stopped = point;
          else runs.push({ stopped: point });
          run = undefined;
        } else if (!['warmup', 'running', 'low'].includes(point.status)) {
          run = undefined;
        }
        previousAt = point.at;
      }
      return { runs };
    },
  };
}
