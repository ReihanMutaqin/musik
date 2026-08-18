"use client";

// Web Audio API Synthesizer for Authentic Guitar Hero Sound Effects
// Ultra-low latency (<5ms), zero network overhead, rich harmonic synthesis.

class SoundFXEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.85;

  private init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      return;
    }
    if (typeof window === "undefined") return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Compressor to prevent clipping
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Pre-compute Distortion Curve for Electric Guitar FX
      this.distortionCurve = this.makeDistortionCurve(60);
    } catch {
      // AudioContext unavailable
    }
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  // 1. Tactile Note Hit Sound (Clean Arcade Strike / Pick Tap)
  public playNoteHit(lane: number = 2, judgement: string = "PERFECT", isStarPower: boolean = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const laneFrequencies = [261.63, 329.63, 392.00, 493.88, 587.33]; // C4, E4, G4, B4, D5 (Major Pentatonic)
    const baseFreq = laneFrequencies[Math.max(0, Math.min(4, lane))] || 392;

    // Fast transient click (Percussive pick attack)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = isStarPower ? "triangle" : "sine";
    osc.frequency.setValueAtTime(baseFreq * (isStarPower ? 1.5 : 1), t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, t + 0.08);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isStarPower ? 6000 : 3500, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.08);

    const isPerfect = judgement.includes("PERFECT");
    const peakVol = isPerfect ? 0.35 : 0.24;

    gain.gain.setValueAtTime(peakVol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isStarPower ? 0.12 : 0.07));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.12);

    // Subtle wooden/metallic snare click
    const bufferSize = this.ctx.sampleRate * 0.035;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(isStarPower ? 3800 : 2200, t);
    noiseFilter.Q.setValueAtTime(2.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.04);
  }

  // 2. Muted String Miss / Wrong Note Clack ("Chunk")
  public playMissSound() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;

    // Low muted thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, t); // A2
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.09);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.09);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.1);

    // Pick scratch noise
    const bufferSize = this.ctx.sampleRate * 0.055;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.setValueAtTime(850, t);
    nFilter.Q.setValueAtTime(1.8, t);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.22, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.06);
  }

  // 3. Thunderous Star Power Activation Explosion
  public playStarPowerActivate() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;

    // Distorted Power Chord (E2 - B2 - E3 - G#3)
    const chordFreqs = [82.41, 123.47, 164.81, 207.65, 329.63];
    chordFreqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const dist = this.ctx.createWaveShaper();
      if (this.distortionCurve) dist.curve = this.distortionCurve;

      osc.type = idx % 2 === 0 ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.01), t);

      // Whammy pitch dive & rise
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.6);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.setValueAtTime(0.22, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc.connect(dist);
      dist.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 1.25);
    });

    // Lightning crash / Whoosh riser
    const bufferSize = this.ctx.sampleRate * 0.7;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const sweepFilter = this.ctx.createBiquadFilter();
    sweepFilter.type = "bandpass";
    sweepFilter.frequency.setValueAtTime(300, t);
    sweepFilter.frequency.exponentialRampToValueAtTime(4500, t + 0.25);
    sweepFilter.frequency.exponentialRampToValueAtTime(800, t + 0.7);
    sweepFilter.Q.setValueAtTime(3.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    noise.connect(sweepFilter);
    sweepFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.75);
  }

  // 4. Star Phrase Success Reward Arpeggio (Celestial Bell Harp)
  public playStarPhraseSuccess() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = t + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.24, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.48);
    });
  }

  // 5. Multiplier Level Up Chime (2x, 3x, 4x, 8x streak fanfare)
  public playMultiplierUp(multiplier: number = 2) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const baseFreq = 440 * (multiplier >= 4 ? 1.5 : 1);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(baseFreq, t);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.12);
    osc2.frequency.setValueAtTime(baseFreq * 2, t);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 3, t + 0.14);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.3);
    osc2.stop(t + 0.3);
  }
}

export const soundFX = new SoundFXEngine();
