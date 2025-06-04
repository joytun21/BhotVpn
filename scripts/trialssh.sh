#!/bin/bash

# === Konfigurasi Awal ===
user="trial$(openssl rand -hex 2 | head -c 4)"
password="$user"
duration=60 # dalam menit
expiration=$(date -d "+$duration minutes" +"%Y-%m-%d %H:%M:%S")
domain=$(cat /etc/xray/domain 2>/dev/null || hostname -f)
ip=$(wget -qO- ipv4.icanhazip.com)
ns_domain=$(cat /etc/xray/dns 2>/dev/null || echo "NS domain not set")
public_key=$(cat /etc/slowdns/server.pub 2>/dev/null || echo "Public key not available")
city=$(cat /etc/xray/city 2>/dev/null || echo "Unknown city")

# === Buat akun SSH trial ===
useradd -e $(date -d "+$duration minutes" +"%Y-%m-%d") -s /bin/false -M $user
echo "$user:$password" | chpasswd

# === (Opsional) Auto hapus pakai tmux setelah expired ===
tmux new-session -d -s "trial_ssh_$user" "sleep $((duration * 60)); userdel $user"

# === Output JSON Bot Format ===
echo "{
  \"status\": \"success\",
  \"username\": \"$user\",
  \"password\": \"$password\",
  \"ip\": \"$ip\",
  \"domain\": \"$domain\",
  \"city\": \"$city\",
  \"ns_domain\": \"$ns_domain\",
  \"public_key\": \"$public_key\",
  \"expiration\": \"$expiration\",
  \"ports\": {
    \"openssh\": \"22, 80, 443\",
    \"udp_ssh\": \"1-65535\",
    \"dns\": \"443, 53, 22\",
    \"dropbear\": \"443, 109\",
    \"ssh_ws\": \"80, 8080\",
    \"ssh_ssl_ws\": \"443\",
    \"ssl_tls\": \"443\",
    \"ovpn_ssl\": \"443\",
    \"ovpn_tcp\": \"1194\",
    \"ovpn_udp\": \"2200\",
    \"badvpn\": \"7100, 7300, 7300\"
  },
  \"openvpn_link\": \"https://$domain:81/allovpn.zip\",
  \"save_link\": \"https://$domain:81/ssh-$user.txt\",
  \"wss_payload\": \"GET wss://BUG.COM/ HTTP/1.1[crlf]Host: $domain[crlf]Upgrade: websocket[crlf][crlf]\"
}"