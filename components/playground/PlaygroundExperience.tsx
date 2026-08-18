"use client";

import Link from "next/link";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { useAppSettings } from "@/components/AppProviders";
import { Robot, type RobotState } from "@/components/robot/Robot";
import { ArrowRightIcon, ChatIcon, MicIcon, PlayIcon, SoundIcon, SparkIcon, StopIcon } from "@/components/ui/Icons";
import { ReiaAudioEngine } from "@/lib/audio/engine";
import { midiToFrequency, type PresetId } from "@/lib/audio/music";

const expressionStates: RobotState[] = ["idle", "happy", "curious", "thinking", "speaking", "music", "sleeping"];
const pads: Array<{ label: string; midi?: number; drum?: "kick" | "snare" | "hat" | "clap"; preset: PresetId }> = [
  { label: "BELL", midi: 72, preset: "soft-bell" },
  { label: "PLUCK", midi: 67, preset: "digital-pluck" },
  { label: "ROBOT", midi: 76, preset: "tiny-robot" },
  { label: "BASS", midi: 43, preset: "soft-bass" },
  { label: "KICK", drum: "kick", preset: "soft-bass" },
  { label: "SNARE", drum: "snare", preset: "digital-pluck" },
  { label: "HAT", drum: "hat", preset: "glass" },
  { label: "CLAP", drum: "clap", preset: "air" },
];

