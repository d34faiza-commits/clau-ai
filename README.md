# clau-ai

Modern Web Server Control Panel — Next.js 14 (App Router) + Tailwind CSS + lucide-react.

Dashboard membaca data **langsung dari server** tempat aplikasi berjalan:
OS, versi PHP, `memory_limit`, `upload_max_filesize`, Safe Mode, web server
(LiteSpeed / Nginx / Apache / Caddy), Disk, RAM, CPU load, uptime dan jam server (UTC).
Halaman refresh otomatis tiap 30 detik. Data mentah juga tersedia di `GET /api/system`.

**File Manager** (`/file-manager`): jelajah folder, buat file/folder, edit teks
(Ctrl+S untuk simpan), upload (tombol atau drag & drop, dengan progress),
download, rename, chmod, hapus (satu atau banyak sekaligus), dan filter nama.

Keamanan File Manager:
- Semua operasi dikunci di dalam `FILE_MANAGER_ROOT`. Path traversal (`../`) dan
  symlink yang mengarah ke luar root ditolak.
- Request yang mengubah file wajib berasal dari origin yang sama (anti-CSRF).
- Root tidak bisa dihapus/di-rename; file biner dan file > 2 MB tidak dibuka di editor.
- Hak akses mengikuti user Linux yang menjalankan aplikasi. Jalankan sebagai user
  pemilik website (mis. `www-data` atau user cPanel), **bukan root**.

## Development

```bash
npm install
npm run dev          # http://localhost:3000
```

## Struktur

```
app/
  layout.tsx            # root layout: Sidebar + konten
  page.tsx              # Dashboard (data live)
  file-manager/page.tsx # File Manager
  [module]/page.tsx     # placeholder modul tahap berikutnya
  api/system/route.ts   # JSON info server
  api/files/...         # API File Manager (list, content, upload, download)
  not-found.tsx
components/
  Sidebar.tsx  ServerTime.tsx  UsageBar.tsx  AutoRefresh.tsx  Modal.tsx
  file-manager/         # FileManager, FileEditor, FileIcon
lib/
  system.ts             # pembaca info server (server-only)
  files.ts              # operasi file yang aman (server-only)
  api-guard.ts          # proteksi CSRF
  format.ts
deploy/
  nginx-clau-ai.conf    # reverse proxy + basic auth
  clau-ai.service       # unit systemd (alternatif PM2)
ecosystem.config.js     # konfigurasi PM2
```

## Deploy ke VPS (Ubuntu/Debian)

> ⚠️ Panel belum punya fitur login. **Jangan buka port 3000 ke publik.**
> Aplikasi hanya listen di `127.0.0.1:3000`, dan akses dari luar lewat Nginx
> yang dilindungi password (basic auth).

**1. Install Node.js 20, Nginx, Git**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git apache2-utils
```

**2. Ambil kode & build**

```bash
sudo git clone https://github.com/d34faiza-commits/clau-ai.git /opt/clau-ai
sudo chown -R $USER:$USER /opt/clau-ai
cd /opt/clau-ai
cp .env.example .env      # sesuaikan PHP_BINARY jika perlu (mis. lsphp)
npm ci
npm run build
```

**3. Jalankan dengan PM2**

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup               # jalankan perintah yang dicetak agar auto-start saat reboot
```

(Alternatif tanpa PM2: lihat `deploy/clau-ai.service`.)

**4. Nginx + password + HTTPS**

```bash
sudo htpasswd -c /etc/nginx/.clau-ai-htpasswd admin
sudo cp deploy/nginx-clau-ai.conf /etc/nginx/sites-available/clau-ai
sudo nano /etc/nginx/sites-available/clau-ai     # ganti panel.example.com
sudo ln -s /etc/nginx/sites-available/clau-ai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d panel.domainanda.com
```

Kalau server sudah memakai LiteSpeed di port 80/443, buat proxy dari LiteSpeed
(External App → Web Server `127.0.0.1:3000`) sebagai ganti Nginx.

**Update versi baru**

```bash
cd /opt/clau-ai && git pull && npm ci && npm run build && pm2 restart clau-ai
```

## Konfigurasi (`.env`)

| Variabel     | Default | Keterangan                                   |
|--------------|---------|----------------------------------------------|
| `PHP_BINARY` | `php`   | Binary PHP CLI, mis. `/usr/local/lsws/lsphp74/bin/php` |
| `DISK_PATH`  | `/`     | Mount point untuk kartu Disk Usage           |
| `FILE_MANAGER_ROOT` | `/var/www` (atau home user) | Folder yang boleh diakses File Manager |
| `MAX_UPLOAD_MB` | `100` | Batas ukuran per file upload (samakan dengan `client_max_body_size` Nginx) |
