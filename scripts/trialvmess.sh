#!/bin/bash
username="trial`</dev/urandom tr -dc a-z0-9 | head -c4`"
domain=$(cat /etc/xray/domain)
masaaktif="1"
quota="1"
iplimit="1"
uuid=$(cat /proc/sys/kernel/random/uuid)

MYIP=$(curl -sS ipv4.icanhazip.com)
IZIN=$(curl -sS https://raw.githubusercontent.com/wildyproject/perizinan/main/ip | grep $MYIP)
if [[ $MYIP != $IZIN ]]; then
  echo "Permission Denied!"
  exit 0
fi

exp=`date -d "$masaaktif days" +"%d-%m-%Y"`

link_tls=$(cat <<EOL
vmess://$(echo -n '{
  "v": "2",
  "ps": "TRIAL-$username",
  "add": "$domain",
  "port": "443",
  "id": "$uuid",
  "aid": "0",
  "net": "ws",
  "path": "/vmess",
  "type": "none",
  "host": "$domain",
  "tls": "tls"
}' | base64 -w 0)
EOL
)

# Output JSON
cat <<EOF
{
  "status": true,
  "data": {
    "username": "$username",
    "uuid": "$uuid",
    "ip": "$MYIP",
    "domain": "$domain",
    "quota": "${quota}GB",
    "ip_limit": "$iplimit",
    "created": "$(date +"%d-%m-%Y")",
    "expired": "$exp",
    "link_tls": "$link_tls"
  }
}
EOF
