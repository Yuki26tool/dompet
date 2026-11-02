/* Dompet — sinkronisasi antar device.
   Model: setiap transaksi punya `updated` (epoch ms). Server menyimpan
   record per id; yang menang adalah `updated` terbesar. Hapus = tombstone
   {deleted:true}. Opening balance juga record dengan id "__opening__". */
(function () {
  const KEY = 'dompet.sync.v1';
  const OPENING_ID = '__opening__';

  let cfg = { url: '', room: '', last: 0, on: false };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}

  let busy = false;
  let timer = null;
  let state = 'off';

  const saveCfg = () => localStorage.setItem(KEY, JSON.stringify(cfg));
  const base = () => (cfg.url || '').replace(/\/+$/, '');
  const active = () => !!(cfg.on && cfg.url && cfg.room);

  function setState(s) {
    state = s;
    const dot = document.getElementById('syncDot');
    if (dot) {
      dot.dataset.state = s;
      dot.title = s === 'ok' ? 'Tersinkron' : s === 'err' ? 'Gagal sinkron' : 'Belum tersinkron';
    }
    const el = document.getElementById('syncState');
    if (el) {
      el.textContent =
        s === 'ok' ? 'Tersambung — ' + cfg.room :
        s === 'err' ? 'Gagal menyambung ke server' :
        s === 'wait' ? 'Menyinkronkan…' :
        active() ? 'Menunggu sinkron' : 'Belum tersambung — data cuma di HP ini';
    }
    if (window.updateSyncUI) window.updateSyncUI();
  }

  /* Semua record lokal dalam bentuk {id, updated, ...body}. */
  const DB = () => (window.getDB ? window.getDB() : window.db);

  function collectLocal() {
    const out = [];
    const d = DB() || {};
    const tx = Array.isArray(d.tx) ? d.tx : [];
    for (const t of tx) {
      out.push({ id: t.id, updated: t.updated || 0, deleted: !!t.deleted, body: t });
    }
    const op = d.opening;
    if (op) out.push({ id: OPENING_ID, updated: op.updated || 0, deleted: false, body: op });
    return out;
  }

  const stripMeta = (b) => {
    const c = Object.assign({}, b);
    delete c.updated;
    delete c.deleted;
    return c;
  };

  /* Gabungkan record server ke state lokal. Menang: updated terbesar. */
  function merge(records) {
    if (!Array.isArray(records)) return 0;
    const d = DB();
    if (!d) return 0;
    if (!Array.isArray(d.tx)) d.tx = [];
    const byId = new Map(d.tx.map((t) => [t.id, t]));
    let changed = 0;

    for (const r of records) {
      const upd = r.updated || 0;
      if (r.id === OPENING_ID) {
        const cur = d.opening ? d.opening.updated || 0 : -1;
        if (upd > cur) {
          d.opening = Object.assign(stripMeta(r.body || r), { updated: upd });
          changed++;
        }
        continue;
      }
      const cur = byId.get(r.id);
      const curUpd = cur ? cur.updated || 0 : -1;
      if (upd <= curUpd) continue;
      if (r.deleted) {
        if (cur) { d.tx = d.tx.filter((t) => t.id !== r.id); byId.delete(r.id); changed++; }
      } else {
        const rec = Object.assign(stripMeta(r.body || r), { id: r.id, updated: upd });
        if (cur) Object.assign(cur, rec);
        else { d.tx.push(rec); byId.set(rec.id, rec); }
        changed++;
      }
    }
    if (changed) {
      if (window.saveDB) window.saveDB();
      if (window.renderAll) window.renderAll();
    }
    return changed;
  }

  async function push() {
    const res = await fetch(base() + '/api/push?room=' + encodeURIComponent(cfg.room), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: collectLocal(),
        opening: null,
        client: cfg.last,
      }),
    });
    if (!res.ok) throw new Error('push ' + res.status);
    return res.json();
  }

  async function pull() {
    const res = await fetch(
      base() + '/api/pull?room=' + encodeURIComponent(cfg.room) + '&since=' + (cfg.last || 0)
    );
    if (!res.ok) throw new Error('pull ' + res.status);
    const data = await res.json();
    merge(data.records || []);
    if (data.now) { cfg.last = data.now; saveCfg(); }
    return data;
  }

  async function round(silent) {
    if (!active() || busy) return;
    busy = true;
    setState('wait');
    try {
      await push();
      await pull();
      setState('ok');
    } catch (e) {
      setState('err');
      if (!silent) console.warn('[sync]', e.message);
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => round(true), 15000);
    round(true);
  }

  window.SYNC = {
    cfg,
    status() {
      return {
        on: !!cfg.on,
        connected: state === 'ok',
        room: cfg.room || '',
        server: cfg.url || '',
        text:
          state === 'ok' ? 'Tersambung — ' + cfg.room :
          state === 'err' ? 'Gagal menyambung ke server' :
          active() ? 'Menunggu sinkron' : 'Belum tersambung — data cuma di HP ini',
      };
    },
    set(url, room) {
      cfg.url = (url || '').trim();
      cfg.room = (room || '').trim();
      cfg.on = !!(cfg.url && cfg.room);
      cfg.last = 0;
      saveCfg();
      if (cfg.on) start(); else { if (timer) clearInterval(timer); timer = null; setState('off'); }
      return cfg;
    },
    off() {
      cfg.on = false;
      saveCfg();
      if (timer) clearInterval(timer);
      timer = null;
      setState('off');
    },
    touch() {
      if (!active() || busy) return;
      clearTimeout(window.__syncT);
      window.__syncT = setTimeout(() => round(true), 1200);
    },
    pullNow() { return round(false); },
    start,
  };

  if (active()) start();
})();
