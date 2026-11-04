class InterviewPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = [];
    this.length = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.[0]) {
      const frame = new Float32Array(channels[0].length);
      for (let i = 0; i < frame.length; i++) {
        for (const channel of channels) frame[i] += channel[i] / channels.length;
      }
      this.frames.push(frame);
      this.length += frame.length;
      if (this.length >= 2048) {
        const output = new Float32Array(this.length);
        let offset = 0;
        for (const f of this.frames) {
          output.set(f, offset);
          offset += f.length;
        }
        this.port.postMessage(output, [output.buffer]);
        this.frames = [];
        this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor('interview-pcm-capture', InterviewPcmCapture);
