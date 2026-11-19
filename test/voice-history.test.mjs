import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVoiceHistory } from '../lib/voice-history.mjs';

test('voice history stores only recent turns privately and updates existing records on disk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-history-'));
  const file = join(directory, 'history.jsonl');
  const errors = [];
  try {
    const save = createVoiceHistory(directory, (error) => errors.push(error));
    await Promise.all(Array.from({ length: 203 }, (_, id) => save({ id, outcome: 'pending_client' })));
    const afterRestart = createVoiceHistory(directory, (error) => errors.push(error));
    await afterRestart({ id: 201, outcome: 'answered', answer: 'Hraje hudba.' });
    const rows = (await readFile(file, 'utf8')).trim().split('\n').map((row) => JSON.parse(row));
    assert.equal(rows.length, 200);
    assert.equal(rows[0].id, 3);
    assert.deepEqual(rows.at(-2), { id: 201, outcome: 'answered', answer: 'Hraje hudba.' });
    assert.equal(rows.at(-1).id, 202);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(errors, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
