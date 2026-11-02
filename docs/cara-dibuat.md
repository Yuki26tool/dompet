# Cara website ini dibuat

Catatan proses, bukan tutorial. Isinya keputusan yang diambil, kesalahan yang kena, dan alasan di baliknya — supaya kalau nanti ada yang mau mengubah, dia tahu mana yang sengaja dan mana yang kebetulan.

## 1. Keputusan pertama: PWA, bukan APK

Awalnya cuma satu pertanyaan: *"bikin catatan keuangan"*. Pilihannya APK native (Kotlin/Flutter) atau web app.

Dipilih **PWA** karena:

- **Nol dependency.** Tidak ada Gradle, tidak ada SDK Android, tidak ada build step. Edit `app.js`, refresh, langsung lihat hasilnya.
- **Installable.** Di Chrome Android bisa "Add to Home screen", ikon sendiri, jalan fullscreen — secara visual tidak beda jauh dengan app native.
- **Offline.** Service worker + `localStorage` = tetap jalan tanpa internet.
- **Portabel.** Satu folder bisa ditaruh di hosting mana pun, atau dibuka langsung dari file.

Yang dikorbankan: tidak bisa akses fitur native (kamera, notifikasi, dsb), dan data terkurung di origin-nya (lihat bagian sync).

## 2. Bertiga file, bukan satu file raksasa

Dipecah jadi `index.html` (struktur), `style.css` (tampilan), `app.js` (logika), plus `sync.js` yang dipisah belakangan.

Alasan memisahkan `sync.js`: sinkronisasi itu fitur opsional dengan domain sendiri (jaringan, konflik, retry). Kalau dicampur ke `app.js`, setiap kali menyentuh logika transaksi lo harus lewat 300 baris kode jaringan dulu.

