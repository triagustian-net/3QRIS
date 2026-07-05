const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cors());

// ── JWT SECRET ──
const JWT_SECRET = process.env.JWT_SECRET || "3qris-rahasia-2025-ubah-di-env";
const TOKEN_EXPIRY = "30d"; // token berlaku 30 hari

// ── INIT DATABASE ──
const db = new sqlite3.Database("./3qris.db");

db.serialize(() => {
  // Tabel users (dengan role)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Tabel config (tambah user_id)
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      data TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Tabel transactions (tambah user_id)
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product TEXT,
      price INTEGER,
      date TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migrasi: tambah kolom user_id jika belum ada (untuk DB lama)
  db.each("PRAGMA table_info(config)", (err, row) => {
    if (row && row.name === "user_id") return;
    db.run("ALTER TABLE config ADD COLUMN user_id INTEGER DEFAULT 0", () => {});
  });
  db.each("PRAGMA table_info(transactions)", (err, row) => {
    if (row && row.name === "user_id") return;
    db.run(
      "ALTER TABLE transactions ADD COLUMN user_id INTEGER DEFAULT 0",
      () => {},
    );
  });
  // Migrasi: tambah kolom role jika belum ada
  db.each("PRAGMA table_info(users)", (err, row) => {
    if (row && row.name === "role") return;
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", () => {});
  });
});

// ── MIDDLEWARE: VERIFIKASI JWT ──
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.userRole = decoded.role || "user";
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token tidak valid atau expired" });
  }
}

// ── MIDDLEWARE: ADMIN ONLY (auto-bootstrap jika belum ada admin) ──
function adminMiddleware(req, res, next) {
  if (req.userRole === "admin") return next();

  // Cek apakah sudah ada admin di database
  db.get(
    `SELECT COUNT(*) as count FROM users WHERE role = 'admin'`,
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (row.count === 0) {
        // Belum ada admin → auto-promote user ini jadi admin pertama
        db.run(
          `UPDATE users SET role = 'admin' WHERE id = ?`,
          [req.userId],
          (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            req.userRole = "admin";
            next();
          },
        );
      } else {
        return res
          .status(403)
          .json({ error: "Akses ditolak. Hanya admin yang bisa mengakses." });
      }
    },
  );
}

// ════════════════════════════
// 🔥 AUTH ENDPOINTS
// ════════════════════════════

// REGISTER
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: "Username minimal 3 karakter" });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Password minimal 4 karakter" });
  }

  // Cek apakah ini user pertama → jadikan admin
  db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
    if (err) {
      console.error("COUNT ERROR:", err);
      return res.status(500).json({ error: "Gagal mendaftar" });
    }
    const isFirstUser = row.count === 0;
    const role = isFirstUser ? "admin" : "user";

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [username, hashedPassword, role],
      function (err2) {
        if (err2) {
          if (err2.message.includes("UNIQUE")) {
            return res.status(409).json({ error: "Username sudah digunakan" });
          }
          console.error("REGISTER ERROR:", err2);
          return res.status(500).json({ error: "Gagal mendaftar" });
        }

        const userId = this.lastID;
        const token = jwt.sign({ userId, username, role }, JWT_SECRET, {
          expiresIn: TOKEN_EXPIRY,
        });

        res.json({
          success: true,
          token,
          user: { id: userId, username, role },
          message: isFirstUser
            ? "🎉 Kamu admin pertama! Panel admin tersedia di dashboard."
            : "Pendaftaran berhasil! Silakan setup QRIS dan produk kamu.",
        });
      },
    );
  });
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      console.error("LOGIN ERROR:", err);
      return res.status(500).json({ error: "Gagal login" });
    }
    if (!user) {
      return res.status(401).json({ error: "Username tidak ditemukan" });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Password salah" });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY },
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
      message: "Login berhasil!",
    });
  });
});

// VERIFIKASI TOKEN (untuk cek apakah user masih login)
app.get("/api/me", authMiddleware, (req, res) => {
  // Ambil role terbaru dari database (bisa berubah karena auto-bootstrap)
  db.get(
    `SELECT id, username, role FROM users WHERE id = ?`,
    [req.userId],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "User tidak ditemukan" });
      }
      res.json({
        success: true,
        user: { id: user.id, username: user.username, role: user.role },
      });
    },
  );
});

// ════════════════════════════
// 🔥 CONFIG (butuh login)
// ════════════════════════════

// SAVE CONFIG
app.post("/api/save", authMiddleware, (req, res) => {
  const data = JSON.stringify(req.body);
  const userId = req.userId;

  // Hapus config lama user ini, insert baru
  db.run(`DELETE FROM config WHERE user_id = ?`, [userId], (err) => {
    if (err) {
      console.error("SAVE CONFIG DELETE ERROR:", err);
      return res.status(500).json({ success: false });
    }
    db.run(
      `INSERT INTO config (user_id, data) VALUES (?, ?)`,
      [userId, data],
      (err2) => {
        if (err2) {
          console.error("SAVE CONFIG INSERT ERROR:", err2);
          return res.status(500).json({ success: false });
        }
        res.json({ success: true });
      },
    );
  });
});

