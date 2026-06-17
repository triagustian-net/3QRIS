# 3QRIS Kasir 🔄

**Ubah QRIS Statis menjadi QRIS Dinamis untuk Kasir Digital**

3QRIS Kasir adalah aplikasi web berbasis Node.js + Express + SQLite yang memungkinkan Anda mengonversi **QRIS statis** (satu QR untuk selamanya) menjadi **QRIS dinamis** yang menampilkan nominal harga sesuai produk yang dipilih pelanggan. Cocok untuk warung, UMKM, atau toko kecil yang ingin menerima pembayaran QRIS dengan nominal otomatis.

## ✨ Fitur Utama

- **📷 Scan QRIS Statis** — Upload gambar QRIS, otomatis discan pakai jsQR
- **📝 Paste Manual** — Bisa juga paste raw string QRIS langsung
- **🛒 Manajemen Produk** — Tambah/hapus daftar produk dengan harga
- **🔗 Generate QRIS Dinamis** — Tap produk → langsung generate QRIS baru dengan nominal sesuai
- **💰 Fee Layanan** — Opsi biaya layanan (flat / persen) yang bisa diaktifkan
- **🔗 Link Pembayaran** — Copy link untuk dikirim ke pelanggan via WhatsApp
- **🧾 Riwayat Transaksi** — Semua transaksi tersimpan di database SQLite
- **🔍 Filter Pencarian** — Cari produk cepat
- **🔊 Sound Effect** — Notifikasi suara tiap transaksi
- **🌙 Tampilan Modern** — UI gelap with gradient, responsif mobile
- **📱 Halaman Pembayaran** — Halaman khusus untuk pelanggan lihat QR dan nominal

## 🚀 Cara Install & Jalankan

### Persyaratan
- **Node.js** v18 atau lebih baru
- **npm** (bundled dengan Node.js)

### Langkah-langkah

```bash
# 1. Clone repository
git clone https://github.com/triagustian-net/3QRIS.git
cd 3QRIS

# 2. Install dependencies
npm install

# 3. Jalankan server
node server.js
```

Server akan berjalan di **http://localhost:5000**.

### Deploy ke Production (Railway / Render / VPS)

Untuk production, server sudah otomatis menggunakan port dari environment variable `PORT`:
```js
const PORT = process.env.PORT || 5000;
```

## 🧰 Tech Stack

| Teknologi | Kegunaan |
|-----------|----------|
| **Node.js + Express** | Backend API & static file serving |
| **SQLite3** | Database ringan tanpa setup |
| **jsQR** | Scan QR code dari gambar |
| **QRCode.js** | Generate QR code dinamis |
| **Vanilla JS** | Frontend (no framework) |

## 📁 Struktur Proyek

```
3QRIS/
├── server.js          # Backend server (Express + SQLite)
├── index.html         # Frontend SPA (setup, kasir, payment page)
├── package.json       # Dependencies
├── 3qris.db           # Database SQLite (auto-generated)
├── README.md          # File ini
└── node_modules/      # Dependencies (jangan di-commit)
```

## 🔥 API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/save` | Simpan konfigurasi QRIS & produk |
| `GET` | `/load` | Load konfigurasi yang tersimpan |
| `POST` | `/transaction` | Simpan transaksi baru |
| `GET` | `/transactions` | Ambil semua riwayat transaksi |
| `GET` | `/` | Cek status server |

## 📸 Screenshot

*(Tambahkan screenshot aplikasi di sini)*

## 📄 Lisensi

Proyek ini dilisensikan di bawah **ISC License**.

---

Dibuat dengan ❤️ oleh [triagustian-net](https://github.com/triagustian-net)
