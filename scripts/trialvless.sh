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

# Generate Akun
domain=$(cat /etc/xray/domain)
user=trial-`tr -dc a-z0-9 </dev/urandom | head -c4`
exp=1
uuid=$(cat /proc/sys/kernel/random/uuid)
email=${user}
today=$(date +"%Y-%m-%d")
exp_date=$(date -d "$today +$exp days" +"%Y-%m-%d")
ip=$(curl -s ipv4.icanhazip.com)
tls_port=443
none_port=80
grpc_port=443

cat >> /etc/xray/config.json <<EOF
### $user $exp_date
{
  "id": "$uuid",
  "flow": "",
  "email": "$email",
  "alterId": 0,
  "limitIp": 0,
  "totalGB": 0,
  "expiry": "$exp_date"
}
EOF

# Restart service
systemctl restart xray

# Output JSON
cat <<EOF
{
  "status": "success",
  "username": "$user",
  "uuid": "$uuid",
  "domain": "$domain",
  "ip": "$ip",
  "created": "$today",
  "expired": "$exp_date",
  "port_tls": "$tls_port",
  "port_ntls": "$none_port",
  "port_grpc": "$grpc_port",
  "vless_tls": "vless://$uuid@$domain:$tls_port?encryption=none&security=tls&type=ws&path=/vless#$user",
  "message": "Trial VLESS account created successfully"
}
EOF
