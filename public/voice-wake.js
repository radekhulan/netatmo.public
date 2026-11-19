const assetPath = '/voice-assets/';
const frameSize = 1280;
const overlap = 480;
const melBands = 32;
const melFrames = 76;
const features = 96;
const featureFrames = 16;

export async function createWakeDetector() {
  const { env, InferenceSession, Tensor } = await import('/voice-assets/ort.wasm.min.mjs');
  env.wasm.numThreads = 1;
  env.wasm.proxy = false;
  env.wasm.wasmPaths = new URL(assetPath, location.href).href;
  const options = { executionProviders: ['wasm'] };
  const melModel = await InferenceSession.create(assetPath + 'melspectrogram.onnx', options);
  const featureModel = await InferenceSession.create(assetPath + 'embedding_model.onnx', options);
  const wakeModel = await InferenceSession.create(assetPath + 'hey_jarvis_v0.1.onnx', options);
  const previousAudio = new Float32Array(overlap);
  const melWindow = new Float32Array(melFrames * melBands);
  const featureWindow = new Float32Array(featureFrames * features);
  const quietAudio = new Float32Array(overlap + frameSize);
  const quietMel = await infer(melModel, quietAudio, [1, quietAudio.length]);
  const silentFrame = quietMel.slice(-melBands).map((value) => value / 10 + 2);
  const silentMelWindow = new Float32Array(melWindow.length);
  for (let offset = 0; offset < silentMelWindow.length; offset += melBands) silentMelWindow.set(silentFrame, offset);
  const silentEmbedding = await infer(featureModel, silentMelWindow, [1, melFrames, melBands, 1]);
  let generation = 0;
  let processing = false;

  function reset() {
    generation++;
    previousAudio.fill(0);
    melWindow.set(silentMelWindow);
    for (let offset = 0; offset < featureWindow.length; offset += features) featureWindow.set(silentEmbedding, offset);
  }

  async function infer(model, data, shape) {
    const input = new Tensor('float32', data, shape);
    try {
      const output = (await model.run({ [model.inputNames[0]]: input }))[model.outputNames[0]];
      try {
        return output.data.slice();
      } finally {
        output.dispose();
      }
    } finally {
      input.dispose();
    }
  }

  async function process(frame) {
    if (processing) throw new Error('Detektor už vyhodnocuje předchozí zvukový blok.');
    if (!(frame instanceof Float32Array) || frame.length !== frameSize) {
      throw new TypeError('Detektor potřebuje 1280 vzorků mono při 16 kHz.');
    }
    processing = true;
    const currentGeneration = generation;
    try {
      const audio = new Float32Array(overlap + frameSize);
      audio.set(previousAudio);
      for (let i = 0; i < frame.length; i++) {
        audio[overlap + i] = Math.trunc(Math.max(-32768, Math.min(32767, frame[i] * 32768)));
      }
      previousAudio.set(audio.subarray(audio.length - overlap));

      const mel = await infer(melModel, audio, [1, audio.length]);
      if (currentGeneration !== generation) return false;
      melWindow.copyWithin(0, mel.length);
      for (let i = 0; i < mel.length; i++) melWindow[melWindow.length - mel.length + i] = mel[i] / 10 + 2;

      const embedding = await infer(featureModel, melWindow, [1, melFrames, melBands, 1]);
      if (currentGeneration !== generation) return false;
      featureWindow.copyWithin(0, features);
      featureWindow.set(embedding, featureWindow.length - features);

      const scores = await infer(wakeModel, featureWindow, [1, featureFrames, features]);
      return currentGeneration === generation && scores[0] >= 0.5;
    } finally {
      processing = false;
    }
  }

  reset();
  return { process, reset };
}
