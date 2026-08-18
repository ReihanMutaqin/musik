import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <p>© {new Date().getFullYear()} Reihan.online</p>
        <p>Dibuat sebagai eksperimen AI & teknologi kreatif interaktif.</p>
      </div>
      <nav aria-label="Navigasi footer">
        <Link href="/about">Tentang</Link>
        <Link href="/privacy">Privasi</Link>
        <Link href="/settings">Pengaturan</Link>
      </nav>
    </footer>
  );
}
