# 3QRIS Kasir 🔄

**Ubah QRIS Statis menjadi QRIS Dinamis untuk Kasir Digital**

3QRIS Kasir adalah aplikasi web berbasis Node.js + Express + SQLite yang memungkinkan Anda mengonversi **QRIS statis** menjadi **QRIS dinamis** dengan nominal harga sesuai produk yang dipilih pelanggan. Cocok untuk warung, UMKM, atau toko kecil.

---

## ✨ Fitur Utama

### 🔐 Autentikasi & Multi-User
- **Welcome Modal** — Popup pertama buka: Login, Daftar, atau Guest mode
- **JWT Authentication** — Token-based login dengan bcrypt password hashing
- **Guest Mode** — Langsung pakai tanpa daftar, data disimpan di localStorage browser
- **Role System** — Admin & User, user pertama otomatis jadi admin

### 🛡 Panel Admin
- **Dashboard Statistik** — Total user, transaksi, revenue, transaksi hari ini
- **Manajemen User** — Lihat semua user + jumlah transaksi + revenue per user
- **Promote/Demote** — Admin bisa naikkan user jadi admin, atau turunkan admin lain
- **Semua Transaksi** — Lihat seluruh riwayat transaksi dari semua user

### 🛒 Fitur Kasir
- **📷 Scan QRIS Statis** — Upload gambar QRIS, otomatis discan pakai jsQR
- **📝 Paste Manual** — Bisa juga paste raw string QRIS langsung
- **🛒 Manajemen Produk** — Tambah/hapus daftar produk dengan harga
- **🔗 Generate QRIS Dinamis** — Tap produk → langsung generate QRIS baru dengan nominal sesuai
- **💰 Fee Layanan** — Opsi biaya layanan (Rp 500 - Custom)
- **🔗 Link Pembayaran** — Copy link untuk dikirim ke pelanggan via WhatsApp / embed di website
- **🧾 Riwayat Transaksi** — Tersimpan di database (login) atau localStorage (guest)
- **🔍 Filter Pencarian** — Cari produk cepat
- **🔊 Sound Effect** — Notifikasi suara tiap transaksi
- **🌙 Tampilan Modern** — UI dark mode, gradient, responsif mobile
- **📱 Halaman Pembayaran** — Halaman khusus untuk pelanggan scan QR & nominal

---

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

Server berjalan di **http://localhost:5000**

### Environment Variable (Production)
```bash
PORT=5000           # Port server (default: 5000)
JWT_SECRET=xxx      # Secret key JWT (wajib di production!)
```

---

## 🔥 API Endpoints

### Auth (Public)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/register` | Daftar akun baru |
| `POST` | `/api/login` | Login dapat JWT token |
| `GET` | `/api/me` | Verifikasi token (butuh auth) |

### Config (Login Required)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/save` | Simpan config QRIS & produk (per user) |
| `GET` | `/api/load` | Load config user yang login |

### Transactions (Login Required)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/transaction` | Simpan transaksi baru |
| `GET` | `/api/transactions` | Riwayat transaksi user |

### Admin Panel (Admin Only)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/admin/stats` | Statistik dashboard (total user, tx, revenue) |
| `GET` | `/api/admin/users` | Daftar semua user + statistik |
| `GET` | `/api/admin/transactions` | Semua transaksi (semua user) |
| `POST` | `/api/admin/promote/:id` | Promosikan user jadi admin |
| `POST` | `/api/admin/demote/:id` | Turunkan admin jadi user |

### Auth Header
Semua endpoint protected butuh header:
```
Authorization: Bearer <token>
```

---

## 🧰 Tech Stack

| Teknologi | Kegunaan |
|-----------|----------|
| **Node.js + Express** | Backend API & static file serving |
| **SQLite3** | Database ringan tanpa setup |
| **jsonwebtoken** | JWT authentication |
| **bcryptjs** | Password hashing |
| **jsQR** | Scan QR code dari gambar |
| **QRCode.js** | Generate QR code dinamis |
| **Vanilla JS** | Frontend (no framework) |

---

## 📁 Struktur Proyek

```
3QRIS/
├── server.js          # Backend: Express + SQLite + JWT Auth + Admin API
├── index.html         # Frontend SPA (welcome modal, setup, kasir, admin panel)
├── package.json       # Dependencies
├── 3qris.db           # Database SQLite (auto-generated)
├── README.md          # File ini
└── node_modules/      # Dependencies (jangan di-commit)
```

---

## 🔄 Flow Aplikasi

```
Buka 3QRIS
  ├─ Ada token JWT? → Verifikasi ke /api/me → Load dari server → Kasir
  ├─ Ada data localStorage? → Guest mode (pakai data lokal) → Kasir
  └─ Tidak ada? → Welcome Modal
        ├─ Login → Masuk ke Kasir
        ├─ Daftar → Setup QRIS → Kasir
        └─ Guest → Setup QRIS → Kasir (data di localStorage)
```

---

## 📄 Lisensi

ISC License — Dibuat dengan ❤️ oleh [triagustian-net](https://github.com/triagustian-net)
