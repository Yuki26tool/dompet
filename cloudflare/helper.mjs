// D1 palsu untuk menguji worker di Node tanpa Cloudflare.
// Meniru bagian API D1 yang dipakai worker: prepare/bind/run/all/first/batch.
const store = new Map();  // "room\0rid" -> {updated, deleted, body}
const rooms = new Map();  // room -> {created, key_hash}

function makeSelf() {
  return {
    rows: store,
    rooms,
    _args: [],
    _sql: '',
    bind(...args) { this._args = args; return this; },
    async run() {
      const sql = this._sql;
      if (sql.includes('INSERT INTO rooms')) {
        const [room, created, keyHash] = this._args;
        if (rooms.has(room)) throw new Error('UNIQUE constraint failed: rooms.room');
        rooms.set(room, { created, key_hash: keyHash });
        return { success: true, meta: { changes: 1 } };
      }
      if (sql.includes('INSERT INTO records')) {
        const [room, rid, updated, deleted, body] = this._args;
        const k = room + '\u0000' + rid;
        const cur = store.get(k);
        if (!cur || updated > cur.updated) {
          store.set(k, { updated, deleted: deleted ? 1 : 0, body: JSON.parse(body) });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }
      return { success: true, meta: { changes: 0 } };
    },
    async all() {
      const sql = this._sql;
      if (sql.includes('FROM records')) {
        const [room, since] = this._args;
        const out = [];
        for (const [k, r] of store) {
          const [rm, rid] = k.split('\u0000');
          if (rm !== room || r.updated < since) continue;
          out.push({ rid, updated: r.updated, deleted: r.deleted, body: JSON.stringify(r.body) });
        }
        out.sort((a, b) => a.updated - b.updated);
        return { results: out };
      }
      return { results: [] };
    },
    async first() {
      const sql = this._sql;
      if (sql.includes('FROM rooms')) {
        const [room] = this._args;
        const r = rooms.get(room);
        return r ? { room, created: r.created, key_hash: r.key_hash } : null;
      }
      return null;
    },
    prepare(sql) {
      const s = makeSelf();
      s._sql = sql;
      return s;
    },
    async batch(stmts) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}

export { store, rooms, makeSelf };
