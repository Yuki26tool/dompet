#!/bin/sh
# Dompet — nyalakan app + sync server + tunnel publik.
# Pakai:  sh online.sh          (nyalakan)
#         sh online.sh stop     (matikan)
# Direktori repo = folder tempat skrip ini berada (bisa di-override via env)
DIR="${DOMPET_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
PORT="${PORT:-8110}"
LOG="${DOMPET_LOG:-/tmp/dompet-online.log}"

stop() {
  pkill -f 'serve_all.py' 2>/dev/null
  pkill -f 'cloudflared tunnel' 2>/dev/null
  echo "dimatikan."
}

case "$1" in
  stop) stop; exit 0 ;;
  url)
    grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1
    exit 0 ;;
esac

stop
sleep 1
: > "$LOG"

DOMPET_ROOT="$DIR" PORT="$PORT" python3 "$DIR/server/serve_all.py" >> "$LOG" 2>&1 &
sleep 2

nohup /usr/local/bin/cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >> "$LOG" 2>&1 &

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 2
done

if [ -n "$URL" ]; then
  echo "online di: $URL"
  echo "kode ruang dipakai bareng di semua HP (bebas lo tentukan)."
else
  echo "tunnel gagal — cek $LOG"
fi
