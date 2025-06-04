#!/bin/bash

# === Konfigurasi Awal ===
user="trial$(openssl rand -hex 2 | head -c 4)"
uuid=$(cat /proc/sys/kernel/random/uuid)
domain=$(cat /etc/xray/domain 2>/dev/null || hostname -f)
ns_domain=$(cat /etc/xray/dns 2>/dev/null || echo "NS domain not set")
city=$(cat /etc/xray/city 2>/dev/null || echo "Unknown")
pubkey=$(cat /etc/slowdns/server.pub 2>/dev/null || echo "Not Available")
ip=$(curl -s ipv4.icanhazip.com)
duration=60 # minutes
exp=$(date -d "+$duration minutes" +"%Y-%m-%d %H:%M:%S")

# === Inject ke config (pastikan struktur sesuai config kamu)
if [ ! -f "/etc/xray/trojan/config.json" ]; then
    echo '{"inbounds":[]}' > /etc/xray/trojan/config.json
fi

# Inject user (pakai #trojan dan #trojangrpc tag)
sed -i '/#trojan$/a\### '"$user $exp"'\
},{"password": "'"$uuid"'","email": "'"$user"'"' /etc/xray/trojan/config.json
sed -i '/#trojangrpc$/a\### '"$user $exp"'\
},{"password": "'"$uuid"'","email": "'"$user"'"' /etc/xray/trojan/config.json

# Auto-hapus akun pakai tmux
tmux new-session -d -s "trial_trojan_$user" "sleep $((duration * 60)); sed -i '/$user/d' /etc/xray/trojan/config.json; systemctl restart trojan@config"

# Restart service biar aktif
systemctl restart trojan@config

# === Buat Link Format
trojan_tls="trojan://${uuid}@${domain}:443?path=/trojan-ws&security=tls&host=${domain}&type=ws&sni=${domain}#${user}-WS-TLS"
trojan_grpc="trojan://${uuid}@${domain}:443?mode=gun&security=tls&type=grpc&serviceName=trojan-grpc&sni=${domain}#${user}-gRPC"

# === Output JSON ke bot
echo "{
  \"status\": \"success\",
  \"username\": \"$user\",
  \"uuid\": \"$uuid\",
  \"ip\": \"$ip\",
  \"domain\": \"$domain\",
  \"ns_domain\": \"$ns_domain\",
  \"city\": \"$city\",
  \"public_key\": \"$pubkey\",
  \"expiration\": \"$exp\",
  \"protocol\": \"trojan\",
  \"link_tls\": \"$trojan_tls\",
  \"link_grpc\": \"$trojan_grpc\",
  \"port_tls\": \"443\",
  \"port_http\": \"80, 8080\",
  \"dns_port\": \"443, 53\",
  \"grpc_port\": \"443\",
  \"path\": \"/trojan-ws\",
  \"service_name\": \"trojan-grpc\"
}"