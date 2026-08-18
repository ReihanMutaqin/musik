"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAppSettings } from "@/components/AppProviders";
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from "@/components/ui/Icons";

const links = [
  ["/", "Beranda"],
  ["/reia", "REIA"],
  ["/gesture", "Gesture Music"],
  ["/playground", "Playground"],
  ["/about", "Tentang"],
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { settings, updateSettings } = useAppSettings();
  const isDark = settings.theme === "dark";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label="Reihan.online — Beranda" onClick={() => setOpen(false)}>
          <span className="brand__mark"><i /><i /></span>
          <span>reihan<span>.online</span></span>
        </Link>

        <nav className={`nav ${open ? "nav--open" : ""}`} aria-label="Navigasi utama">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "is-active" : ""} onClick={() => setOpen(false)}>{label}</Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <button className="icon-button" type="button" onClick={() => updateSettings({ theme: isDark ? "light" : "dark" })} aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="icon-button menu-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Tutup menu" : "Buka menu"}>
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
