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

# Data konfigurasi akun
user=trial`tr -dc a-z0-9 </dev/urandom | head -c4`
pass=123
exp=1
today=$(date +"%Y-%m-%d")
exp_date=$(date -d "$today +$exp days" +"%Y-%m-%d")

# Buat akun SSH
useradd -e $(date -d "$exp days" +"%Y-%m-%d") -s /bin/false -M $user
echo -e "$pass\n$pass\n" | passwd $user > /dev/null 2>&1

# Info tambahan
domain=$(cat /etc/xray/domain || echo "example.com")
ip=$(curl -s ipv4.icanhazip.com)

# Output JSON
cat <<EOF
{
  "status": "success",
  "username": "$user",
  "password": "$pass",
  "ip": "$ip",
  "domain": "$domain",
  "port": {
    "openssh": "22",
    "dropbear": "443, 109",
    "ssl": "443",
    "squid": "3128,8080"
  },
  "created": "$today",
  "expired": "$exp_date",
  "message": "Trial SSH account created successfully"
}
EOF
