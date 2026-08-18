import type { PresetId } from "@/lib/audio/music";

type Voice = { oscillators: OscillatorNode[]; gain: GainNode; stopAt: number };

export class ReiaAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private voices = new Set<Voice>();
  private continuous: { oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  async initialize(volume = 0.58) {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = Math.min(.8, volume);
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = .004;
      this.compressor.release.value = .18;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 12_000;
      this.delay = this.context.createDelay(.8);
      this.delay.delayTime.value = .22;
      this.delayFeedback = this.context.createGain();
      this.delayFeedback.gain.value = .18;
      this.reverb = this.context.createConvolver();
      this.reverb.buffer = this.makeImpulse(1.7, 2.4);
      this.wet = this.context.createGain();
      this.wet.gain.value = .14;
      this.filter.connect(this.compressor);
      this.filter.connect(this.delay);
      this.delay.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);
      this.delay.connect(this.compressor);
      this.filter.connect(this.reverb);
      this.reverb.connect(this.wet);
      this.wet.connect(this.compressor);
      this.compressor.connect(this.master);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  private makeImpulse(duration: number, decay: number) {
    if (!this.context) throw new Error("Audio engine belum aktif");
    const rate = this.context.sampleRate;
    const length = rate * duration;
    const impulse = this.context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay;
      }
    }
    return impulse;
  }

  setMasterVolume(value: number) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(.85, value)), this.context.currentTime, .03);
  }

  setReverb(value: number) {
    if (!this.context || !this.wet) return;
    this.wet.gain.setTargetAtTime(Math.max(0, Math.min(.6, value)), this.context.currentTime, .08);
  }

  setGlobalFilter(value: number) {
    if (!this.context || !this.filter) return;
    const frequency = 450 + Math.max(0, Math.min(1, value)) ** 2 * 13_000;
    this.filter.frequency.setTargetAtTime(frequency, this.context.currentTime, .04);
  }

  playNote(frequency: number, options: { duration?: number; velocity?: number; preset?: PresetId; pan?: number } = {}) {
    if (!this.context || !this.filter) return;
    const now = this.context.currentTime;
    const duration = options.duration ?? .48;
    const velocity = Math.max(.02, Math.min(.45, options.velocity ?? .22));
    const preset = options.preset ?? "soft-bell";
    const wave = this.waveForPreset(preset);
    const attack = preset === "warm-pad" || preset === "air" ? .18 : preset === "soft-bass" ? .04 : .012;
    const release = preset === "warm-pad" || preset === "air" ? 1.1 : preset === "soft-bell" || preset === "glass" ? .75 : .24;
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(velocity, now + attack);
    gain.gain.setValueAtTime(velocity, now + duration);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration + release);
    gain.connect(panner).connect(this.filter);

    const oscillators: OscillatorNode[] = [];
    const harmonics = this.harmonicsForPreset(preset);
    for (const harmonic of harmonics) {
      const oscillator = this.context.createOscillator();
      const harmonicGain = this.context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency * harmonic.ratio;
      oscillator.detune.value = harmonic.detune;
      harmonicGain.gain.value = harmonic.gain;
      oscillator.connect(harmonicGain).connect(gain);
      oscillator.start(now);
      oscillator.stop(now + duration + release + .05);
      oscillators.push(oscillator);
    }
    const voice = { oscillators, gain, stopAt: now + duration + release + .05 };
    this.voices.add(voice);
    window.setTimeout(() => {
      oscillators.forEach((oscillator) => oscillator.disconnect());
      gain.disconnect();
      panner.disconnect();
      this.voices.delete(voice);
    }, (duration + release + .2) * 1000);
  }

  playChord(frequencies: number[], preset: PresetId = "warm-pad", velocity = .15) {
    frequencies.slice(0, 5).forEach((frequency, index) => this.playNote(frequency, { duration: .85, velocity, preset, pan: (index / Math.max(1, frequencies.length - 1) - .5) * .55 }));
  }

  playDrum(kind: "kick" | "snare" | "hat" | "clap", velocity = .34) {
    if (!this.context || !this.filter) return;
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    gain.connect(this.filter);
    if (kind === "kick") {
      const oscillator = this.context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(145, now);
      oscillator.frequency.exponentialRampToValueAtTime(44, now + .16);
      gain.gain.setValueAtTime(velocity, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .2);
      oscillator.connect(gain); oscillator.start(now); oscillator.stop(now + .22);
    } else {
      const duration = kind === "hat" ? .07 : kind === "clap" ? .14 : .19;
      const buffer = this.context.createBuffer(1, this.context.sampleRate * duration, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const drumFilter = this.context.createBiquadFilter();
      drumFilter.type = kind === "hat" ? "highpass" : "bandpass";
      drumFilter.frequency.value = kind === "hat" ? 6500 : kind === "clap" ? 1300 : 1900;
      drumFilter.Q.value = kind === "clap" ? .5 : 1.1;
      gain.gain.setValueAtTime(kind === "hat" ? velocity * .55 : velocity, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.buffer = buffer;
      source.connect(drumFilter).connect(gain);
      source.start(now);
    }
  }

  startContinuous(frequency: number, preset: PresetId = "dream-lead") {
    if (!this.context || !this.filter) return;
    this.stopContinuous();
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = this.waveForPreset(preset);
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    gain.gain.value = .0001;
    gain.gain.exponentialRampToValueAtTime(.13, this.context.currentTime + .08);
    oscillator.connect(filter).connect(gain).connect(this.filter);
    oscillator.start();
    this.continuous = { oscillator, gain, filter };
  }

  updateContinuous(frequency: number, volume: number, brightness: number) {
    if (!this.context || !this.continuous) return;
    const now = this.context.currentTime;
    this.continuous.oscillator.frequency.setTargetAtTime(Math.max(35, Math.min(2600, frequency)), now, .025);
    this.continuous.gain.gain.setTargetAtTime(Math.max(.0001, Math.min(.22, volume)), now, .035);
    this.continuous.filter.frequency.setTargetAtTime(350 + Math.max(0, Math.min(1, brightness)) * 7200, now, .04);
  }

  stopContinuous() {
    if (!this.context || !this.continuous) return;
    const current = this.continuous;
    const now = this.context.currentTime;
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setTargetAtTime(.0001, now, .035);
    current.oscillator.stop(now + .18);
    window.setTimeout(() => {
      current.oscillator.disconnect(); current.gain.disconnect(); current.filter.disconnect();
    }, 260);
    this.continuous = null;
  }

  hasContinuousVoice() { return Boolean(this.continuous); }

  private waveForPreset(preset: PresetId): OscillatorType {
    if (preset === "digital-pluck" || preset === "tiny-robot") return "square";
    if (preset === "retro-wave" || preset === "soft-bass") return "sawtooth";
    if (preset === "dream-lead") return "triangle";
    return "sine";
  }

  private harmonicsForPreset(preset: PresetId) {
    if (preset === "soft-bell" || preset === "glass") return [{ ratio: 1, gain: 1, detune: 0 }, { ratio: 2, gain: .26, detune: 2 }, { ratio: 3.01, gain: .12, detune: -3 }];
    if (preset === "warm-pad" || preset === "air") return [{ ratio: 1, gain: .68, detune: -8 }, { ratio: 1, gain: .68, detune: 8 }, { ratio: 2, gain: .14, detune: 0 }];
    if (preset === "tiny-robot") return [{ ratio: 1, gain: .75, detune: 0 }, { ratio: 2.02, gain: .18, detune: 0 }];
    return [{ ratio: 1, gain: 1, detune: 0 }, { ratio: 2, gain: .12, detune: 0 }];
  }

  dispose() {
    this.stopContinuous();
    for (const voice of this.voices) {
      voice.oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already stopped */ } oscillator.disconnect(); });
      voice.gain.disconnect();
    }
    this.voices.clear();
    this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }
}
