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

exp=`date -d "$masaaktif days" +"%d-%m-%Y")"

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
    "link_tls": "vless://$uuid@$domain:443?encryption=none&security=tls&type=ws&host=$domain&path=%2Fvless#TRIAL-$username",
    "link_ntls": "vless://$uuid@$domain:80?encryption=none&security=none&type=ws&host=$domain&path=%2Fvless#TRIAL-$username",
    "link_grpc": "vless://$uuid@$domain:443?mode=gun&security=tls&type=grpc&serviceName=vless-grpc&sni=$domain#TRIAL-$username"
  }
}
EOF
