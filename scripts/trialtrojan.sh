#!/bin/bash

# Validasi IP Izin
ipsaya=$(curl -sS ipv4.icanhazip.com)
data_server=$(curl -v --insecure --silent https://google.com/ 2>&1 | grep Date | sed -e 's/< Date: //')
date_list=$(date +"%Y-%m-%d" -d "$data_server")
data_ip="https://raw.githubusercontent.com/joytun21/scjoy/main/izin"
useexp=$(wget -qO- $data_ip | grep $ipsaya | awk '{print $3}')

if [[ $date_list > $useexp ]]; then
  echo '{ "status": "error", "message": "PERMISSION DENIED", "ip": "'$ipsaya'" }'
  exit 1
fi

# Generate akun Trojan
domain=$(cat /etc/xray/domain)
user=trial-`tr -dc a-z0-9 </dev/urandom | head -c4`
exp=1
uuid=$(cat /proc/sys/kernel/random/uuid)
email=${user}
today=$(date +"%Y-%m-%d")
exp_date=$(date -d "$today +$exp days" +"%Y-%m-%d")
ip=$(curl -s ipv4.icanhazip.com)
port_tls=443

cat >> /etc/xray/config.json <<EOF
### $user $exp_date
{
  "password": "$uuid",
  "email": "$email",
  "expiry": "$exp_date"
}
EOF

# Restart Xray
systemctl restart xray

# Output JSON profesional
cat <<EOF
{
  "status": "success",
  "username": "$user",
  "password": "$uuid",
  "domain": "$domain",
  "ip": "$ip",
  "created": "$today",
  "expired": "$exp_date",
  "port_tls": "$port_tls",
  "trojan_tls": "trojan://$uuid@$domain:$port_tls?security=tls&type=ws&path=/trojan#$user",
  "message": "Trial Trojan account created successfully"
}
EOF
