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

# === Auto-delete user setelah expired ===
tmux new-session -d -s "trial_ssh_$user" "sleep $((duration * 60)); userdel $user"

# === Cetak JSON satu baris valid untuk bot Telegram ===
echo -n '{'
echo -n "\"status\":\"success\","
echo -n "\"username\":\"$user\","
echo -n "\"password\":\"$password\","
echo -n "\"ip\":\"$ip\","
echo -n "\"domain\":\"$domain\","
echo -n "\"city\":\"$city\","
echo -n "\"ns_domain\":\"$ns_domain\","
echo -n "\"public_key\":\"$public_key\","
echo -n "\"expiration\":\"$expiration\","
echo -n "\"ports\":{"
echo -n "\"openssh\":\"22, 80, 443\","
echo -n "\"udp_ssh\":\"1-65535\","
echo -n "\"dns\":\"443, 53, 22\","
echo -n "\"dropbear\":\"443, 109\","
echo -n "\"ssh_ws\":\"80, 8080\","
echo -n "\"ssh_ssl_ws\":\"443\","
echo -n "\"ssl_tls\":\"443\","
echo -n "\"ovpn_ssl\":\"443\","
echo -n "\"ovpn_tcp\":\"1194\","
echo -n "\"ovpn_udp\":\"2200\","
echo -n "\"badvpn\":\"7100, 7300, 7300\""
echo -n '},'
echo -n "\"openvpn_link\":\"https://$domain:81/allovpn.zip\","
echo -n "\"save_link\":\"https://$domain:81/ssh-$user.txt\","
echo -n "\"wss_payload\":\"GET wss://BUG.COM/ HTTP/1.1[crlf]Host: $domain[crlf]Upgrade: websocket[crlf][crlf]\""
echo -n '}'
