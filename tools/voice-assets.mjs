import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const models = 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/';
const runtime = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const assets = [
  [models, 'melspectrogram.onnx', 'ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f'],
  [models, 'embedding_model.onnx', '70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f'],
  [models, 'hey_jarvis_v0.1.onnx', '94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb'],
  [runtime, 'ort.wasm.min.mjs', '6ef726f355b791129f7ddf3f62e7877a16b9b777abe87004b8ab306e6b9cf265'],
  [runtime, 'ort-wasm-simd-threaded.mjs', '30dd851d9c00622940500f71ddd2ff8820c5cb65270816080175b958705385a8'],
  [runtime, 'ort-wasm-simd-threaded.wasm', '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4'],
];

const directory = resolve(process.argv[2] || process.env.VOICE_ASSETS_DIR ||
  join(process.env.STATE_DIR || '.state', 'voice', 'assets'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir(directory, { recursive: true, mode: 0o700 });
const temporary = await mkdtemp(join(directory, '.download-'));
try {
  for (const [base, name, expected] of assets) {
    const destination = join(directory, name);
    const existing = await readFile(destination).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (existing && sha256(existing) === expected) continue;
    const response = await fetch(base + name, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${name}: stahování skončilo HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expected) throw new Error(`${name}: kontrolní součet SHA-256 nesouhlasí.`);
    const downloaded = join(temporary, name);
    await writeFile(downloaded, bytes, { mode: 0o600 });
    await rename(downloaded, destination);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(`Soubory pro detekci Hey Jarvis jsou připravené v ${directory}.`);
