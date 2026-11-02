# Dompet 💸

Catatan keuangan pribadi berbentuk **PWA** — jalan offline di HP, dan bisa **sinkron antar device** lewat server kecil yang ikut ada di repo ini.

Dibuat tanpa framework, tanpa build step, tanpa database eksternal. Total app shell ± 50 KB.

---

## Isi repo

```
index.html          Markup app (semua sheet, view, form)
style.css           Seluruh tampilan — dark theme, no framework
app.js              Logika app: state, render, CRUD, statistik
sync.js             Klien sinkronisasi (per-record last-write-wins)
sw.js               Service worker (offline cache)
manifest.json       Metadata PWA (installable)
icon.svg            Ikon sumber
server/serve_all.py Server gabungan: sajikan file app + API sync (1 file, stdlib)
server/sync_server.py Versi lama, API sync saja (tanpa file statis)
online.sh           Skrip nyalakan server + Cloudflare Tunnel
docs/               Catatan cara pembuatan & keputusan desain
```

## Fitur

- **Saldo berjalan antar bulan** — ada titik "saldo awal" yang jadi pangkal rantai. Saldo awal tiap bulan otomatis = saldo akhir bulan sebelumnya.
- **CRUD transaksi** — 10 kategori pengeluaran, 6 kategori pemasukan, tanggal bebas (bisa backdate).
- **Filter & statistik per bulan** — donut chart kategori, rata-rata harian, tren bulanan, saldo akhir tiap bulan.
- **Sinkron antar device** — isi kode ruang yang sama → tambah, ubah, dan hapus ikut tersalin.
- **Offline-first** — semua data di `localStorage`; internet cuma dipakai saat sync.
- **Export JSON** — data lo, bukan data orang lain.

## Cara pakai

### Cukup di satu HP (tanpa sync)

Buka `index.html`. Selesai. Semua fitur jalan offline, data tersimpan di browser.

Buat yang rapi (installable): jalankan server statis dari folder ini, buka di Chrome, lalu *Add to Home screen*.

```sh
python3 -m http.server 8080
```

### Dengan sync antar device

```sh
sh online.sh
```

Skrip itu menjalankan `server/serve_all.py` (port 8110) dan membukakan Cloudflare Tunnel, lalu mencetak URL publik seperti `https://xxxx-yyyy.trycloudflare.com`.

Buka URL itu di semua HP, lalu di app:

1. Ketuk ikon sync di kanan atas
2. **Kode ruang**: satu kata kunci yang sama di semua HP, misal `surya-dompet-7x2k`
3. **Alamat server**: URL publik tadi
4. **Simpan & sinkron sekarang**

Data dari semua HP langsung bergabung. Selesai.

```sh
sh online.sh url     # lihat URL yang sedang aktif
sh online.sh stop    # matikan
```

## Cara kerja sync

Proto kolaborasi sederhana, cukup untuk beberapa device milik satu orang:

| Endpoint | Fungsi |
|---|---|
| `POST /api/push?room=<room>` | Kirim semua record lokal |
| `GET /api/pull?room=<room>&since=<ts>` | Ambil record yang lebih baru dari `since` |
| `GET /api/health` | Cek server hidup |

- **Unit sinkronisasi = satu transaksi**, bukan satu file. Dua device ubah transaksi berbeda → keduanya aman.
- **Konflik** diselesaikan per record: nilai dengan `updated` (epoch ms) terbesar yang menang — *last-write-wins*.
- **Hapus** tidak benar-benar menghapus, tapi menandai record dengan `{deleted:true}` (tombstone) supaya device lain ikut menghapus, bukan menghidupkannya kembali.
- **Saldo awal** diperlakukan sebagai satu record spesial ber-id `__opening__`.
- **Penyimpanan server**: SQLite satu tabel, `PRIMARY KEY (room, rid)`.

Skemanya sengaja dibuat sederhana. Tidak ada merge tiga arah, tidak ada vektor jam. Untuk dua sampai lima HP milik orang yang sama, ini cukup dan gampang di-debug.

## Batasan yang perlu lo tahu

- **Cloudflare quick tunnel itu sementara.** URL berganti tiap server di-restart, dan tidak ada jaminan uptime. Untuk URL tetap, pakai named tunnel (butuh akun Cloudflare).
- **Server jalan di device yang menjalankannya.** Kalau HP-nya mati atau app-nya tidur, sync berhenti sampai dinyalakan lagi.
- **Kode ruang adalah kuncinya.** Siapa pun yang tahu kode ruang bisa membaca dan menulis data di ruang itu. Pakai kode yang susah ditebak.
- **Data tetap di perangkat.** Server hanya titik temu, bukan backup. Export JSON secara berkala kalau datanya penting.

## Lisensi

MIT — pakai, ubah, jual, terserah lo.

---

## Dokumen

| File | Isi |
|---|---|
| [`docs/cara-dibuat.md`](docs/cara-dibuat.md) | Kenapa PWA, model data, saldo berantai, alasan tiap keputusan |
| [`docs/jebakan.md`](docs/jebakan.md) | 10 bug yang buang waktu — `let` vs `window`, tombstone, cache, compositor |
| [`docs/sync.md`](docs/sync.md) | Protokol sync, last-write-wins, tombstone, kontrak API |
| [`docs/hosting.md`](docs/hosting.md) | Nyalakan Pages, jalankan server + tunnel, batasannya |

## Lisensi

MIT — lihat [LICENSE](LICENSE).
