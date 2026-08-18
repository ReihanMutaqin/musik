# RIFF//LAB — Reihan.online

RIFF//LAB adalah rhythm game 5-fret lokal di browser. Pemain dapat mengimpor paket chart `.sng` atau `.zip`, memilih instrumen dan difficulty, lalu bermain dengan keyboard atau kontrol sentuh.

## Yang didukung

- SNGPKG v1 dengan metadata, artwork, chart, dan audio yang di-unmask di browser
- ZIP bergaya Chorus/Clone Hero dengan `song.ini`, `notes.chart` atau `notes.mid`
- Audio Opus, Ogg Vorbis, MP3, WAV, M4A, WebM; termasuk beberapa stem
- Tempo map, chord, sustain, open note, section marker, dan overdrive phrase
- Lead, Bass, Rhythm, dan Keys pada Easy–Expert ketika tersedia
- Mode Tap atau Fret + Strum, practice speed, serta latency offset
- Canvas highway responsif, keyboard, touch control, score, streak, Pulse Shift, pause, restart, dan results
- Training riff sintetis bawaan yang bebas aset pihak ketiga

Semua paket lagu diproses lokal. File audio dan chart yang dipilih pengguna tidak dikirim ke server.

## Pengembangan

```bash
npm install
npm run dev
```

Pemeriksaan kualitas:

```bash
npm run lint
npm run typecheck
npm test
```

## Struktur utama

- `components/rhythm/RhythmLab.tsx` — importer dan soundcheck
- `components/rhythm/GameStage.tsx` — highway, timing, input, score
- `lib/rhythm/importer.ts` — parser SNG/ZIP dan asset loader
- `lib/rhythm/chart.ts` — parser `.chart` dan MIDI
- `lib/rhythm/demo.ts` — training chart + audio WAV sintetis

RIFF//LAB tidak berafiliasi dengan Chorus Encore atau Clone Hero. Gunakan hanya chart/audio yang berhak kamu pakai.
