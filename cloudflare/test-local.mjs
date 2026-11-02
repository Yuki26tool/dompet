// Uji worker Cloudflare di Node, tanpa jaringan.
// Kontrak yang diuji = kontrak server/serve_all.py (kunci per ruang).
import worker from './src/index.js';
import { store, rooms, makeSelf } from './helper.mjs';

const env = { DB: makeSelf() };

let lulus = 0, gagal = 0;
const GAGALAN = [];

function cek(nama, ok, info) {
  if (ok) { lulus++; console.log('OK    ' + nama); }
  else { gagal++; GAGALAN.push(nama + ' :: ' + (info || '')); console.log('GAGAL ' + nama + (info ? ' :: ' + info : '')); }
}

async function call(path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (opts.key) headers['X-Dompet-Key'] = opts.key;
  const req = new Request('https://x.dev' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await worker.fetch(req, env);
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

const QR = (r, k, extra) =>
  '/api/pull?room=' + encodeURIComponent(r) +
  (k ? '&key=' + encodeURIComponent(k) : '') +
  (extra || '&since=0');

// 1. kesehatan
{
  const r = await call('/api/health');
  cek('health 200', r.status === 200 && r.data && r.data.ok === true, JSON.stringify(r.data));
}

// 2. bikin ruang -> dapat room + key
let ROOM = '', KEY = '';
{
  const r = await call('/api/room', { method: 'POST' });
  ROOM = r.data && r.data.room; KEY = r.data && r.data.key;
  cek('POST /api/room kasih room+key', r.status === 200 && !!ROOM && !!KEY,
      JSON.stringify({ status: r.status, room: ROOM, keyLen: (KEY || '').length }));
  cek('key cukup panjang', (KEY || '').length >= 20, String((KEY || '').length));
}

// 3. key_hash tersimpan sebagai hash, bukan teks asli
{
  const row = rooms.get(ROOM);
  cek('key_hash = sha256, bukan kunci asli',
      !!row && !!row.key_hash && row.key_hash.length === 64 && row.key_hash !== KEY,
      row ? row.key_hash.slice(0, 8) + '…' : 'tak ada');
}

// 4. ruang tak dikenal -> 404
{
  const r = await call(QR('ruang-hantu', KEY));
  cek('ruang tak ada -> 404', r.status === 404, String(r.status));
}

// 5. tanpa kunci -> 403 (ruang ada & berkunci)
{
  const r = await call(QR(ROOM, ''));
  cek('pull tanpa kunci -> 403', r.status === 403, String(r.status));
}

// 6. kunci salah -> 403
{
  const r = await call(QR(ROOM, 'kunci-palsu'));
  cek('pull kunci salah -> 403', r.status === 403, String(r.status));
}

// 7. kunci benar -> 200
{
  const r = await call(QR(ROOM, KEY));
  cek('pull kunci benar -> 200', r.status === 200 && Array.isArray(r.data.records), String(r.status));
}

// 8. kunci boleh lewat query (?key=) — dipakai sync.js
{
  const r = await call(QR(ROOM, KEY));
  cek('kunci lewat query jalan', r.status === 200, String(r.status));
}

// 9. push 2 record
{
  const r = await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST',
    body: { records: [
      { id: 'a1', updated: 1000, body: { id: 'a1', note: 'kopi', amt: 20000 } },
      { id: 'a2', updated: 2000, body: { id: 'a2', note: 'nasi', amt: 30000 } },
    ] },
  });
  cek('push 2 record tersimpan', r.status === 200 && r.data.saved === 2, JSON.stringify(r.data));
}

// 10. pull dapat 2 dengan isi utuh
{
  const r = await call(QR(ROOM, KEY));
  const a1 = r.data.records.find(x => x.id === 'a1');
  cek('pull 2 & isi utuh', r.data.records.length === 2 && a1 && a1.body.note === 'kopi',
      JSON.stringify(a1));
}

// 11. push tanpa kunci ditolak
{
  const r = await call('/api/push?room=' + ROOM, {
    method: 'POST', body: { records: [{ id: 'x', updated: 9999, body: {} }] },
  });
  cek('push tanpa kunci -> 403', r.status === 403, String(r.status));
}

