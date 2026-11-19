import { createWakeDetector } from './voice-wake.js';

let detector;
let generation = 0;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      detector = await createWakeDetector();
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'reset') {
      generation = data.generation;
      detector?.reset();
    } else if (data.type === 'frame' && detector) {
      const current = generation;
      const wake = await detector.process(data.samples);
      self.postMessage({ type: 'frame', wake: wake && current === generation, generation: current });
    }
  } catch {
    self.postMessage({ type: 'error' });
  }
};
