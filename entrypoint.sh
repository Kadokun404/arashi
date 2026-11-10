#!/bin/bash

# Matikan exit on error agar tidak crash
set +e

echo "=== MEMPERSIAPKAN TMATE SSH UNTUK PAPA KADO ==="

# Pastikan tmate terinstall
if ! command -v tmate >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y tmate openssh-client curl
fi

# Setup SSH key jika belum ada
mkdir -p /root/.ssh
if [ ! -f /root/.ssh/id_rsa ]; then
    ssh-keygen -q -t rsa -N '' -f /root/.ssh/id_rsa
fi

# Jalankan tmate session
SOCKET="/tmp/tmate.sock"
rm -f "$SOCKET"
tmate -S "$SOCKET" new-session -d
tmate -S "$SOCKET" wait for-connection

echo ""
echo "=========================================================="
echo "          🎉 KONEKSI SSH TERMIUS PAPA KADO 🎉             "
echo "=========================================================="
echo ""
SSH_CMD=$(tmate -S "$SOCKET" display -p '#{tmate_ssh}')
echo "COMMAND LENGKAP: $SSH_CMD"
echo ""
echo "ATAU MASUKKAN KE TERMIUS:"
echo "Host     : $(echo "$SSH_CMD" | sed -E 's/.*@([^ ]+)/\1/')"
echo "User     : $(echo "$SSH_CMD" | sed -E 's/ssh ([^@]+)@.*/\1/')"
echo "Port     : 22"
echo "Password : (KOSONGKAN SAJA)"
echo ""
echo "=========================================================="
echo ""

# Loop tetap hidup agar VM tidak mati
while true; do
    sleep 60
    echo "[VM AKTIF] Sesi SSH Termius tetap online..."
done
