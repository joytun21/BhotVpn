#!/bin/bash

trialvmess.sh versi JSON

====== Variabel & Persiapan ======

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin cd RED='\033[0;31m' NC='\033[0m' Green_font_prefix='\033[32m' Green_background_prefix='\033[42;37m' YELLOW="\033[1;33m" BGX="\033[1;90m" BIBlack='\033[1;90m' Green="\033[0;32m" Blue="\033[0;34m" LIGHT="\033[0;37m"

====== Random Username & UUID ======

user=trialvm-$(openssl rand -hex 2) uuid=$(cat /proc/sys/kernel/random/uuid) domain=$(cat /etc/xray/domain) exp="1" hariini=$(date +"%Y-%m-%d") expired=$(date -d "+1 days" +"%Y-%m-%d")

====== Port ======

port_tls=443 port_http=80 port_grpc=443

====== Konfigurasi Akun ======

link1="vmess://$(echo -n "{"v":"2","ps":"$user","add":"$domain","port":"$port_tls","id":"$uuid","aid":"0","net":"ws","path":"/vmess","type":"none","host":"$domain","tls":"tls"}" | base64 -w 0)" link2="vmess://$(echo -n "{"v":"2","ps":"$user","add":"$domain","port":"$port_http","id":"$uuid","aid":"0","net":"ws","path":"/vmess","type":"none","host":"$domain","tls":"none"}" | base64 -w 0)" link3="vmess://$(echo -n "{"v":"2","ps":"$user","add":"$domain","port":"$port_grpc","id":"$uuid","aid":"0","net":"grpc","path":"vmess-grpc","type":"none","host":"$domain","tls":"tls"}" | base64 -w 0)"

====== Cetak JSON Output ======

echo "{" echo "  "status": true," echo "  "message": "Trial VMess berhasil dibuat"," echo "  "data": {" echo "    "username": "$user","
echo "    "uuid": "$uuid","
echo "    "domain": "$domain","
echo "    "created": "$hariini","
echo "    "expired": "$expired","
echo "    "tls": "$link1","
echo "    "ntls": "$link2","
echo "    "grpc": "$link3"" echo "  }" echo "}"

Selesai

