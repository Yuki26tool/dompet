# Nyalakan & hosting

## 1. Buka app-nya (GitHub Pages) — 2 klik

Repo ini sudah siap tampil sebagai website. Yang kurang cuma satu tombol:

1. Buka **https://github.com/Yuki26tool/dompet/settings/pages**
2. Di **Source** pilih **Deploy from a branch**
3. Branch: **`main`** · Folder: **`/ (root)`** → **Save**

Tunggu 1–2 menit. Alamatnya jadi:

```
https://yuki26tool.github.io/dompet/
```

Semua path di app relatif (`./app.js`, `./style.css`), jadi jalan di subdirektori tanpa diubah.
Service worker juga sudah didaftarkan hanya pada http(s), jadi offline cache aktif di Pages.

> Kalau muncul 404 setelah beberapa menit: cek Settings → Pages, pastikan branch `main` dan folder `/ (root)`, lalu refresh.

## 2. Sync antar device

Pages cuma menyajikan **file**. Data tetap di `localStorage` masing-masing device —
statis tidak menyinkronkan apa pun. Makanya repo ini menyertakan server kecil.

### Jalankan server + tunnel

```sh
cd dompet
python3 server/serve_all.py          # port 8110, sajikan file + API sekaligus
```

Di terminal lain:

```sh
cloudflared tunnel --url http://127.0.0.1:8110
```

Atau pakai skrip yang sudah disiapkan:

```sh
sh online.sh          # nyalakan server + tunnel, cetak URL publik
sh online.sh url      # lihat URL yang sedang aktif
sh online.sh stop     # matikan
```

### Sambungkan dari HP

Buka app → **Sync antar device** → isi:

| Field | Isi |
|---|---|
| Kode ruang | bebas, **harus sama** di semua device |
| Alamat server | URL yang dicetak `online.sh` |

Simpan. Device lain dengan dua nilai sama akan ikut bergabung.

### Batasan quick tunnel

- URL **berubah** setiap kali `cloudflared` dijalankan ulang (gratis, tanpa akun)
- Server jalan di komputer/HP kamu — kalau mati, sync berhenti
- Kode ruang adalah satu-satunya kunci. Siapa pun yang tahu kodenya bisa baca & tulis data

Untuk yang permanen: pakai **named tunnel** Cloudflare (butuh akun, URL tetap), atau taruh
`server/serve_all.py` di VPS mana pun.

## 3. App tetap jalan tanpa server

Kalau cuma mau catat keuangan di satu HP, **server tidak diperlukan sama sekali**.
Buka `index.html` langsung, atau pasang lewat menu "Add to Home screen".
Sync cuma perlu kalau kamu pakai lebih dari satu device.