// 12. LWW tolak versi lebih lama
{
  await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST', body: { records: [{ id: 'a1', updated: 500, body: { id: 'a1', note: 'lama' } }] },
  });
  const r = await call(QR(ROOM, KEY));
  const a1 = r.data.records.find(x => x.id === 'a1');
  cek('LWW tolak update lebih lama', a1.body.note === 'kopi', JSON.stringify(a1.body));
}

// 13. LWW terima versi lebih baru
{
  await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST', body: { records: [{ id: 'a1', updated: 3000, body: { id: 'a1', note: 'baru' } }] },
  });
  const r = await call(QR(ROOM, KEY));
  const a1 = r.data.records.find(x => x.id === 'a1');
  cek('LWW terima update lebih baru', a1.body.note === 'baru', JSON.stringify(a1.body));
}

// 14. tombstone tersebar
{
  await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST', body: { records: [{ id: 'a1', updated: 4000, deleted: true, body: { id: 'a1' } }] },
  });
  const r = await call('/api/pull?room=' + ROOM + '&key=' + encodeURIComponent(KEY) + '&since=3999');
  const a1 = r.data.records.find(x => x.id === 'a1');
  cek('tombstone tersebar', a1 && a1.deleted === true, JSON.stringify(a1));
}

// 15. since menyaring
{
  const r = await call('/api/pull?room=' + ROOM + '&key=' + encodeURIComponent(KEY) + '&since=3900');
  cek('since menyaring', r.data.records.length === 1, String(r.data.records.length));
}

// 16. ruang lain terpisah total
let ROOM2 = '', KEY2 = '';
{
  const a = await call('/api/room', { method: 'POST' });
  ROOM2 = a.data.room; KEY2 = a.data.key;
  const r = await call(QR(ROOM2, KEY2));
  cek('ruang terpisah', r.data.records.length === 0, String(r.data.records.length));
}

// 17. kunci ruang A tidak bisa buka ruang B
{
  const r = await call(QR(ROOM2, KEY));
  cek('kunci ruang lain ditolak 403', r.status === 403, String(r.status));
}

// 18. records bukan array ditolak
{
  const r = await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST', body: { records: 'bukan array' },
  });
  cek('records bukan array ditolak 400', r.status === 400, String(r.status));
}

// 19. body rusak ditolak
{
  const req = new Request('https://x.dev/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak',
  });
  const res = await worker.fetch(req, env);
  cek('body rusak ditolak 400', res.status === 400, String(res.status));
}

// 20. tanpa room ditolak
{
  const r = await call('/api/push?key=' + encodeURIComponent(KEY), { method: 'POST', body: { records: [] } });
  cek('tanpa room ditolak 400', r.status === 400, String(r.status));
}

// 21. GET ke push ditolak
{
  const r = await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY));
  cek('GET push ditolak 405', r.status === 405, String(r.status));
}

// 22. rute asing 404
{
  const r = await call('/api/entah');
  cek('rute asing 404', r.status === 404, String(r.status));
}

// 23. opening tersimpan sebagai record __opening__
{
  await call('/api/push?room=' + ROOM + '&key=' + encodeURIComponent(KEY), {
    method: 'POST',
    body: { opening: { amount: 2500000, month: '2026-10', updated: 5000 }, records: [] },
  });
  const p = await call(QR(ROOM, KEY));
  const op = p.data.records.find(x => x.id === '__opening__');
  cek('opening tersimpan', op && op.body && op.body.amount === 2500000, JSON.stringify(op));
}

// 24. OPTIONS preflight 204
{
  const req = new Request('https://x.dev/api/health', { method: 'OPTIONS' });
  const res = await worker.fetch(req, env);
  cek('OPTIONS preflight 204', res.status === 204, String(res.status));
}

// 25. dua ruang tidak bocor satu sama lain
{
  await call('/api/push?room=' + ROOM2 + '&key=' + encodeURIComponent(KEY2), {
    method: 'POST', body: { records: [{ id: 'b1', updated: 7000, body: { id: 'b1', note: 'bensin' } }] },
  });
  const r = await call(QR(ROOM2, KEY2));
  cek('ruang lain dapat record sendiri', r.data.records.length === 1 && r.data.records[0].id === 'b1',
      JSON.stringify(r.data.records.map(x => x.id)));
}

console.log('\nHASIL: ' + lulus + ' lulus, ' + gagal + ' gagal');
if (gagal) { console.log('---'); GAGALAN.forEach(x => console.log('  ' + x)); }
process.exit(gagal ? 1 : 0);
