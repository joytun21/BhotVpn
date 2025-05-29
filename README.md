## Fitur

- **Service Create**: Membuat akun VPN baru.
- **Service Renew**: Memperbarui akun VPN yang sudah ada.
- **Top Up Saldo**: Menambah saldo akun pengguna.
- **Cek Saldo**: Memeriksa saldo akun pengguna.

## Teknologi yang Digunakan

- Node.js
- SQLite3
- Axios
- Telegraf (untuk integrasi dengan Telegram Bot)

## Installasi Otomatis
```
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt update -y && apt install -y git && apt install -y curl && curl -L -k -sS https://raw.githubusercontent.com/joytun21/BhotVpn/refs/heads/main/start -o start && bash start sellvpn && [ $? -eq 0 ] && rm -f start



## Atur Versi Node.js
Berikut adalah langkah-langkah yang dapat Anda ikuti:

1. Instal NVM (Node Version Manager) jika belum terinstal:
```
bash
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
```
2.  Setelah instalasi selesai, jalankan perintah berikut untuk memuat NVM:
    ```bash
source ~/.bashrc
```
3. Instal Node.js versi 20 menggunakan NVM:
```
bash
```
nvm install 20
```
4.  Setelah instalasi selesai, gunakan Node.js versi 20 dengan menjalankan perintah berikut:
    ```bash
nvm use 20
```
5. Untuk memastikan bahwa Node.js versi 20 sedang digunakan, jalankan perintah berikut:
```
bash
```
node -v
```

Jika Anda ingin menjadikan Node.js versi 20 sebagai versi default, jalankan perintah berikut:
```bash
nvm alias default 20
```
