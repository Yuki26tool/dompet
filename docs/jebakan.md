# Jebakan yang bikin buang waktu

Daftar ini bukan teori. Semuanya benar-benar kejadian di proyek ini, dan sebagian besar **tidak memunculkan error** — cuma bikin hasilnya salah diam-diam.

## 1. `let` bukan properti `window`

**Gejala:** sync jalan, status "Tersambung", tidak ada error di console. Tapi data di server selalu kosong.

**Sebab:**

```js
// app.js
let db = load();        // ← let, bukan var
```

Variabel `let` dan `const` di top-level **tidak** menjadi properti `window`. Padahal file lain:

```js
// sync.js
const tx = window.db && window.db.tx;   // → selalu undefined
```

Nggak error, nggak warning. Cuma `undefined`, lalu `|| []` menyelamatkan semuanya — jadi yang dikirim ke server adalah array kosong yang terlihat sah.

**Perbaikan:**

```js
window.getDB  = () => db;
window.saveDB = save;
```

Pakai fungsi, bukan salinan nilai, karena `db` bisa di-reassign.

**Aturan umum:** setiap variabel yang dibutuhkan file JS lain harus diekspor eksplisit ke `window`. `var` kebetulan bekerja karena `var` menempel ke `window`, tapi jangan bergantung pada itu.

---

## 2. Nama field yang tidak konsisten

**Gejala:** hapus transaksi di HP A, tetap muncul di HP B.

**Sebab:** skema sync memakai `updated`, tapi fungsi hapus menulis `upd`:

```js
rec.deleted = true;
rec.upd = Date.now();     // ← salah
```

Akibatnya record punya `updated` lama (waktu dibuat) + tombstone. Device lain membandingkan: `updated` lama itu ≤ versi yang mereka punya → tombstone diabaikan → transaksi tidak terhapus.

**Pelajaran:** tidak ada type checker yang menangkap ini. Yang menangkap cuma pengujian skenario hapus lintas device. Kalau menguji tambah dan ubah tapi tidak menghapus, bug ini lolos.

---

## 3. `minis://` di-cache

File yang dibuka lewat `minis://` disimpan di cache. Edit CSS atau JS, refresh — tidak ada perubahan. Tidak ada pesan apa pun.

**Solusi:** bump query versi di `index.html` setiap kali mengubah aset.

```html
<link rel="stylesheet" href="style.css?v=23">
<script src="sync.js?v=23"></script>
<script src="app.js?v=23"></script>
```

Naikkan angkanya, jangan diandalkan pada cache-busting otomatis (tidak ada).

---

## 4. Service worker tidak pernah terdaftar di `minis://`

`navigator.serviceWorker` bernilai `undefined` di scheme `minis://`. Service worker hanya bisa didaftarkan pada `http:` atau `https:`.

Jadi kalau mau menguji offline/PWA, harus lewat server HTTP lokal. Kode pendaftarannya perlu di-guard:

```js
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
```

---

## 5. Chromium sandbox salah paint

Ini yang paling menyita waktu, karena **kodenya benar** — `getBoundingClientRect` mengembalikan posisi yang tepat — tapi layarnya kosong atau bergaris-garis.

Pemicu yang terbukti:

- `animation` yang memakai `transform` pada container (`.view`, `.list`, baris list) → isi list tidak ter-paint, muncul gap visual padahal layout benar
- `filter: blur()` pada ancestor (`.app.sheet-open { filter: blur() }`) → **sheet modal sama sekali tidak terlihat**, meski ada di DOM dan posisinya benar
- `backdrop-filter: blur()` pada nav, backdrop, kartu hero
- `transition: transform` pada sheet bawah

**Aturan untuk environment ini:** hindari `transform` di animasi dan hindari `filter`/`backdrop-filter` untuk efek visual. Pakai `opacity` dan `background` sebagai gantinya.

**Cara mendiagnosis:** kalau `getBoundingClientRect` menunjukkan elemen ada di tempat yang benar tapi screenshot kosong, itu bug compositor — bukan bug kode. Jangan kejar-kejar CSS.

**Catatan tambahan:** tab browser yang sudah lama terbuka menyimpan frame basi. Selalu buka tab baru (`new_tab`) setelah perubahan besar, jangan cuma refresh.

---

## 6. Chrome meng-cache file di `minis://` per sesi

Berkaitan dengan poin 3. Setelah edit, kadang perlu membuka tab baru alih-alih reload — reload masih menyajikan frame dan file lama.

---

## 7. Jangan mengandalkan `ping`

Di sandbox PRoot ini ICMP diblokir. `ping` akan menggantung sampai timeout, bukan menampilkan "unreachable". Untuk menguji konektivitas, pakai `curl` dengan `-m` (timeout).

---

## 8. File besar bisa terpotong saat ditulis

Menulis file lewat tool bisa menghasilkan file yang isinya cuma penanda, bukan isi sebenarnya. Pernah kejadian pada `sync_server.py` — file-nya jadi 268 byte, syntax error, dan harus ditulis ulang.

**Selalu cek ukuran setelah menulis file besar:**

```sh
wc -c namafile
```

---

## 9. `minis-mcp-cli` tidak membaca `--input` dari file

Argumen `--input` menerima **string JSON langsung**, bukan path file. Dan JSON posisional (tanpa `--input`) menghasilkan `PARSE_ERROR`.

Yang benar:

```sh
minis-mcp-cli call github create_or_update_file \
  --input '{"owner":"...","repo":"...", ...}'
```

Yang salah:

```sh
minis-mcp-cli call github create_or_update_file /tmp/payload.json
```

---

## 10. `new Function()` untuk mendeteksi parse error

Kalau seluruh app menampilkan layar kosong dengan saldo Rp 0, kemungkinan besar `app.js` gagal parse — misalnya karena `const` dobel, atau tanda kurung tidak seimbang. Browser diam saja; tidak ada pesan.

Cara cepat memastikan, di console:

```js
try { new Function(fetch('app.js').then(r => r.text())) } catch (e) { e.message }
```

Atau lebih ringkas, periksa langsung:

```js
new Function(kodeAppJsSebagaiString);   // melempar SyntaxError kalau rusak
```

Dan yang terakhir, paling sering lolos dari pemeriksaan manual: **cek keseimbangan kurung saja tidak cukup.** Pernah kejadian di mana kurung seimbang sempurna tapi ada `const amt` dideklarasikan dua kali di scope yang sama — parse gagal total.
