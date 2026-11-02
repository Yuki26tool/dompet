#!/bin/sh
# Salin app (bukan server) ke cloudflare/public supaya ikut ter-deploy
# sebagai static assets worker. Jalankan sebelum `wrangler deploy`.
set -e
cd "$(dirname "$0")/.."
rm -rf cloudflare/public
mkdir -p cloudflare/public
cp index.html app.js sync.js style.css manifest.json sw.js \
   icon-192.png icon-512.png icon-mask.png cloudflare/public/
# font judul (opsional, kalau ada)
for f in pricedown.woff2 pricedown.ttf; do
  [ -f "$f" ] && cp "$f" cloudflare/public/ || true
done
echo "cloudflare/public: $(ls cloudflare/public | wc -l) file"
