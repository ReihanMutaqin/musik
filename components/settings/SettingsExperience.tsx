"use client";

import { useState } from "react";
import { useAppSettings, type ThemeMode } from "@/components/AppProviders";
import { Robot } from "@/components/robot/Robot";
import { CameraIcon, ChevronDownIcon, RefreshIcon, SoundIcon, SparkIcon } from "@/components/ui/Icons";
import { MUSIC_MODES, SCALES } from "@/lib/audio/music";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}><i /></button>;
}

export function SettingsExperience() {
  const { settings, updateSettings, resetSettings } = useAppSettings();
  const [resetDone, setResetDone] = useState(false);

  const reset = () => {
    if (!window.confirm("Reset semua pengaturan, obrolan, dan progres musik di perangkat ini?")) return;
    resetSettings();
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2200);
  };

  return (
    <main className="settings-page section-shell">
      <header className="settings-heading"><div><p className="kicker">PENGATURAN</p><h1>Bikin REIA terasa<br /><span>lebih personal.</span></h1><p>Semua preferensi disimpan hanya di perangkatmu.</p></div><div><Robot state="happy" size="medium" /></div></header>
      <div className="settings-layout">
        <nav aria-label="Kelompok pengaturan"><a href="#appearance">Tampilan</a><a href="#voice">Suara REIA</a><a href="#music">Musik & Kamera</a><a href="#data">Data lokal</a></nav>
        <div className="settings-groups">
          <section id="appearance" className="settings-group">
            <div className="settings-group__title"><SparkIcon /><div><h2>Tampilan</h2><p>Sesuaikan tema dan intensitas gerakan.</p></div></div>
            <div className="setting-row setting-row--stack"><div><strong>Tema</strong><small>Pilih tampilan terang, gelap, atau ikuti perangkat.</small></div><div className="theme-options">{(["light","dark","system"] as ThemeMode[]).map((theme) => <button key={theme} type="button" className={settings.theme === theme ? "is-active" : ""} onClick={() => updateSettings({ theme })}>{theme === "light" ? "Terang" : theme === "dark" ? "Gelap" : "Sistem"}</button>)}</div></div>
            <div className="setting-row"><div><strong>Gerakan penuh</strong><small>Matikan untuk mengurangi animasi dan efek visual.</small></div><Toggle label="Gerakan penuh" checked={settings.animationLevel === "full"} onChange={(value) => updateSettings({ animationLevel: value ? "full" : "reduced" })} /></div>
            <div className="setting-row"><div><strong>Suara antarmuka</strong><small>Bunyi kecil saat tombol dan tantangan aktif.</small></div><Toggle label="Suara antarmuka" checked={settings.uiSounds} onChange={(uiSounds) => updateSettings({ uiSounds })} /></div>
          </section>

          <section id="voice" className="settings-group">
            <div className="settings-group__title"><SoundIcon /><div><h2>Suara REIA</h2><p>Atur cara REIA membacakan respons.</p></div></div>
            <label className="setting-row setting-row--range"><div><strong>Kecepatan bicara</strong><small>Pelan sampai cepat.</small></div><span><input type="range" min="0.7" max="1.35" step="0.02" value={settings.voiceRate} onChange={(event) => updateSettings({ voiceRate: Number(event.target.value) })} /><b>{settings.voiceRate.toFixed(2)}×</b></span></label>
            <label className="setting-row setting-row--range"><div><strong>Pitch suara</strong><small>Rendah sampai sedikit lebih cerah.</small></div><span><input type="range" min="0.7" max="1.45" step="0.02" value={settings.voicePitch} onChange={(event) => updateSettings({ voicePitch: Number(event.target.value) })} /><b>{settings.voicePitch.toFixed(2)}×</b></span></label>
            <div className="setting-row"><div><strong>Bacakan respons otomatis</strong><small>REIA langsung berbicara setelah jawaban selesai.</small></div><Toggle label="Bacakan respons otomatis" checked={settings.autoSpeak} onChange={(autoSpeak) => updateSettings({ autoSpeak })} /></div>
            <label className="setting-row setting-row--range"><div><strong>Volume utama</strong><small>Berlaku untuk suara dan musik.</small></div><span><input type="range" min="0" max="0.85" step="0.01" value={settings.masterVolume} onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) })} /><b>{Math.round(settings.masterVolume * 100)}%</b></span></label>
          </section>

          <section id="music" className="settings-group">
            <div className="settings-group__title"><CameraIcon /><div><h2>Musik & Kamera</h2><p>Atur pengalaman default saat membuka Gesture Music.</p></div></div>
            <div className="setting-row"><div><strong>Cermin kamera</strong><small>Gerakan terasa seperti melihat ke cermin.</small></div><Toggle label="Cermin kamera" checked={settings.cameraMirror} onChange={(cameraMirror) => updateSettings({ cameraMirror })} /></div>
            <div className="setting-row"><div><strong>Tampilkan rangka tangan</strong><small>Overlay landmark saat tangan terdeteksi.</small></div><Toggle label="Tampilkan rangka tangan" checked={settings.showSkeleton} onChange={(showSkeleton) => updateSettings({ showSkeleton })} /></div>
            <label className="setting-row setting-row--select"><div><strong>Tangga nada default</strong><small>Dipakai saat Gesture Music dibuka.</small></div><span><select value={settings.scale} onChange={(event) => updateSettings({ scale: event.target.value })}>{Object.entries(SCALES).map(([id,item]) => <option key={id} value={id}>{item.label}</option>)}</select><ChevronDownIcon /></span></label>
            <label className="setting-row setting-row--select"><div><strong>Mode musik default</strong><small>Mode awal untuk kamera gesture.</small></div><span><select value={settings.musicMode} onChange={(event) => updateSettings({ musicMode: event.target.value })}>{MUSIC_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDownIcon /></span></label>
          </section>

          <section id="data" className="settings-group settings-group--danger">
            <div className="settings-group__title"><RefreshIcon /><div><h2>Data lokal</h2><p>Kelola preferensi dan riwayat yang tersimpan di browser.</p></div></div>
            <div className="setting-row"><div><strong>Reset semua data lokal</strong><small>Menghapus pengaturan, obrolan, onboarding, rekaman, dan progres di perangkat ini.</small></div><button className="reset-button" type="button" onClick={reset}>{resetDone ? "Sudah direset" : "Reset data"}</button></div>
          </section>
        </div>
      </div>
    </main>
  );
}
