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

Buka app → **Sync antar device** → isi alamat server dulu, lalu ketuk
**Buat ruang baru**. Server membuat kode ruang + kunci acak — bagikan
**keduanya** ke HP lain lewat jalur aman (jangan diumbar). Di HP lain isi
kode ruang, kunci ruang, dan alamat server yang sama → **Simpan & sinkron
sekarang**.

Kunci disimpan di server sebagai hash SHA-256, bukan plaintext. Tanpa kunci
yang benar, server menolak (403).

### Batasan quick tunnel

- URL **berubah** setiap kali `cloudflared` dijalankan ulang (gratis, tanpa akun)
- Server jalan di komputer/HP kamu — kalau mati, sync berhenti

Untuk yang permanen: pakai **named tunnel** Cloudflare (butuh akun, URL tetap),
taruh `server/serve_all.py` di VPS mana pun, atau opsi gratis di bawah.

### Opsi: InstaBox (cloud Linux gratis)

[InstaBox](https://instabox.sh) memberi 1 microVM gratis (4 vCPU / 8 GB).
Server Dompet jalan di sana sebagai systemd service, port-nya dipublish jadi
URL HTTPS publik yang permanen:

```sh
# di dalam machine (Debian 13)
git clone --depth 1 https://github.com/Yuki26tool/dompet /data/dompet
sudo tee /etc/systemd/system/dompet.service > /dev/null <<'EOF'
[Unit]
Description=Dompet sync server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /data/dompet/server/serve_all.py
Environment=PORT=8110
Environment=DOMPET_DB=/data/dompet-data/sync.db
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now dompet
```

Lalu publish port via API (atau dashboard):

```sh
curl -X POST https://api.instabox.sh/v1/machines/<id>/ports \
  -H "X-API-Key: $INSTABOX_API_KEY" -H 'Content-Type: application/json' \
  -d '{"port":8110,"name":"Dompet sync"}'
# → {"url":"https://8110-<id>.instabox.tech", ...}
```

Catatan:

- Paket gratis **pause otomatis setelah 30 menit idle** — tapi kunjungan ke URL
  publik membangunkan machine sendiri (<1 detik), jadi sync dari HP tetap jalan.
- Database di `/data` (persistent, selamat dari restart). Backup berkala
  disarankan: `sqlite3 /data/dompet-data/sync.db .dump`.

## 3. App tetap jalan tanpa server

Kalau cuma mau catat keuangan di satu HP, **server tidak diperlukan sama sekali**.
Buka `index.html` langsung, atau pasang lewat menu "Add to Home screen".
Sync cuma perlu kalau kamu pakai lebih dari satu device.
