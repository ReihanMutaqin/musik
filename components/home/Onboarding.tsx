"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Robot } from "@/components/robot/Robot";
import { ArrowRightIcon, CameraIcon, ChatIcon, CloseIcon, HandIcon } from "@/components/ui/Icons";

const stages = [
  { eyebrow: "01 · KENALAN", title: "Hai, aku REIA.", text: "Robot kecil di Reihan.online. Kita bisa ngobrol, cari ide, atau sekadar main bareng.", icon: "robot" },
  { eyebrow: "02 · GESTURE MUSIC", title: "Tanganmu bisa jadi alat musik.", text: "Kamera membaca gesture langsung di perangkatmu. Gerak naik berarti pitch makin tinggi.", icon: "hand" },
  { eyebrow: "03 · PILIH AWALMU", title: "Mau coba yang mana?", text: "Tidak ada akun dan tidak perlu instal. Kamu selalu bisa berpindah mode nanti.", icon: "camera" },
] as const;

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localStorage.getItem("reihan.onboarding") !== "done") setVisible(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  const complete = () => {
    localStorage.setItem("reihan.onboarding", "done");
    setVisible(false);
  };

  if (!visible) return null;
  const current = stages[stage];

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button className="onboarding__close" type="button" onClick={complete} aria-label="Lewati perkenalan"><CloseIcon /></button>
        <div className="onboarding__visual">
          {current.icon === "robot" && <Robot state="happy" size="medium" />}
          {current.icon === "hand" && <div className="onboarding__hand"><HandIcon /><span>LOW</span><i><em /></i><span>HIGH</span></div>}
          {current.icon === "camera" && <div className="onboarding__choices"><span><ChatIcon /></span><i>atau</i><span><CameraIcon /></span></div>}
        </div>
        <div className="onboarding__content">
          <p className="kicker">{current.eyebrow}</p>
          <h2 id="onboarding-title">{current.title}</h2>
          <p>{current.text}</p>
          <div className="onboarding__dots">{stages.map((item, index) => <i key={item.eyebrow} className={index === stage ? "is-active" : ""} />)}</div>
          {stage < stages.length - 1 ? (
            <div className="onboarding__actions"><button type="button" className="button button--primary" onClick={() => setStage((value) => value + 1)}>Lanjut <ArrowRightIcon /></button><button type="button" onClick={complete}>Lewati</button></div>
          ) : (
            <div className="onboarding__actions onboarding__actions--final"><Link className="button button--primary" href="/reia" onClick={complete}>Ngobrol Dulu <ChatIcon /></Link><Link className="button button--secondary" href="/gesture" onClick={complete}>Main Musik <HandIcon /></Link></div>
          )}
        </div>
      </section>
    </div>
  );
}
