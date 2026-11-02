# Desain sinkronisasi

Tujuan: beberapa HP milik satu orang, kadang online, kadang tidak, saling bertukar catatan keuangan tanpa konflik yang merusak data.

## Kenapa butuh server

`localStorage` terpisah per device. Dua HP membuka URL yang sama tetap punya data sendiri-sendiri — tidak ada yang disinkronkan oleh hosting.

Perlu satu tempat untuk berpapasan. Server di repo ini isinya satu file Python stdlib, ± 150 baris, dengan SQLite.

## Model data

Satu record = satu transaksi.

```js
{ id: "4grqjwz843bq", updated: 1793623744166, deleted: false, body: { ...transaksi } }
```

- `id` — unik, dibuat di klien (`uid()`), bukan server. Jadi device bisa bikin transaksi saat offline.
- `updated` — epoch milidetik, diisi klien. Ini yang menentukan pemenang konflik.
- `deleted` — tombstone. `true` berarti "record ini dulunya ada, sekarang sudah dihapus".

Saldo awal disimpan sebagai record biasa dengan id tetap `__opening__`.

## Protokol

```
POST /api/push?room=<room>
  body: { records: [ {id, updated, deleted, body}, ... ] }
  resp: { ok: true, saved: 11, now: 1793623744.16 }

GET /api/pull?room=<room>&since=<timestamp>
  resp: { records: [ {id, updated, ...body}, ... ], now: 1793623744.16 }

GET /api/health
  resp: { ok: true, t: 1793623744 }
  cross:/GET, POST, OPTIONS — semua dengan Access-Control-Allow-Origin: *
```

Siklus satu putaran:

1. `push` — kirim **semua** record lokal
2. `pull?since=last` — ambil record yang berubah sejak `last`
3. simpan `now` dari respons sebagai `last` berikutnya
4. ulangi tiap 15 detik, dan 1,2 detik setelah ada perubahan lokal

Push mengirim semuanya (bukan cuma yang berubah) karena jumlah record-nya kecil — satu tahun pemakaian aktif mungkin 1000 transaksi, sekitar 150 KB. Lebih murah mengirim semuanya daripada menyimpan antrean "apa yang belum terkirim".

## Resolusi konflik

Per record, bukan per file. Pemenang: `updated` terbesar.

```
record di server: updated = 1793623744166
record di lokal:  updated = 1793623800000   ← lebih baru, menang
```

**Kenapa LWW cukup di sini:** yang bertabrakan biasanya bukan record yang sama. Dua orang jarang mengedit transaksi yang persis sama pada detik yang sama — dan kalau itu terjadi (satu orang, dua HP, mengedit hal sama), kehilangan satu versi masih bisa ditoleransi.

**Yang tidak ditangani:** merge tiga arah, vektor jam, atau konflik pada level field. Kalau nanti butuh kolaborasi banyak orang secara bersamaan, model ini perlu diganti. Untuk satu orang dengan dua-tiga HP, ini cukup.

## Tombstone

Menghapus record **tidak** membuangnya dari array lokal. Yang terjadi:

```js
rec.deleted = true;
rec.updated = Date.now();
```

Record tetap dikirim ke server saat push, jadi device lain tahu untuk menghapus juga.

**Kenapa harus begitu:** kalau record dibuang langsung, device lain tidak pernah tahu record itu pernah ada. Saat putaran sync berikutnya, dia akan mengirim versi lamanya lagi — dan transaksi yang sudah dihapus **hidup kembali**. Ini bug yang klasik dan susah dilacak.

**Batas:** tombstone tidak pernah dipangkas. Untuk pemakaian bertahun-tahun, perlu aturan "hapus tombstone yang lebih tua dari N hari" — dengan syarat semua device sudah sync setidaknya sekali dalam rentang itu.

## Penyimpanan server

Satu tabel SQLite:

```sql
CREATE TABLE recs (
  room TEXT NOT NULL,
  rid  TEXT NOT NULL,
  body TEXT NOT NULL,     -- JSON utuh record
  upd  REAL NOT NULL,
  PRIMARY KEY (room, rid)
);
```

Push memakai `INSERT ... ON CONFLICT DO UPDATE` dengan syarat `upd` yang masuk lebih besar dari yang tersimpan:

```sql
if existing.upd >= incoming.upd: skip
else: upsert
```

**Kenapa `body` disimpan sebagai JSON string, bukan kolom-kolom terpisah:** server tidak perlu tahu isi transaksinya. Dia cuma tempat berpapasan. Kalau skema transaksi berubah (tambah field, ganti kategori), server tidak perlu diubah.

## Keamanan

**Kode ruang adalah satu-satunya kunci.** Siapa pun yang tahu kode ruang bisa membaca dan menulis. Tidak ada autentikasi, tidak ada enkripsi di sisi server.

Untuk pemakaian pribadi, cukup — asalkan kodenya panjang dan tidak bisa ditebak (`surya-dompet-7x2k-a9f3`, bukan `dompet`).

**Kalau butuh lebih:** enkripsi body di klien sebelum dikirim (server jadi buta), atau ganti ke Supabase/Firebase yang punya autentikasi bawaan.

**Yang tidak boleh:** memakai skema ini untuk data keuangan yang serius tanpa minimal enkripsi sisi klien, atau dengan kode ruang yang gampang.

## Akses dari internet

Server mendengarkan di `0.0.0.0:8110`, lalu Cloudflare Tunnel meneruskannya:

```
cloudflared tunnel --url http://127.0.0.1:8110 --no-autoupdate
```

Quick tunnel: gratis, tanpa akun, tanpa buka port router, otomatis HTTPS. Tapi URL berganti setiap restart dan tidak ada jaminan uptime.

Untuk URL tetap: named tunnel (butuh akun Cloudflare, `cloudflared tunnel create`), atau taruh `serve_all.py` di VPS dan pakai reverse proxy.

## Alternatif yang dipertimbangkan

| Opsi | Alasan tidak dipakai |
|---|---|
| CouchDB / PouchDB | Model konfliknya bagus, tapi butuh database server yang lebih berat |
| Automerge / Yjs (CRDT) | Sangat benar untuk kolaborasi nyata, tapi berlebihan untuk satu orang |
| Git sebagai transport | Konflik merge terlalu kasar per file |
| Firebase Firestore | Paling cepat dibangun, tapi data ada di pihak lain dan butuh akun |

Untuk kasus ini — satu orang, beberapa HP, data kecil — LWW per record adalah titik seimbang antara benar dan sederhana.