**Jebakan yang langsung kena:** file JS terpisah **tidak bisa saling melihat variabel `let`/`const` top-level**. `let db` di `app.js` tidak menjadi `window.db`. Ini tidak error, tidak ada peringatan — `sync.js` cuma dapat `undefined` dan diam-diam mengirim data kosong ke server. Detailnya di [jebakan.md](jebakan.md#1-let-bukan-properti-window).

Solusinya: ekspor eksplisit ke `window` —

```js
// app.js
window.getDB  = () => db;
window.saveDB = save;

// sync.js
const DB = () => (window.getDB ? window.getDB() : window.db);
```

Pakai fungsi, bukan `window.db = db`, karena `db` di-reassign saat reset data. Fungsi selalu membaca nilai terkini.

## 3. Model data

Satu objek, disimpan utuh di `localStorage`:

```js
{
  tx: [
    { id, type: 'in'|'out', amt, cat, note, date: 'YYYY-MM-DD',
      updated: <epoch ms>, deleted?: true }
  ],
  opening: { amount, month: 'YYYY-MM', updated } | null,
  demo?: true
}
```

Tiga keputusan yang perlu dijelaskan:

**`opening` dipisah dari `tx`.** Saldo awal bulan bukan transaksi — dia titik pangkal hitungan, bukan pemasukan. Kalau dimodelkan sebagai transaksi `in`, statistik bulan itu akan terlihat seperti dapat uang 2,5 juta padahal itu cuma saldo pindahan.

**`updated` di setiap record, sejak awal.** Awalnya tidak ada. Ditambahkan saat sync dibangun, dan itu memaksa migrasi data lama. Kalau dari awal setiap record punya `updated`, sync tinggal tempel.

**`deleted: true` alih-alih dibuang.** Kalau record benar-benar dihapus dari array, device lain tidak akan pernah tahu record itu pernah ada — dia akan mengirim versinya lagi, dan transaksi yang sudah dihapus hidup kembali. Tombstone menyelesaikan itu.

## 4. Saldo berjalan antar bulan

Ini bagian paling banyak mikirnya.

Masalahnya: kalau tiap bulan dihitung sendiri-sendiri, saldo tidak nyambung. Kalau semua dijumlah total, lo kehilangan konteks "bulan ini gimana".

Model yang dipakai: **rantai**. Ada satu titik start (`db.opening = {amount, month}`), lalu:

```
openingOf(m) = (m === opening.month) ? opening.amount : closingOf(m - 1)
closingOf(m) = openingOf(m) + monthNet(m)
```

Saldo akhir tiap bulan dihitung berjalan dari titik start. Transaksi sebelum `opening.month` diabaikan — tidak menggeser rantai, karena lo memang bilang "mulai hitung dari sini".

Konsekuensi yang perlu disadari: **backdate menggeser semua bulan sesudahnya.** Tambah transaksi tanggal 5 Oktober → saldo akhir Oktober berubah → saldo awal November ikut berubah → dan seterusnya sampai bulan terakhir. Itu perilaku yang benar, bukan bug — tapi bikin debugging terasa aneh kalau lupa.

Fungsi kuncinya: `openingOf`, `monthNet`, `closingOf`, `openingForDate`, `baseBalance`.

## 5. Sinkronisasi: kenapa perlu server

Ini yang paling sering disalahpahami: **hosting statis tidak menyinkronkan apa pun.**

Taruh app ini di GitHub Pages, buka di dua HP — dua-duanya punya data sendiri-sendiri. Karena `localStorage` itu per-origin **per-device**. Server hosting cuma mengirim file yang sama; dia tidak tahu dan tidak peduli soal isi data lo.

Jadi sync butuh tempat untuk berpapasan. Pilihannya:

| Opsi | Kenapa tidak dipilih |
|---|---|
| Firebase / Supabase | Butuh akun, API key, SDK, dan data lo ada di server orang |
| Google Drive API | OAuth ribet, kuota, dan format file tidak cocok untuk update per-record |
| Server sendiri | **Dipilih** — satu file Python, stdlib saja, sqlite |

Server-nya ± 150 baris. Lihat [sync.md](sync.md) untuk protokol dan desainnya.

## 6. Akses online

Server yang cuma jalan di `127.0.0.1` tidak berguna untuk device lain. Butuh alamat publik.

Dipilih **Cloudflare Tunnel** (`cloudflared`) karena: tanpa akun, tanpa buka port router, otomatis HTTPS, dan binary-nya jalan di aarch64 + musl (sandbox Android ini).

```
cloudflared tunnel --url http://127.0.0.1:8110 --no-autoupdate
```

Hasilnya URL acak seperti `https://ronald-boxes-focused-instant.trycloudflare.com`. Ini **quick tunnel**: gratis, tanpa jaminan uptime, dan URL berganti setiap restart. Untuk pemakaian pribadi jangka pendek, cukup. Untuk permanen, perlu named tunnel (akun Cloudflare) atau VPS.

## 7. Satu server untuk dua pekerjaan

Awalnya dua proses: `python3 -m http.server` untuk file app, dan `sync_server.py` untuk API. Dua port, dua proses, dan CORS jadi masalah karena origin berbeda.

Digabung jadi `server/serve_all.py`: satu proses, satu port, menyajikan file statis **dan** API. Karena origin-nya sama, CORS tidak lagi relevan — meski headernya tetap dipasang supaya app juga bisa dibuka dari `file://` atau origin lain.

## 8. Yang diverifikasi, bukan diasumsikan

Sync diuji dengan dua tab dari **origin berbeda** (`127.0.0.1:8787` dan `:8788`) — itu satu-satunya cara meniru dua device asli, karena `localStorage` dipisah per origin.

Skenario yang diuji dan lolos:

1. Device A punya 10 transaksi → B tarik → dapat 10 ✅
2. B tambah transaksi → A tarik → ikut masuk ✅
3. B hapus transaksi → A tarik → hilang di A ✅
4. Semua di atas diulang lewat HTTPS publik ✅

Tanpa langkah ini, bug `window.db` tidak akan pernah ketahuan — karena secara visual app-nya terlihat baik-baik saja.

---

Baca juga: [jebakan.md](jebakan.md) — daftar hal yang bikin buang waktu, dan [sync.md](sync.md) — desain protokol sinkronisasi.