export function PlaygroundExperience() {
  const { settings } = useAppSettings();
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const [voicePitch, setVoicePitch] = useState(1.08);
  const [voiceRate, setVoiceRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [thereminActive, setThereminActive] = useState(false);
  const [theremin, setTheremin] = useState({ x: .5, y: .5, hz: 220 });
  const [pointer, setPointer] = useState({ x: 50, y: 50 });
  const engineRef = useRef<ReiaAudioEngine | null>(null);

  const engine = async () => {
    const current = engineRef.current || new ReiaAudioEngine();
    engineRef.current = current;
    await current.initialize(settings.masterVolume);
    return current;
  };

  const playPad = async (pad: (typeof pads)[number]) => {
    const audio = await engine();
    setRobotState("music");
    if (pad.drum) audio.playDrum(pad.drum, .34);
    else if (pad.midi) audio.playNote(midiToFrequency(pad.midi), { preset: pad.preset, velocity: .24, duration: .5 });
    window.setTimeout(() => setRobotState("idle"), 750);
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Hai, aku REIA. Suaraku bisa kamu atur sesukamu.");
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith("id")) || null;
    utterance.lang = utterance.voice?.lang || "id-ID";
    utterance.pitch = voicePitch;
    utterance.rate = voiceRate;
    utterance.volume = settings.masterVolume;
    utterance.onstart = () => { setSpeaking(true); setRobotState("speaking"); };
    utterance.onend = () => { setSpeaking(false); setRobotState("idle"); };
    utterance.onerror = utterance.onend;
    window.speechSynthesis.speak(utterance);
  };

  const stopVoice = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setRobotState("idle");
  };

  const moveTheremin = async (event: PointerEvent<HTMLDivElement>) => {
    if (!thereminActive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const frequency = 70 * 2 ** ((1 - y) * 4.4);
    const audio = await engine();
    if (!audio.hasContinuousVoice()) audio.startContinuous(frequency, "dream-lead");
    audio.updateContinuous(frequency, .035 + x * .15, x);
    setTheremin({ x, y, hz: Math.round(frequency) });
    setRobotState("music");
  };

  const toggleTheremin = async () => {
    if (thereminActive) {
      engineRef.current?.stopContinuous();
      setThereminActive(false);
      setRobotState("idle");
      return;
    }
    await engine();
    setThereminActive(true);
    setRobotState("music");
  };

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    engineRef.current?.dispose();
  }, []);

  return (
    <main className="playground-page section-shell">
      <header className="playground-heading">
        <p className="kicker">CREATIVE PLAYGROUND</p>
        <h1>Sentuh. Gerakkan.<br /><span>Dengarkan reaksinya.</span></h1>
        <p>Kumpulan eksperimen kecil untuk mengenal suara, ekspresi, dan interaksi digital bersama REIA.</p>
      </header>

      <section className="playground-grid">
        <article className="lab-card lab-card--robot">
          <div className="lab-card__label"><span>01</span>ROBOT EXPRESSIONS</div>
          <div className="expression-stage"><Robot state={robotState} size="medium" /></div>
          <div className="expression-controls">{expressionStates.map((state) => <button key={state} type="button" className={robotState === state ? "is-active" : ""} onClick={() => setRobotState(state)}>{state}</button>)}</div>
          <div><h2>Ekspresi REIA</h2><p>Lihat bagaimana mata, antena, dan gerak tubuh REIA merespons setiap keadaan.</p></div>
        </article>

        <article className="lab-card lab-card--voice">
          <div className="lab-card__label"><span>02</span>VOICE PITCH</div>
          <div className="voice-orb"><span className={speaking ? "is-speaking" : ""}><MicIcon /></span><div>{[1,2,3,4,5,6,7,8,9].map((item) => <i key={item} />)}</div></div>
          <div className="voice-controls">
            <label><span>Pitch <b>{voicePitch.toFixed(2)}×</b></span><input type="range" min="0.6" max="1.6" step="0.02" value={voicePitch} onChange={(event) => setVoicePitch(Number(event.target.value))} /></label>
            <label><span>Kecepatan <b>{voiceRate.toFixed(2)}×</b></span><input type="range" min="0.65" max="1.35" step="0.02" value={voiceRate} onChange={(event) => setVoiceRate(Number(event.target.value))} /></label>
          </div>
          <button className="button button--ink" type="button" onClick={speaking ? stopVoice : speak}>{speaking ? <StopIcon /> : <PlayIcon />}{speaking ? "Hentikan" : "Dengarkan REIA"}</button>
        </article>

        <article className="lab-card lab-card--pads">
          <div className="lab-card__label"><span>03</span>SOUND PAD</div>
          <div className="sound-pads">{pads.map((pad, index) => <button key={pad.label} type="button" onPointerDown={() => void playPad(pad)}><small>0{index + 1}</small><strong>{pad.label}</strong><i /></button>)}</div>
          <div><h2>Delapan suara sintetis</h2><p>Semua bunyi dibuat langsung oleh browser tanpa sampel audio eksternal.</p></div>
        </article>

        <article className="lab-card lab-card--motion" onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPointer({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
        }}>
          <div className="lab-card__label"><span>04</span>MOTION VISUALIZER</div>
          <div className="motion-field" style={{ "--px": `${pointer.x}%`, "--py": `${pointer.y}%` } as React.CSSProperties}>{Array.from({ length: 16 }, (_, index) => <i key={index} />)}<span><SparkIcon /></span></div>
          <div><h2>Gerak jadi visual</h2><p>Geser pointer atau jarimu. Partikel mengikuti gerakan tanpa beban grafis berlebihan.</p></div>
        </article>

        <article className="lab-card lab-card--theremin">
          <div className="lab-card__label"><span>05</span>DIGITAL THEREMIN</div>
          <div className={`theremin-field ${thereminActive ? "is-active" : ""}`} onPointerMove={(event) => void moveTheremin(event)}>
            <span className="theremin-cursor" style={{ left: `${theremin.x * 100}%`, top: `${theremin.y * 100}%` }}><i /></span>
            <b>HIGH</b><b>LOW</b><small>{theremin.hz} Hz</small>
          </div>
          <button className="button button--primary" type="button" onClick={() => void toggleTheremin()}>{thereminActive ? <StopIcon /> : <SoundIcon />}{thereminActive ? "Matikan Theremin" : "Aktifkan Theremin"}</button>
        </article>

        <article className="lab-card lab-card--chat">
          <div className="lab-card__label"><span>06</span>AI MINI CHAT</div>
          <div className="mini-ai-stage"><span><i /><i /></span><p>“Kalau eksperimenmu sudah selesai, kita bisa ngobrol soal apa saja.”</p></div>
          <div><h2>Masuk ke ruang chat</h2><p>Respons AI yang asli, streaming, dan tetap membawa kepribadian REIA.</p></div>
          <Link className="button button--light" href="/reia">Buka chat lengkap <ArrowRightIcon /></Link>
        </article>
      </section>

      <section className="playground-cta"><div><ChatIcon /><p><strong>Punya ide eksperimen?</strong><span>Ceritakan ke REIA dan kembangkan bareng.</span></p></div><Link href="/reia">Ngobrol sekarang <ArrowRightIcon /></Link></section>
    </main>
  );
}
