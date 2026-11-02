#!/usr/bin/env python3
"""Dompet sync server - per-record last-write-wins, stdlib only."""
import json, os, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", "8099"))
DBP = os.environ.get("DOMPET_DB", "/var/minis/shared/dompet/sync.db")
os.makedirs(os.path.dirname(DBP), exist_ok=True)

def conn():
    c = sqlite3.connect(DBP, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS recs(
        room TEXT NOT NULL, rid TEXT NOT NULL, body TEXT NOT NULL,
        upd REAL NOT NULL, PRIMARY KEY(room, rid))""")
    c.execute("""CREATE TABLE IF NOT EXISTS rooms(
        room TEXT PRIMARY KEY, created REAL NOT NULL)""")
    return c

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
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/health":
            return self._send(200, {"ok": True, "t": int(time.time())})
        if u.path != "/api/pull":
            return self._send(404, {"error": "not found"})
        room = (q.get("room") or [""])[0].strip()
        if not room:
            return self._send(400, {"error": "room required"})
        try:
            since = float((q.get("since") or ["0"])[0])
        except ValueError:
            since = 0.0
        c = conn()
        try:
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
            out.append({"id": rid, "updated": upd})
            # merge body fields on top
            out[-1].update(b)
            out[-1]["id"] = rid
            out[-1]["updated"] = upd
        return self._send(200, {"records": out, "now": time.time()})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/room":
            room = secrets.token_urlsafe(12)
            c = conn()
            try:
                c.execute("INSERT OR IGNORE INTO rooms(room,created) VALUES(?,?)",
                          (room, time.time()))
                c.commit()
            finally:
                c.close()
            return self._send(200, {"room": room})

        if u.path != "/api/push":
            return self._send(404, {"error": "not found"})

        room = (q.get("room") or [""])[0].strip()
        if not room:
            return self._send(400, {"error": "room required"})

        n = int(self.headers.get("Content-Length") or 0)
        if n > 8_000_000:
            return self._send(413, {"error": "too large"})
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._send(400, {"error": "bad json"})

        recs = payload.get("records") or []
        opening = payload.get("opening")
        now = time.time()
        items = []

        for r in recs:
            rid = str(r.get("id") or "").strip()
            if not rid:
                continue
            upd = float(r.get("updated") or now)
            items.append((rid, r, upd))

        if isinstance(opening, dict):
            oupd = float(opening.get("updated") or now)
            items.append(("__opening__", opening, oupd))

        c = conn()
        try:
            c.execute("INSERT OR IGNORE INTO rooms(room,created) VALUES(?,?)",
                      (room, now))
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
    print(f"dompet sync on :{PORT} db={DBP}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
