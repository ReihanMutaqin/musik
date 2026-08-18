"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Robot, type RobotState } from "@/components/robot/Robot";
import { Onboarding } from "@/components/home/Onboarding";
import { ArrowRightIcon, ArrowUpRightIcon, CameraIcon, ChatIcon, HandIcon, MicIcon, SoundIcon, SparkIcon } from "@/components/ui/Icons";

const states: RobotState[] = ["idle", "curious", "happy"];

export function HomeExperience() {
  const [robotState, setRobotState] = useState<RobotState>("idle");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = window.setInterval(() => {
      setRobotState((current) => states[(states.indexOf(current) + 1) % states.length]);
    }, 5200);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main>
      <Onboarding />
      {!online && <div className="offline-bar" role="status">Hmm, internetnya putus. Musik lokal tetap bisa dimainkan setelah modul termuat.</div>}
      <section className="home-hero section-shell">
        <div className="home-hero__copy">
          <div className="eyebrow"><span className="status-dot" />Teman digital yang hidup di browser</div>
          <h1>Kenalan dengan <span>REIA,</span><br />teman digitalmu.</h1>
          <p className="hero-lead">Ngobrol, bermain musik, bereksperimen dengan gesture, dan menjelajahi interaksi AI langsung dari browser.</p>
          <div className="button-row">
            <Link className="button button--primary" href="/reia">Ngobrol dengan REIA <ArrowRightIcon /></Link>
            <Link className="button button--secondary" href="/gesture">Mainkan Gesture <HandIcon /></Link>
          </div>
          <div className="privacy-note"><span><CameraIcon /></span><p><strong>Kameramu tetap privat.</strong> Pengenalan tangan diproses langsung di perangkat.</p></div>
        </div>

        <div className="home-hero__stage" onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width - 0.5) * 16}px`);
          event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height - 0.5) * 12}px`);
        }}>
          <div className="hero-stage__mesh" />
          <div className="hero-stage__note hero-stage__note--one">DO</div>
          <div className="hero-stage__note hero-stage__note--two">MI</div>
          <div className="hero-stage__note hero-stage__note--three">SOL</div>
          <div className="hero-stage__bubble">Hai, aku REIA <span>✦</span></div>
          <Robot state={robotState} />
          <div className="hero-stage__status"><span className="sound-mini"><i /><i /><i /><i /></span><p><strong>REIA aktif</strong><small>Siap diajak ngobrol</small></p></div>
        </div>
      </section>

      <section className="capability-strip" aria-label="Kemampuan utama">
        <div><ChatIcon /><span><strong>Ngobrol natural</strong><small>Bahasa Indonesia sehari-hari</small></span></div>
        <div><MicIcon /><span><strong>Respons bersuara</strong><small>Suara lembut dan hangat</small></span></div>
        <div><HandIcon /><span><strong>Tangan jadi musik</strong><small>Pitch mengikuti gerakanmu</small></span></div>
      </section>

      <section className="experience-section section-shell">
        <div className="section-heading">
          <div><p className="kicker">SATU TEMPAT, BANYAK CARA BERMAIN</p><h2>Bukan cuma chatbot.</h2></div>
          <p>REIA memadukan percakapan, suara, kamera, dan musik menjadi pengalaman yang benar-benar terasa interaktif.</p>
        </div>

        <div className="experience-grid">
          <Link className="experience-card experience-card--chat" href="/reia">
            <div className="experience-card__top"><span>01</span><ArrowUpRightIcon /></div>
            <div className="mini-chat">
              <div className="mini-chat__robot"><Robot state="speaking" size="small" interactive={false} /></div>
              <div className="mini-chat__messages"><p>Lagi ngapain?</p><p>Lagi nungguin kamu ngajak ngobrol hehe.</p></div>
            </div>
            <div><h3>Ngobrol dengan REIA</h3><p>Tanya, cerita, atau cari ide. REIA merespons cepat dan mengikuti gaya bahasamu.</p></div>
          </Link>

          <Link className="experience-card experience-card--gesture" href="/gesture">
            <div className="experience-card__top"><span>02</span><ArrowUpRightIcon /></div>
            <div className="gesture-preview">
              <div className="gesture-preview__hand"><HandIcon /></div>
              <div className="gesture-preview__pitch"><b>HIGH</b><i><em /></i><b>LOW</b></div>
              <div className="gesture-preview__readout"><small>GESTURE</small><strong>OPEN PALM</strong><small>NADA</small><strong>SOL 4</strong></div>
            </div>
            <div><h3>Gesture Music</h3><p>Angkat tangan, pilih nada dengan jari, lalu gerakkan naik-turun untuk mengubah pitch.</p></div>
          </Link>

          <Link className="experience-card experience-card--play" href="/playground">
            <div className="experience-card__top"><span>03</span><ArrowUpRightIcon /></div>
            <div className="play-preview">
              <div><SoundIcon /><span className="play-preview__wave"><i /><i /><i /><i /><i /><i /><i /></span></div>
              <div><SparkIcon /><span>Gerak. Bunyi. Reaksi.</span></div>
            </div>
            <div><h3>Creative Playground</h3><p>Eksperimen kecil untuk suara, ekspresi robot, partikel, theremin, dan visual gerak.</p></div>
          </Link>
        </div>
      </section>

      <section className="how-section section-shell">
        <div className="how-section__title"><p className="kicker">MULAI DALAM HITUNGAN DETIK</p><h2>Tidak perlu instal apa pun.</h2></div>
        <ol className="how-steps">
          <li><span>1</span><div><strong>Pilih pengalaman</strong><p>Ngobrol atau langsung bermain musik.</p></div></li>
          <li><span>2</span><div><strong>Izinkan saat dibutuhkan</strong><p>Mikrofon dan kamera tidak aktif otomatis.</p></div></li>
          <li><span>3</span><div><strong>Main sesukamu</strong><p>Tanpa akun, langsung dari browser.</p></div></li>
        </ol>
      </section>

      <section className="home-cta section-shell">
        <Robot state="happy" size="medium" interactive={false} />
        <div><p className="kicker">REIA MENUNGGUMU</p><h2>Mau mulai dari mana?</h2><p>Ceritain harimu, atau ubah gerakan tangan menjadi musik.</p></div>
        <div className="button-row"><Link className="button button--ink" href="/reia">Ajak ngobrol <ChatIcon /></Link><Link className="button button--light" href="/gesture">Main musik <SoundIcon /></Link></div>
      </section>
    </main>
  );
}
