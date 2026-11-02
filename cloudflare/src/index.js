// Dompet sync worker — Cloudflare Workers + D1
// Kontrak sama persis dengan server/serve_all.py:
//   POST /api/room                      -> {room, key}   (kunci dikembalikan SEKALI)
//   POST /api/push?room=R&key=K         body {records:[...], opening:{...}|null}
//   GET  /api/pull?room=R&since=MS&key=K
//   GET  /api/health
// Kunci per ruang, disimpan sebagai SHA-256 hex di rooms.key_hash.
// Kunci boleh lewat header X-Dompet-Key atau query ?key=

const OPN = '__opening__';
const DAYS_EMPTY = 90; // ruang tanpa record & lebih tua dari ini boleh dibuang manual

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Dompet-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function sameStr(a, b) {
  const x = String(a == null ? '' : a), y = String(b == null ? '' : b);
  if (!y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randToken(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function givenKey(req) {
  return req.headers.get('X-Dompet-Key') || new URL(req.url).searchParams.get('key') || '';
}

/* Cek akses ruang.
   return {status:200} boleh, {status:404} ruang tak ada, {status:403} kunci salah. */
async function checkRoom(env, room, key) {
  const row = await env.DB.prepare('SELECT key_hash FROM rooms WHERE room = ?')
    .bind(room).first();
  if (!row) return { code: 404 };
  const kh = row.key_hash;
  if (!kh) return { code: 200 };            // ruang lama tanpa kunci
  if (!key) return { code: 403 };
  const h = await sha256hex(key);
  return { code: sameStr(h, kh) ? 200 : 403 };
}

async function upsert(env, room, rows) {
  const stmts = rows.map(r =>
    env.DB.prepare(
      `INSERT INTO records (room, rid, updated, deleted, body)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room, rid) DO UPDATE SET
         updated = excluded.updated,
         deleted = excluded.deleted,
         body    = excluded.body
       WHERE excluded.updated > records.updated`
    ).bind(room, r.id, r.updated, r.deleted ? 1 : 0, JSON.stringify(r.body))
  );
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/api/health') return json({ ok: true, t: Date.now() });

    /* --- bikin ruang baru + kunci acak, dikembalikan sekali --- */
    if (path === '/api/room') {
      if (req.method !== 'POST') return json({ error: 'pakai POST' }, 405);
      for (let i = 0; i < 5; i++) {
        const room = randToken(7);                       // ~10 char, ramah diketik
        const key = randToken(18);                       // ~24 char
        try {
          await env.DB.prepare(
            'INSERT INTO rooms (room, created, key_hash) VALUES (?, ?, ?)'
          ).bind(room, Date.now(), await sha256hex(key)).run();
          return json({ room, key });
        } catch (e) {
          if (i === 4) return json({ error: 'coba lagi' }, 500); // tabrakan nama
        }
      }
    }

    if (path !== '/api/push' && path !== '/api/pull') return json({ error: 'rute tak dikenal' }, 404);

    const room = (url.searchParams.get('room') || '').trim();
    if (!room) return json({ error: 'room kosong' }, 400);
    if (room.length > 64) return json({ error: 'room terlalu panjang' }, 400);

    const gate = await checkRoom(env, room, givenKey(req));
    if (gate.code === 404) return json({ error: 'ruang tak ada' }, 404);
    if (gate.code === 403) return json({ error: 'bad key' }, 403);

    if (path === '/api/push') {
      if (req.method !== 'POST') return json({ error: 'pakai POST' }, 405);
      let p;
      try { p = await req.json(); } catch (e) { return json({ error: 'body bukan JSON' }, 400); }
      if (!p || !Array.isArray(p.records)) return json({ error: 'records harus array' }, 400);

      const rows = [];
      const now = Date.now();
      for (const r of p.records) {
        if (!r || !r.id) continue;
        rows.push({
          id: String(r.id).slice(0, 80),
          updated: Number(r.updated) || now,
          deleted: !!r.deleted,
          body: r.body !== undefined ? r.body : r,
        });
      }
      if (p.opening && typeof p.opening === 'object') {
        rows.push({
          id: OPN,
          updated: Number(p.opening.updated) || now,
          deleted: !!p.opening.deleted,
          body: p.opening,
        });
      }
      const saved = await upsert(env, room, rows);
      return json({ ok: true, saved, now });
    }

    // pull
    if (req.method !== 'GET') return json({ error: 'pakai GET' }, 405);
    let since = Number(url.searchParams.get('since') || 0);
    if (!isFinite(since) || since < 0) since = 0;

    // Pakai >= bukan > : beberapa record bisa punya `updated` yang sama persis
    // (dua device menyimpan di milidetik yang sama). Dengan `>` record yang
    // timestamp-nya sama dengan cursor akan terlewat selamanya.
    const res = await env.DB.prepare(
      `SELECT rid, updated, deleted, body FROM records
       WHERE room = ? AND updated >= ? ORDER BY updated ASC LIMIT 5000`
    ).bind(room, since).all();

    const list = (res.results || []).map(row => {
      let body = {};
      try { body = row.body ? JSON.parse(row.body) : {}; } catch (e) { body = {}; }
      return { id: row.rid, updated: row.updated, deleted: !!row.deleted, body };
    });
    return json({ records: list, now: Date.now() });
  },
};
