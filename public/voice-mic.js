class PanelVoiceMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.next = 0;
    this.position = 0;
    this.previous = 0;
    this.length = 0;
    this.frame = new Float32Array(1280);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      while (this.next <= this.position) {
        const fraction = this.next - this.position + 1;
        this.frame[this.length++] = this.previous + (sample - this.previous) * fraction;
        this.next += this.step;
        if (this.length === this.frame.length) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(1280);
          this.length = 0;
        }
      }
      this.position++;
      this.previous = sample;
    }
    return true;
  }
}

registerProcessor('panel-voice-mic', PanelVoiceMic);
