#!/usr/bin/env python3
"""Dompet — satu server: sajikan file app (statis) + API sync.
stdlib only. PORT=8099, root app = folder induk, db = /var/minis/shared/dompet/sync.db
"""
import hashlib
import hmac
import json, os, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

PORT = int(os.environ.get("PORT", "8099"))
DBP = os.environ.get("DOMPET_DB", "/var/minis/shared/dompet/sync.db")
ROOT = os.path.abspath(os.environ.get(
    "DOMPET_ROOT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
os.makedirs(os.path.dirname(DBP), exist_ok=True)

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


def conn():
    c = sqlite3.connect(DBP, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS recs(
        room TEXT NOT NULL, rid TEXT NOT NULL, body TEXT NOT NULL,
        upd REAL NOT NULL, PRIMARY KEY(room, rid))""")
    c.execute("""CREATE TABLE IF NOT EXISTS rooms(
        room TEXT PRIMARY KEY, created REAL NOT NULL)""")
    # migrasi: ruang lama tidak punya kolom kunci
    try:
        c.execute("ALTER TABLE rooms ADD COLUMN key_hash TEXT")
    except sqlite3.OperationalError:
        pass
    return c


def _hash_key(key):
    return hashlib.sha256(key.encode()).hexdigest()


def _check_key(c, room, key):
    """True kalau ruang boleh diakses dengan kunci ini.
    Ruang lama (key_hash NULL) tetap bisa diakses tanpa kunci."""
    row = c.execute("SELECT key_hash FROM rooms WHERE room=?", (room,)).fetchone()
    if not row:
        return None  # ruang tidak ada
    kh = row[0]
    if not kh:
        return True  # legacy: tanpa kunci
    if not key:
        return False
    return hmac.compare_digest(kh, _hash_key(key))


def now_ms():
    return int(time.time() * 1000)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _static(self, path):
        rel = unquote(path.lstrip("/")) or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        full = os.path.abspath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT + os.sep) and full != ROOT:
            return self._send(403, {"error": "forbidden"})
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        if not os.path.isfile(full):
            return self._send(404, {"error": "not found"})
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # app shell jangan di-cache biar update kebaca; aset ber-versi boleh cache
        if ext == ".html":
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=60")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if not u.path.startswith("/api/"):
            return self._static(u.path)
        if u.path == "/api/health":
            return self._send(200, {"ok": True, "t": int(time.time())})
        if u.path != "/api/pull":
            return self._send(404, {"error": "not found"})
        room = (q.get("room") or [""])[0].strip()
        key = (q.get("key") or [""])[0]
        if not room:
            return self._send(400, {"error": "room required"})
        try:
            since = float((q.get("since") or ["0"])[0])
        except ValueError:
            since = 0.0
        c = conn()
        try:
            ok = _check_key(c, room, key)
            if ok is None:
                return self._send(404, {"error": "room not found"})
            if not ok:
                return self._send(403, {"error": "bad key"})
            rows = c.execute(
                "SELECT rid, body, upd FROM recs WHERE room=? AND upd>? ORDER BY upd",
                (room, since)).fetchall()
        finally:
            c.close()
        out = []
        for rid, body, upd in rows:
            try:
                b = json.loads(body)
            except Exception:
                continue
            item = {"id": rid, "updated": upd}
            item.update(b)
            item["id"] = rid
            item["updated"] = upd
            out.append(item)
        return self._send(200, {"records": out, "now": now_ms()})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/room":
            # Buat ruang baru + kunci acak. Kunci dikembalikan SEKALI di sini —
            # catat & bagikan ke anggota keluarga lewat jalur aman.
            c = conn()
            try:
                for _ in range(5):
                    room = secrets.token_urlsafe(9)
                    key = secrets.token_urlsafe(24)
                    cur = c.execute(
                        "INSERT OR IGNORE INTO rooms(room,created,key_hash) VALUES(?,?,?)",
                        (room, time.time(), _hash_key(key)))
                    if cur.rowcount:
                        break
                else:
                    return self._send(500, {"error": "try again"})
                c.commit()
            finally:
                c.close()
            return self._send(200, {"room": room, "key": key})

        if u.path != "/api/push":
            return self._send(404, {"error": "not found"})

        room = (q.get("room") or [""])[0].strip()
        key = (q.get("key") or [""])[0]
        if not room:
            return self._send(400, {"error": "room required"})

        n = int(self.headers.get("Content-Length") or 0)
        if n > 8_000_000:
            return self._send(413, {"error": "too large"})
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._send(400, {"error": "bad json"})

        c = conn()
        try:
            ok = _check_key(c, room, key)
            if ok is None:
                return self._send(404, {"error": "room not found"})
            if not ok:
                return self._send(403, {"error": "bad key"})
        finally:
            c.close()

        recs = payload.get("records") or []
        opening = payload.get("opening")
        now = now_ms()
        items = []

        for r in recs:
            rid = str(r.get("id") or "").strip()
            if not rid:
                continue
            items.append((rid, r, float(r.get("updated") or now)))

        if isinstance(opening, dict):
            items.append(("__opening__", opening, float(opening.get("updated") or now)))

        c = conn()
        try:
            for rid, body, upd in items:
                cur = c.execute("SELECT upd FROM recs WHERE room=? AND rid=?",
                                (room, rid)).fetchone()
                if cur and cur[0] >= upd:
                    continue
                c.execute(
                    "INSERT INTO recs(room,rid,body,upd) VALUES(?,?,?,?) "
                    "ON CONFLICT(room,rid) DO UPDATE SET body=excluded.body, upd=excluded.upd",
                    (room, rid, json.dumps(body, ensure_ascii=False), upd))
            c.commit()
        finally:
            c.close()

        return self._send(200, {"ok": True, "saved": len(items), "now": now})


if __name__ == "__main__":
    print(f"dompet on :{PORT} root={ROOT} db={DBP}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