// LOAD CONFIG
app.get("/api/load", authMiddleware, (req, res) => {
  const userId = req.userId;

  db.get(
    `SELECT data FROM config WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId],
    (err, row) => {
      if (err) {
        console.error("LOAD CONFIG ERROR:", err);
        return res.status(500).json(null);
      }
      if (row) {
        res.json(JSON.parse(row.data));
      } else {
        res.json(null);
      }
    },
  );
});

// ════════════════════════════
// 🔥 TRANSAKSI (butuh login)
// ════════════════════════════

// SAVE TRANSACTION
app.post("/api/transaction", authMiddleware, (req, res) => {
  const { name, price, time } = req.body;
  const userId = req.userId;

  db.run(
    `INSERT INTO transactions (user_id, product, price, date) VALUES (?, ?, ?, ?)`,
    [userId, name, price, time],
    (err) => {
      if (err) {
        console.error("SAVE TRANSACTION ERROR:", err);
        return res.status(500).json({ success: false });
      }
      res.json({ success: true });
    },
  );
});

// LOAD TRANSACTIONS
app.get("/api/transactions", authMiddleware, (req, res) => {
  const userId = req.userId;

  db.all(
    `SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error("LOAD TRANSACTION ERROR:", err);
        return res.status(500).json([]);
      }
      res.json(rows || []);
    },
  );
});

// ════════════════════════════
// 🔥 ADMIN PANEL (admin only)
// ════════════════════════════

// STATISTIK DASHBOARD
app.get("/api/admin/stats", authMiddleware, adminMiddleware, (req, res) => {
  db.get(`SELECT COUNT(*) as totalUsers FROM users`, (err, userRow) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(
      `SELECT COUNT(*) as totalTx, COALESCE(SUM(price), 0) as totalRevenue FROM transactions`,
      (err2, txRow) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Transaksi hari ini
        const today = new Date().toISOString().slice(0, 10);
        db.get(
          `SELECT COUNT(*) as todayTx, COALESCE(SUM(price), 0) as todayRevenue FROM transactions WHERE date LIKE ?`,
          [`%${today}%`],
          (err3, todayRow) => {
            if (err3) return res.status(500).json({ error: err3.message });

            res.json({
              totalUsers: userRow.totalUsers,
              totalTransactions: txRow.totalTx,
              totalRevenue: txRow.totalRevenue,
              todayTransactions: todayRow.todayTx,
              todayRevenue: todayRow.todayRevenue,
            });
          },
        );
      },
    );
  });
});

// DAFTAR SEMUA USER
app.get("/api/admin/users", authMiddleware, adminMiddleware, (req, res) => {
  db.all(
    `SELECT u.id, u.username, u.role, u.created_at,
            COUNT(t.id) as tx_count,
            COALESCE(SUM(t.price), 0) as total_revenue
     FROM users u
     LEFT JOIN transactions t ON t.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// DAFTAR SEMUA TRANSAKSI (semua user)
app.get(
  "/api/admin/transactions",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    db.all(
      `SELECT t.*, u.username FROM transactions t
     LEFT JOIN users u ON t.user_id = u.id
     ORDER BY t.id DESC
     LIMIT 200`,
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      },
    );
  },
);

// PROMOSIKAN USER JADI ADMIN (admin only)
app.post(
  "/api/admin/promote/:userId",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    const { userId } = req.params;
    db.run(`UPDATE users SET role = 'admin' WHERE id = ?`, [userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: "User dipromosikan menjadi admin" });
    });
  },
);

// DEMOTE ADMIN JADI USER (admin only, tidak bisa demote diri sendiri)
app.post(
  "/api/admin/demote/:userId",
  authMiddleware,
  adminMiddleware,
  (req, res) => {
    const { userId } = req.params;
    if (parseInt(userId) === req.userId) {
      return res
        .status(400)
        .json({ error: "Tidak bisa menurunkan diri sendiri" });
    }
    db.run(`UPDATE users SET role = 'user' WHERE id = ?`, [userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: "Admin diturunkan menjadi user" });
    });
  },
);

// ════════════════════════════
// 🔥 PUBLIC / TEST
// ════════════════════════════
app.get("/api", (req, res) => {
  res.json({ status: "ok", message: "API 3QRIS SQLite jalan 🚀" });
});

// ════════════════════════════
// 🔥 SERVE STATIC FILES
// ════════════════════════════
app.use(express.static(__dirname));

app.use((req, res, next) => {
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

// ════════════════════════════
// 🔥 RUN SERVER
// ════════════════════════════
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server 3QRIS jalan di http://localhost:${PORT}`);
  console.log(`   Endpoint: /api/register | /api/login | /api/me`);
  console.log(
    `   Protected: /api/save | /api/load | /api/transaction | /api/transactions`,
  );
});
