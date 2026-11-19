import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createVoiceHistory(directory, onError) {
  const file = join(directory, 'history.jsonl');
  const temporary = file + '.tmp';
  let pending = Promise.resolve();

  return function save(record) {
    const entry = { ...record };
    pending = pending.then(async () => {
      const content = await readFile(file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const rows = content.split('\n').filter(Boolean);
      const index = rows.findIndex((row) => JSON.parse(row).id === entry.id);
      if (index === -1) rows.push(JSON.stringify(entry));
      else rows[index] = JSON.stringify(entry);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        await writeFile(temporary, rows.slice(-200).join('\n') + '\n', { mode: 0o600 });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    }).catch(onError);
    return pending;
  };
}
