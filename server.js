const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 INIT DATABASE
const db = new sqlite3.Database("./3qris.db");

// 🔥 BUAT TABLE
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT,
      price INTEGER,
      date TEXT
    )
  `);
});

// ==========================
// 🔥 CONFIG (QRIS + PRODUK)
// ==========================

// SAVE CONFIG
app.post("/save", (req, res) => {
  const data = JSON.stringify(req.body);

  db.serialize(() => {
    db.run(`DELETE FROM config`);
    db.run(`INSERT INTO config (data) VALUES (?)`, [data], (err) => {
      if (err) {
        console.error("SAVE CONFIG ERROR:", err);
        return res.status(500).send({ success: false });
      }
      res.send({ success: true });
    });
  });
});

// LOAD CONFIG
app.get("/load", (req, res) => {
  db.get(`SELECT data FROM config ORDER BY id DESC LIMIT 1`, (err, row) => {
    if (err) {
      console.error("LOAD CONFIG ERROR:", err);
      return res.status(500).send(null);
    }

    if (row) {
      res.send(JSON.parse(row.data));
    } else {
      res.send(null);
    }
  });
});

// ==========================
// 🔥 TRANSAKSI
// ==========================

// SAVE TRANSACTION
app.post("/transaction", (req, res) => {
  console.log("TRANSACTION MASUK:", req.body); // debug

  const { name, price, time } = req.body;

  db.run(
    `INSERT INTO transactions (product, price, date) VALUES (?, ?, ?)`,
    [name, price, time],
    (err) => {
      if (err) {
        console.error("SAVE TRANSACTION ERROR:", err);
        return res.status(500).send({ success: false });
      }
      res.send({ success: true });
    }
  );
});

// LOAD TRANSACTIONS
app.get("/transactions", (req, res) => {
  db.all(`SELECT * FROM transactions ORDER BY id DESC`, (err, rows) => {
    if (err) {
      console.error("LOAD TRANSACTION ERROR:", err);
      return res.status(500).send([]);
    }
    res.send(rows);
  });
});

// ==========================
// 🔥 TEST
// ==========================
app.get("/", (req, res) => {
  res.send("API 3QRIS SQLite jalan 🚀");
});

const PORT = process.env.PORT || 5000;

const path = require("path");

// serve file static (HTML, CSS, JS)
app.use(express.static(__dirname));

// fallback ke index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});

// ==========================
// 🔥 RUN SERVER
// ==========================
app.listen(5000, () => {
  console.log("Server SQLite jalan di http://localhost:5000");
});