require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

// ════════════════════════════
// 🔒 ENV VALIDATION
// ════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("❌ FATAL: JWT_SECRET harus di-set di .env (min 32 karakter)");
  process.exit(1);
}
const PORT = process.env.PORT || 5001;
const TOKEN_EXPIRY = "30d";

// ════════════════════════════
// 🔒 SECURITY MIDDLEWARE
// ════════════════════════════

// Trust proxy (Cloudflare)
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Helmet security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS whitelist
const allowedOrigins = [
  "https://3qris.my.id",
  "https://www.3qris.my.id",
  "http://localhost:5001",
  "http://127.0.0.1:5001",
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked: " + origin));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Terlalu banyak request, coba lagi nanti." });
  },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." });
  },
});
app.use(globalLimiter);

// Body parser
app.use(express.json({ limit: "1mb" }));

// Block sensitive files & directory listing
const BLOCKED_EXTS = [".db", ".env", ".json", ".pem", ".key", ".sql", ".log", ".backup"];
const BLOCKED_NAMES = ["server.js", ".env", ".git", ".gitignore", "package.json", "package-lock.json"];
app.use((req, res, next) => {
  const url = req.path.toLowerCase();
  const ext = path.extname(url);
  const base = path.basename(url);
  if (BLOCKED_EXTS.includes(ext)) {
    console.warn(`[SECURITY] Blocked file access: ${req.ip} -> ${req.path}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  if (BLOCKED_NAMES.includes(base)) {
    console.warn(`[SECURITY] Blocked sensitive file: ${req.ip} -> ${req.path}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ════════════════════════════
// 🔥 DATABASE INIT
// ════════════════════════════
const DB_PATH = process.env.DB_PATH || "./3qris.db";
const db = new sqlite3.Database(DB_PATH);

// Promisify helpers
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      data TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
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

  // Migrasi: tambah kode_unik jika belum ada (safe)
  db.run(`ALTER TABLE transactions ADD COLUMN kode_unik INTEGER DEFAULT 0`, (err) => {
    // err means column already exists — safe to ignore
  });

  // Migrasi: tambah status jika belum ada
  db.run(`ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'pending'`, (err) => {
    // err means column already exists — safe to ignore
  });

  // Migrasi kolom user_id jika belum ada
  db.each("PRAGMA table_info(config)", (err, row) => {
    if (row && row.name === "user_id") return;
    db.run("ALTER TABLE config ADD COLUMN user_id INTEGER DEFAULT 0", () => {});
  });
  db.each("PRAGMA table_info(transactions)", (err, row) => {
    if (row && row.name === "user_id") return;
    db.run("ALTER TABLE transactions ADD COLUMN user_id INTEGER DEFAULT 0", () => {});
  });
  db.each("PRAGMA table_info(users)", (err, row) => {
    if (row && row.name === "role") return;
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", () => {});
  });
});

// ════════════════════════════
// 🔒 AUTH MIDDLEWARE
// ════════════════════════════
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

function adminMiddleware(req, res, next) {
  if (req.userRole === "admin") return next();

  db.get(
    `SELECT COUNT(*) as count FROM users WHERE role = 'admin'`,
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (row.count === 0) {
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
        return res.status(403).json({ error: "Akses ditolak. Hanya admin yang bisa mengakses." });
      }
    },
  );
}

// ════════════════════════════
// 🔥 AUTH ENDPOINTS
// ════════════════════════════

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Input tidak valid" });
    }
    const u = username.trim();
    const p = password.trim();
    if (u.length < 3 || u.length > 30) {
      return res.status(400).json({ error: "Username 3-30 karakter" });
    }
    if (p.length < 6 || p.length > 128) {
      return res.status(400).json({ error: "Password minimal 6 karakter, maks 128" });
    }
    // Alphanumeric + underscore only
    if (!/^[a-zA-Z0-9_]+$/.test(u)) {
      return res.status(400).json({ error: "Username hanya huruf, angka, dan underscore" });
    }

    const row = await dbGet(`SELECT COUNT(*) as count FROM users`);
    const isFirstUser = row.count === 0;
    const role = isFirstUser ? "admin" : "user";

    const hashedPassword = await bcrypt.hash(p, 12);

    const result = await dbRun(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [u, hashedPassword, role],
    );

    const userId = result.lastID;
    const token = jwt.sign({ userId, username: u, role }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    res.json({
      success: true,
      token,
      user: { id: userId, username: u, role },
      message: isFirstUser
        ? "🎉 Kamu admin pertama! Panel admin tersedia di dashboard."
        : "Pendaftaran berhasil! Silakan setup QRIS dan produk kamu.",
    });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "Username sudah digunakan" });
    }
    console.error("[SECURITY] REGISTER ERROR:", err.message);
    res.status(500).json({ error: "Gagal mendaftar" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Input tidak valid" });
    }

    const u = username.trim();
    const user = await dbGet(`SELECT * FROM users WHERE username = ?`, [u]);

    if (!user) {
      console.warn(`[SECURITY] Failed login attempt: ${req.ip} -> user '${u}' not found`);
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.warn(`[SECURITY] Failed login attempt: ${req.ip} -> user '${u}' wrong password`);
      return res.status(401).json({ error: "Username atau password salah" });
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
  } catch (err) {
    console.error("[SECURITY] LOGIN ERROR:", err.message);
    res.status(500).json({ error: "Gagal login" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await dbGet(`SELECT id, username, role FROM users WHERE id = ?`, [req.userId]);
    if (!user) {
      return res.status(401).json({ error: "User tidak ditemukan" });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════
// 🔥 CONFIG (butuh login)
// ════════════════════════════

app.post("/api/save", authMiddleware, async (req, res) => {
  try {
    const body = req.body;
    // Validasi produk names dari XSS
    if (body && body.products && Array.isArray(body.products)) {
      for (const p of body.products) {
        if (typeof p.name !== "string" || p.name.length > 100) {
          return res.status(400).json({ error: "Nama produk tidak valid (max 100 karakter)" });
        }
        if (typeof p.price !== "number" || p.price < 0 || p.price > 100000000) {
          return res.status(400).json({ error: "Harga produk tidak valid" });
        }
      }
    }
    const data = JSON.stringify(body);
    const userId = req.userId;
    await dbRun(`DELETE FROM config WHERE user_id = ?`, [userId]);
    await dbRun(`INSERT INTO config (user_id, data) VALUES (?, ?)`, [userId, data]);
    res.json({ success: true });
  } catch (err) {
    console.error("[SECURITY] SAVE CONFIG ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

app.get("/api/load", authMiddleware, async (req, res) => {
  try {
    const row = await dbGet(
      `SELECT data FROM config WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [req.userId],
    );
    res.json(row ? JSON.parse(row.data) : null);
  } catch (err) {
    console.error("[SECURITY] LOAD CONFIG ERROR:", err.message);
    res.status(500).json(null);
  }
});

// ════════════════════════════
// 🔥 TRANSAKSI (butuh login)
// ════════════════════════════

app.post("/api/transaction", authMiddleware, async (req, res) => {
  try {
    const { name, price, time, kode_unik } = req.body;
    const userId = req.userId;
    if (typeof name !== "string" || typeof price !== "number" || typeof time !== "string") {
      return res.status(400).json({ error: "Format transaksi tidak valid" });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: "Nama produk terlalu panjang" });
    }
    if (price < 0 || price > 100000000) {
      return res.status(400).json({ error: "Harga tidak valid" });
    }
    const unik = (typeof kode_unik === "number" && kode_unik > 0) ? kode_unik : 0;
    await dbRun(
      `INSERT INTO transactions (user_id, product, price, date, kode_unik, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, name, price, time, unik, "pending"],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[SECURITY] SAVE TRANSACTION ERROR:", err.message);
    res.status(500).json({ success: false });
  }
});

app.get("/api/transactions", authMiddleware, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC`,
      [req.userId],
    );
    res.json(rows || []);
  } catch (err) {
    console.error("[SECURITY] LOAD TRANSACTION ERROR:", err.message);
    res.status(500).json([]);
  }
});

// ════════════════════════════
// 🔥 WEBHOOK / CALLBACK
// ════════════════════════════

/**
 * Kirim webhook ke endpoint yang didaftarkan user
 * Retry 3x kalau gagal (3 detik interval)
 */
async function sendWebhook(url, payload) {
  if (!url || !url.startsWith("http")) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "3QRIS-Webhook/1.0" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        console.log(`[WEBHOOK] ${url} → ${res.status} OK`);
        return;
      }
      console.warn(`[WEBHOOK] ${url} → ${res.status}, attempt ${attempt}/3`);
    } catch (err) {
      console.warn(`[WEBHOOK] ${url} → ${err.message}, attempt ${attempt}/3`);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 3000));
  }
  console.error(`[WEBHOOK] ${url} — gagal setelah 3 percobaan`);
}

/**
 * POST /api/transaction/confirm/:id
 * Konfirmasi transaksi sebagai "paid" → kirim webhook
 */
app.post("/api/transaction/confirm/:id", authMiddleware, async (req, res) => {
  try {
    const txId = parseInt(req.params.id, 10);
    if (isNaN(txId)) return res.status(400).json({ error: "ID transaksi tidak valid" });

    const tx = await dbGet(
      `SELECT * FROM transactions WHERE id = ? AND user_id = ?`,
      [txId, req.userId],
    );
    if (!tx) return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    if (tx.status === "paid") return res.status(400).json({ error: "Transaksi sudah dikonfirmasi" });

    await dbRun(`UPDATE transactions SET status = 'paid' WHERE id = ?`, [txId]);

    // Kirim webhook
    const configRow = await dbGet(
      `SELECT data FROM config WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [req.userId],
    );
    let webhookUrl = "";
    if (configRow) {
      try {
        const configData = JSON.parse(configRow.data);
        webhookUrl = configData.webhook_url || "";
      } catch (e) { /* ignore */ }
    }

    const payload = {
      event: "payment.paid",
      transaction_id: tx.id,
      product: tx.product,
      price: tx.price,
      kode_unik: tx.kode_unik || 0,
      amount: tx.price,
      timestamp: new Date().toISOString(),
    };

    if (webhookUrl) {
      // Fire and forget (dijalanin di background)
      sendWebhook(webhookUrl, payload);
    }

    res.json({ success: true, message: "Transaksi dikonfirmasi", webhook_url: webhookUrl || null });
  } catch (err) {
    console.error("[CONFIRM] Error:", err.message);
    res.status(500).json({ error: "Gagal konfirmasi transaksi" });
  }
});

// ════════════════════════════
// 🔥 ADMIN PANEL (admin only)
// ════════════════════════════

app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userRow = await dbGet(`SELECT COUNT(*) as totalUsers FROM users`);
    const txRow = await dbGet(
      `SELECT COUNT(*) as totalTx, COALESCE(SUM(price), 0) as totalRevenue FROM transactions`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await dbGet(
      `SELECT COUNT(*) as todayTx, COALESCE(SUM(price), 0) as todayRevenue FROM transactions WHERE date LIKE ?`,
      [`%${today}%`],
    );
    res.json({
      totalUsers: userRow.totalUsers,
      totalTransactions: txRow.totalTx,
      totalRevenue: txRow.totalRevenue,
      todayTransactions: todayRow.todayTx,
      todayRevenue: todayRow.todayRevenue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT u.id, u.username, u.role, u.created_at,
              COUNT(t.id) as tx_count,
              COALESCE(SUM(t.price), 0) as total_revenue
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/transactions", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT t.*, u.username FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       ORDER BY t.id DESC
       LIMIT 200`,
    );
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/promote/:userId", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "User ID tidak valid" });
    await dbRun(`UPDATE users SET role = 'admin' WHERE id = ?`, [userId]);
    console.warn(`[SECURITY] Admin ${req.username} promoted user ${userId} to admin`);
    res.json({ success: true, message: "User dipromosikan menjadi admin" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/demote/:userId", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: "User ID tidak valid" });
    if (userId === req.userId) {
      return res.status(400).json({ error: "Tidak bisa menurunkan diri sendiri" });
    }
    await dbRun(`UPDATE users SET role = 'user' WHERE id = ?`, [userId]);
    console.warn(`[SECURITY] Admin ${req.username} demoted user ${userId} to user`);
    res.json({ success: true, message: "Admin diturunkan menjadi user" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════
// 🔥 PUBLIC HEALTH CHECK
// ════════════════════════════
app.get("/api", (req, res) => {
  res.json({ status: "ok", message: "API 3QRIS Secure 🔒" });
});

// ════════════════════════════
// 🔥 QRIS ENGINE (server-side)
// ════════════════════════════

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function convertMinimal(staticStr, amount) {
  let body = staticStr.trim().slice(0, -8);
  body = body.replace("010211", "010212");
  body = body.replace(/54\d{2}\d+(?=5[5-9]|6[0-9]|8[0-9])/, "");
  const amtStr = String(amount);
  const tag54 = "54" + String(amtStr.length).padStart(2, "0") + amtStr;
  body = body.includes("5802ID")
    ? body.replace("5802ID", tag54 + "5802ID")
    : body + tag54;
  const w = body + "6304";
  return w + crc16(w);
}

// ════════════════════════════
// 🔥 PAYMENT API (untuk developer external)
// ════════════════════════════

const PAYMENT_API_KEY = process.env.PAYMENT_API_KEY || "";

// API Key middleware
function apiKeyMiddleware(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!PAYMENT_API_KEY) {
    return res.status(403).json({ error: "PAYMENT_API_KEY belum di-set di .env" });
  }
  if (key !== PAYMENT_API_KEY) {
    return res.status(401).json({ error: "API Key tidak valid" });
  }
  next();
}

/**
 * POST /api/payment-link
 * Header: x-api-key: <PAYMENT_API_KEY>
 * Body: { qris: "000201...", name: "Indomie", price: 15000, kode_unik_digits: 3 }
 *
 * Response: { qris_string, amount, kode_unik, payment_url }
 */
app.post("/api/payment-link", apiKeyMiddleware, async (req, res) => {
  // CORS — izinin AJAX dari domain manapun (biar bisa di-embed)
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // Handle preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  try {
    const { qris, name, price, kode_unik_digits } = req.body;

    // Validasi
    if (!qris || !qris.startsWith("000201")) {
      return res.status(400).json({ error: "QRIS string tidak valid (harus mulai 000201)" });
    }
    if (typeof name !== "string" || name.length > 100) {
      return res.status(400).json({ error: "Nama produk tidak valid (max 100 karakter)" });
    }
    if (typeof price !== "number" || price < 100 || price > 100000000) {
      return res.status(400).json({ error: "Harga tidak valid (100 - 100.000.000)" });
    }

    // Generate kode unik
    const digits = (typeof kode_unik_digits === "number" && kode_unik_digits >= 1 && kode_unik_digits <= 3)
      ? kode_unik_digits
      : 3;
    const max = Math.pow(10, digits) - 1;
    const kodeUnik = Math.floor(Math.random() * max) + 1;

    const totalAmount = price + kodeUnik;

    // Generate QRIS dinamis
    const qrisString = convertMinimal(qris, totalAmount);

    // Payment URL (halaman pembayaran)
    const payload = Buffer.from(JSON.stringify({
      qris: qrisString,
      name: name,
      price: totalAmount,
      kode_unik: kodeUnik,
    })).toString("base64");

    const paymentUrl = `${req.protocol}://${req.get("host")}/pay?d=${encodeURIComponent(payload)}`;

    res.json({
      success: true,
      data: {
        qris_string: qrisString,
        amount: totalAmount,
        base_price: price,
        kode_unik: kodeUnik,
        product: name,
        payment_url: paymentUrl,
      },
    });
  } catch (err) {
    console.error("[PAYMENT-LINK] Error:", err.message);
    res.status(500).json({ error: "Gagal generate QRIS" });
  }
});

/**
 * GET /pay — Halaman pembayaran publik
 * URL: /pay?d=<base64 data>
 * Digunakan oleh dev external untuk redirect pembayaran
 */
app.get("/pay", (req, res) => {
  const data = req.query.d || "";
  if (!data) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Link Tidak Valid</h2>
        <p>Parameter pembayaran tidak ditemukan.</p>
        <p style="font-size:12px;color:#888">
          Gunakan POST /api/payment-link untuk mendapatkan link yang valid.
        </p>
      </body></html>
    `);
  }
  // Render payment page using SPA
  res.sendFile(path.join(__dirname, "index.html"));
});

// ════════════════════════════
// 🔥 SERVE STATIC (SPA)
// ════════════════════════════
// Hanya serve index.html, semua file lain di blokir di atas
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Serve file statis dari public/ (JS, CSS, dll)
app.use("/public", express.static(path.join(__dirname, "public")));

// SPA fallback untuk client-side routing
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (req.path.startsWith("/public")) return next();
  if (req.path.includes(".")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(__dirname, "index.html"));
});

// ════════════════════════════
// 🔥 RUN SERVER
// ════════════════════════════
app.listen(PORT, () => {
  console.log(`✅ Server 3QRIS SECURE jalan di http://localhost:${PORT}`);
  console.log(`   JWT: ${JWT_SECRET.substring(0, 8)}... (masked)`);
});
