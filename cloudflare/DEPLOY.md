# Deploy sync ke Cloudflare (permanen + privat)

Worker ini menggantikan server Python yang cuma hidup selama HP nyala.
Setelah deploy: URL tetap, server nggak pernah tidur, dan **cuma orang
yang punya kunci ruang yang bisa baca/tulis**.

Kontrak API-nya sama persis dengan `server/serve_all.py`, jadi app nggak
perlu diubah apa pun — tinggal ganti Alamat Server.

## 0. Ringkasnya

| Yang lo dapat | Detail |
|---|---|
| Hosting | Cloudflare Workers, gratis, tanpa kartu kredit |
| Database | D1 (SQLite), gratis 5 juta baris baca/hari |
| Privasi | Kunci per ruang. Tanpa kunci → 403. Ruang tak dikenal → 404 |
| Yang perlu | Akun Cloudflare (cukup email) + Node.js |

## 1. Pasang wrangler

```sh
npm install -g wrangler
wrangler login
```

`wrangler login` membuka browser. Setelah itu terminal punya izin ke akun lo.

## 2. Bikin database D1

```sh
cd cloudflare
wrangler d1 create dompet
```

Perintah itu mencetak `database_id`. Salin ke `wrangler.toml`, ganti
`GANTI_DENGAN_ID_D1`.

## 3. Bikin tabel

```sh
wrangler d1 execute dompet --remote --file=schema.sql
```

Dua tabel: `records` (isi sync) dan `rooms` (daftar ruang + hash kunci).

## 4. Deploy

```sh
wrangler deploy
```

Hasilnya URL seperti:

```
https://dompet-sync.<akun-lo>.workers.dev
```

Cek hidup:

```sh
curl https://dompet-sync.<akun-lo>.workers.dev/api/health
# {"ok":true,"t":1762...}
```

## 5. Bikin ruang keluarga

Ruang = satu "brankas" dengan kuncinya sendiri. Bikin sekali, hasilnya
dibagikan ke semua anggota keluarga.

```sh
curl -X POST https://dompet-sync.<akun-lo>.workers.dev/api/room
```

Balasannya:

```json
{"room":"Xk3pQ7mB","key":"hT9vL2mR8qZ4sW1nC6yB0aD5"}
```

**Kunci cuma muncul sekali ini.** Server hanya menyimpan hash SHA-256-nya —
kalau hilang, nggak bisa dipulihkan, harus bikin ruang baru.

Simpan tiga hal ini di tempat aman (catatan HP / password manager):

```
Alamat server : https://dompet-sync.<akun-lo>.workers.dev
Kode ruang    : Xk3pQ7mB
Kunci akses   : hT9vL2mR8qZ4sW1nC6yB0aD5
```

## 6. Sambungkan app di tiap HP

Buka app → ikon 🔄 (Sync antar device) → isi tiga field itu → **Simpan &
sinkron sekarang**. Ulangi di HP anggota keluarga dengan tiga nilai yang
**persis sama**.

Kalau kunci salah, app bilang "kunci salah" (server balas 403). Kalau kode
ruang salah ketik, app bilang ruangnya nggak ada (404).

## 7. Pasang app-nya juga (biar nggak buka repo terus)

Repo sudah punya app statis. Aktifkan Pages: Settings → Pages → branch
`main`, folder `/ (root)`, Save. Lalu buka
`https://<user>.github.io/dompet/` di HP dan tambahkan ke home screen.

Sekarang dua-duanya permanen: app-nya di GitHub Pages, sync-nya di Cloudflare.

## Yang perlu lo tahu

- **Gratis.** Free tier Workers: 100.000 request/hari. Sync Dompet butuh
  puluhan per hari. D1 gratis 5 juta baris baca/hari.
- **Tanpa kartu kredit.** Daftar cukup email.
- **Privat, tapi bukan E2EE.** Data tersimpan sebagai JSON biasa di D1 —
  Cloudflare secara teori bisa membacanya, dan orang yang punya kunci bisa
  membuka ruangnya. Untuk catatan keuangan keluarga ini wajar. Kalau mau
  enkripsi ujung-ke-ujung, isi record harus dienkripsi di HP sebelum dikirim
  (belum dibuat).
- **Satu ruang bisa dipakai banyak HP.** Nggak ada batas jumlah device.
- **Ruang terpisah total.** Kunci ruang A nggak bisa buka ruang B — sudah
  diuji.

## Kalau mau jalankan lokal dulu

Worker bisa dites di Node tanpa Cloudflare dan tanpa jaringan:

```sh
cd cloudflare
node test-local.mjs     # 26 kasus: kunci, LWW, tombstone, opening, CORS
```

Untuk server lokal penuh (statis + API):

```sh
DOMPET_ROOT=. PORT=8110 python3 server/serve_all.py
```

## Biaya kalau tumbuh

Lewat free tier baru kena kalau sync > 100.000 request/hari — itu sekitar
2.700 sync per device per hari. Untuk keluarga, praktis nggak akan kena.
Kalau kena: Workers Paid $5/bulan.

## Alternatif tanpa Cloudflare

`../server/serve_all.py` + `../online.sh`: satu file Python stdlib, jalan di
VPS/host apa pun yang punya Python 3. Kekurangannya harus ada mesin nyala
24 jam — kalau pakai HP ini, ya harus HP ini terus hidup dan app-nya jalan.
