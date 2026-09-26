#!/usr/bin/env bash
# Tunnel untuk receiver notifikasi DOKU (jalankan di terminal interaktif).
#
# Pemakaian:
#   bash scripts/tunnel-receiver.sh            # localhost.run (tanpa akun)
#   bash scripts/tunnel-receiver.sh serveo     # alternatif serveo.net
#
# Reconnect otomatis bila koneksi putus. Ctrl-C untuk berhenti.
# URL https://… akan tercetak di layar — masukkan ke:
#   DOKU Back Office → Settings → Payment Settings → Virtual Account SNAP → CONFIGURE → Notification URL

set -u
PORT="${PORT:-4571}"
PROVIDER="${1:-localhost.run}"

echo "🔗 Tunnel $PROVIDER → localhost:$PORT (Ctrl-C untuk berhenti)"
while true; do
  case "$PROVIDER" in
    serveo)
      ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
          -o ExitOnForwardFailure=yes -R 80:localhost:"$PORT" serveo.net
      ;;
    *)
      ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
          -o ExitOnForwardFailure=yes -R 80:localhost:"$PORT" nokey@localhost.run
      ;;
  esac
  code=$?
  [ "$code" -eq 0 ] && exit 0          # keluar normal (Ctrl-C)
  echo "⚠️  tunnel terputus (exit $code) — menyambung ulang dalam 3 detik…"
  sleep 3
done
