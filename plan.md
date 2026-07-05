# Plan: Fitur Logout Total & Ganti QRIS

**index.html changes:**
1. Topbar: `🚪` → `🚪 Logout Total` (dengan teks jelas)
2. Topbar: tambah button `🔄 Ganti QRIS` antara Pengaturan & Logout
   - Button ini langsung panggil `goSetup()` → kembali ke halaman setup QRIS

**public/app.js changes:**
1. Tambah `els.btnChangeQris` di cacheEls()
2. AddEventListener untuk btnChangeQris → `goSetup()`
