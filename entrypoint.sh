#!/bin/bash
exec > /proc/1/fd/1 2>&1
echo "=== MEMPERSIAPKAN TMATE SSH UNTUK PAPA KADO ==="

mkdir -p /root/.ssh
if [ ! -f /root/.ssh/id_rsa ]; then
    ssh-keygen -q -t rsa -N '' -f /root/.ssh/id_rsa
fi

SOCKET="/tmp/tmate.sock"
rm -f "$SOCKET"
tmate -S "$SOCKET" -F new-session -d
tmate -S "$SOCKET" wait for-connection

SSH_CMD=$(tmate -S "$SOCKET" display -p '#{tmate_ssh}')
echo ""
echo "=========================================================="
echo "          🎉 KONEKSI SSH TERMIUS PAPA KADO 🎉             "
echo "=========================================================="
echo "COMMAND: $SSH_CMD"
echo "=========================================================="
echo ""

while true; do
    echo "[VM ONLINE] $SSH_CMD"
    sleep 30
done
