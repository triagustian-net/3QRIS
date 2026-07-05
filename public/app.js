/* 3QRIS Kasir - App Script */
(function () {
  "use strict";

  const API_URL = "/api";
  let config = { qrisString: "", products: [] };
  let transactions = [],
    currentProduct = null,
    currentFee = 0,
    currentTotal = 0;
  let authToken = null;
  let currentUser = null;
  let isGuest = false;
  let isAdmin = false;

  const DEFAULT_PRODUCTS = [
    { name: "Voucher 1 Hari", price: 6500 },
    { name: "Voucher 3 Hari", price: 17000 },
    { name: "Voucher 7 Hari", price: 35000 },
    { name: "Voucher 14 Hari", price: 68000 },
    { name: "Voucher 30 Hari", price: 110000 },
  ];

  let rowId = 0;
  let _payData = null;

  // ═══ DOM REFS (populated on init) ═══
  const $ = (id) => document.getElementById(id);
  let els = {};

  function cacheEls() {
    els = {
      welcomeOverlay: $("welcome-overlay"),
      welcomeError: $("welcomeError"),
      welcomeSuccess: $("welcomeSuccess"),
      setupScreen: $("setup-screen"),
      kasirScreen: $("kasir-screen"),
      paymentScreen: $("payment-screen"),
      errMsg: $("errMsg"),
      guestBadge: $("guestBadge"),
      userBadge: $("userBadge"),
      btnAdmin: $("btnAdmin"),
      btnSettings: $("btnSettings"),
      btnLogout: $("btnLogout"),
      clockDisplay: $("clockDisplay"),
      searchInput: $("searchInput"),
      qrEmpty: $("qrEmpty"),
      qrResult: $("qrResult"),
      qrLoading: $("qrLoading"),
      qrBox: $("qr-box"),
      qrProductBadge: $("qrProductBadge"),
      qrAmount: $("qrAmount"),
      paymentLinkInput: $("paymentLinkInput"),
      btnCopyLink: $("btnCopyLink"),
      feeEnabled: $("feeEnabled"),
      feeOptions: $("feeOptions"),
      feeCustom: $("feeCustom"),
      feeSummary: $("feeSummary"),
      feeCustomInput: $("feeCustomInput"),
      feeBase: $("feeBase"),
      feeAmount: $("feeAmount"),
      feeTotal: $("feeTotal"),
      qrisManual: $("qrisManual"),
      productList: $("productList"),
      uploadZone: $("uploadZone"),
      fileInput: $("fileInput"),
      uploadLabel: $("uploadLabel"),
      scanStatus: $("scanStatus"),
      kasirProductGrid: $("kasirProductGrid"),
      txList: $("txList"),
      soundEnabled: $("soundEnabled"),
      settingsModal: $("settingsModal"),
      adminModal: $("adminModal"),
      nominalModal: $("nominalModal"),
      customNominalInput: $("customNominalInput"),
      // Payment page
      payProductName: $("payProductName"),
      payAmountDisplay: $("payAmountDisplay"),
      paymentQrBox: $("payment-qr-box"),
      paymentContent: $("paymentContent"),
      // Admin
      statUsers: $("statUsers"),
      statTx: $("statTx"),
      statRevenue: $("statRevenue"),
      statToday: $("statToday"),
      adminUsersBody: $("adminUsersBody"),
      adminTxBody: $("adminTxBody"),
      adminTabUsers: $("adminTabUsers"),
      adminTabTransactions: $("adminTabTransactions"),
    };
  }

  // ═══ HTML ESCAPE ═══
  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ═══ HELPER: LOCAL STORAGE ═══
  function saveToLocal(key, value) {
    try {
      localStorage.setItem("3qris_" + key, JSON.stringify(value));
    } catch (e) {}
  }
  function loadFromLocal(key) {
    try {
      const v = localStorage.getItem("3qris_" + key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  function removeFromLocal(key) {
    try {
      localStorage.removeItem("3qris_" + key);
    } catch (e) {}
  }

  // ═══ AUTH HEADERS ═══
  function authHeaders() {
    if (!authToken) return {};
    return {
      Authorization: "Bearer " + authToken,
      "Content-Type": "application/json",
    };
  }

  async function apiFetch(url, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Gagal " + res.status);
    }
    return data;
  }

  // ═══ CLOCK ═══
  function startClock() {
    if (!els.clockDisplay) return;
    const tick = () =>
      (els.clockDisplay.textContent = new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }));
    tick();
    setInterval(tick, 1000);
  }

  // ═══ SOUND ═══
  function playSound(type) {
    if (!els.soundEnabled?.checked) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "success") {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "error") {
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === "click") {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  }

  // ═══ WELCOME MODAL ═══
  function showWelcomeModal() {
    els.welcomeOverlay.classList.add("open");
    els.setupScreen.style.display = "flex";
    els.kasirScreen.style.display = "none";
    hideWelcomeMessages();
    switchWelcomeTab("login");
  }

  function hideWelcomeModal() {
    els.welcomeOverlay.classList.remove("open");
  }

  function hideWelcomeMessages() {
    els.welcomeError.style.display = "none";
    els.welcomeSuccess.style.display = "none";
  }

  function showWelcomeError(msg) {
    els.welcomeError.textContent = msg;
    els.welcomeError.style.display = "block";
    els.welcomeSuccess.style.display = "none";
  }

  function showWelcomeSuccess(msg) {
    els.welcomeSuccess.textContent = msg;
    els.welcomeSuccess.style.display = "block";
    els.welcomeError.style.display = "none";
  }

  function switchWelcomeTab(tab) {
    document.querySelectorAll(".welcome-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".welcome-form").forEach((f) => f.classList.remove("active"));
    hideWelcomeMessages();
    if (tab === "login") {
      document.querySelector(".welcome-tab:nth-child(1)").classList.add("active");
      $("welcome-login").classList.add("active");
      $("loginUsername").focus();
    } else if (tab === "register") {
      document.querySelector(".welcome-tab:nth-child(2)").classList.add("active");
      $("welcome-register").classList.add("active");
      $("regUsername").focus();
    } else if (tab === "guest") {
      document.querySelector(".welcome-tab:nth-child(3)").classList.add("active");
      $("welcome-guest").classList.add("active");
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    hideWelcomeMessages();
    const username = $("loginUsername").value.trim();
    const password = $("loginPassword").value;
    const btn = $("btnLogin");
    if (!username || !password) {
      showWelcomeError("Username dan password wajib diisi");
      return;
    }
    btn.textContent = "Memproses...";
    btn.disabled = true;
    try {
      const res = await fetch(API_URL + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showWelcomeError(data.error || "Login gagal");
        btn.textContent = "Masuk";
        btn.disabled = false;
        return;
      }
      authToken = data.token;
      currentUser = data.user;
      isAdmin = data.user.role === "admin";
      isGuest = false;
      saveToLocal("token", authToken);
      hideWelcomeModal();
      await loadFromServer();
    } catch (err) {
      showWelcomeError("Gagal terhubung ke server. Pastikan server berjalan.");
      btn.textContent = "Masuk";
      btn.disabled = false;
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    hideWelcomeMessages();
    const username = $("regUsername").value.trim();
    const password = $("regPassword").value;
    const password2 = $("regPassword2").value;
    const btn = $("btnRegister");
    if (!username || !password) {
      showWelcomeError("Username dan password wajib diisi");
      return;
    }
    if (username.length < 3) {
      showWelcomeError("Username minimal 3 karakter");
      return;
    }
    if (password.length < 4) {
      showWelcomeError("Password minimal 4 karakter");
      return;
    }
    if (password !== password2) {
      showWelcomeError("Konfirmasi password tidak cocok");
      return;
    }
    btn.textContent = "Mendaftarkan...";
    btn.disabled = true;
    try {
      const res = await fetch(API_URL + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showWelcomeError(data.error || "Pendaftaran gagal");
        btn.textContent = "Daftar Sekarang";
        btn.disabled = false;
        return;
      }
      authToken = data.token;
      currentUser = data.user;
      isAdmin = data.user.role === "admin";
      isGuest = false;
      saveToLocal("token", authToken);
      showWelcomeSuccess(
        "✅ Pendaftaran berhasil! Silakan setup QRIS dan produk kamu."
      );
      btn.textContent = "Daftar Sekarang";
      btn.disabled = false;
      setTimeout(() => {
        hideWelcomeModal();
        els.setupScreen.style.display = "flex";
        els.kasirScreen.style.display = "none";
        renderProductRows(DEFAULT_PRODUCTS);
      }, 1500);
    } catch (err) {
      showWelcomeError("Gagal terhubung ke server. Pastikan server berjalan.");
      btn.textContent = "Daftar Sekarang";
      btn.disabled = false;
    }
  }

  function handleGuest() {
    isGuest = true;
    authToken = null;
    currentUser = null;
    removeFromLocal("token");
    hideWelcomeModal();
    els.setupScreen.style.display = "flex";
    els.kasirScreen.style.display = "none";
    const localConfig = loadFromLocal("config");
    if (localConfig && localConfig.products) {
      renderProductRows(localConfig.products);
      els.qrisManual.value = localConfig.qrisString || "";
    } else {
      renderProductRows(DEFAULT_PRODUCTS);
    }
  }

  async function loadFromServer() {
    try {
      const data = await apiFetch(API_URL + "/load");
      if (data && data.qrisString) {
        config = data;
        renderKasir();
      } else {
        els.setupScreen.style.display = "flex";
        els.kasirScreen.style.display = "none";
        renderProductRows(DEFAULT_PRODUCTS);
      }
      try {
        const txData = await apiFetch(API_URL + "/transactions");
        if (txData) {
          transactions = txData.map((tx) => ({
            name: tx.product,
            price: tx.price,
            time: tx.date,
            fee: 0,
          }));
          renderTxLog();
        }
      } catch (e) {
        console.log("Gagal load transaksi:", e);
      }
    } catch (e) {
      console.error("Gagal load dari server:", e);
      els.setupScreen.style.display = "flex";
      els.kasirScreen.style.display = "none";
      renderProductRows(DEFAULT_PRODUCTS);
    }
  }

  function handleLogout() {
    if (
      !confirm(
        "Yakin ingin logout?\n\n" +
          (isGuest
            ? "Data guest akan tetap tersimpan di browser ini."
            : "Data kamu aman di server, login lagi untuk mengakses.")
      )
    )
      return;
    if (isGuest) {
      saveToLocal("config", config);
      saveToLocal("transactions", transactions);
    }
    authToken = null;
    currentUser = null;
    isGuest = false;
    removeFromLocal("token");
    config = { qrisString: "", products: [] };
    transactions = [];
    currentProduct = null;
    currentFee = 0;
    els.kasirScreen.style.display = "none";
    els.setupScreen.style.display = "flex";
    showWelcomeModal();
  }

  // ═══ SETUP ═══
  function renderProductRows(products) {
    els.productList.innerHTML = "";
    products.forEach((p) => addProductRow(p.name, p.price));
  }

  function addProductRow(name, price) {
    name = name || "";
    price = price || "";
    const id = rowId++;
    const row = document.createElement("div");
    row.className = "product-row";
    row.id = "row-" + id;
    row.innerHTML =
      '<input type="text" placeholder="Nama produk" value="' +
      escapeHtml(name) +
      '" class="name-input" />' +
      '<input type="number" placeholder="Harga" value="' +
      escapeHtml(price) +
      '" class="price" min="1" />' +
      '<button class="btn-icon" data-remove="row-' +
      id +
      '">✕</button>';
    els.productList.appendChild(row);
  }

  function getProductsFromForm() {
    return [...document.querySelectorAll("#productList .product-row")].reduce(
      (acc, row) => {
        const name = row.querySelector(".name-input").value.trim();
        const price = parseInt(row.querySelector(".price").value);
        if (name && price > 0) acc.push({ name, price });
        return acc;
      },
      []
    );
  }

  // ═══ UPLOAD & AUTO-SCAN ═══
  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      showErr("Format harus JPG/PNG/WEBP");
      return;
    }
    els.uploadLabel.textContent = "✓ " + file.name;
    const url = URL.createObjectURL(file);
    autoScan(url, true);
  }

  function autoScan(src, isObjectUrl) {
    setScanStatus("scanning", "⏳ Scanning...");
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      let w = img.width,
        h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        } else {
          w = Math.round((w * MAX) / h);
          h = MAX;
        }
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      if (isObjectUrl) URL.revokeObjectURL(src);
      const code = jsQR(d.data, d.width, d.height, {
        inversionAttempts: "dontInvert",
      });
      if (code && code.data.startsWith("000201")) {
        els.qrisManual.value = code.data;
        setScanStatus("ok", "✓ QRIS berhasil dibaca!");
        playSound("success");
      } else {
        if (w < img.width) {
          const c2 = document.createElement("canvas");
          c2.width = img.width;
          c2.height = img.height;
          c2.getContext("2d").drawImage(img, 0, 0);
          const d2 = c2.getContext("2d").getImageData(0, 0, img.width, img.height);
          const code2 = jsQR(d2.data, d2.width, d2.height, {
            inversionAttempts: "attemptBoth",
          });
          if (code2 && code2.data.startsWith("000201")) {
            els.qrisManual.value = code2.data;
            setScanStatus("ok", "✓ QRIS berhasil dibaca!");
            playSound("success");
            return;
          }
        }
        setScanStatus("fail", "✗ Tidak terbaca \u2014 paste manual");
        playSound("error");
      }
    };
    img.src = src;
  }

  function setScanStatus(type, msg) {
    els.scanStatus.textContent = msg;
    els.scanStatus.className = "scan-status " + type;
  }

  // ═══ START KASIR ═══
  function startKasir() {
    const qris = els.qrisManual.value.trim();
    const products = getProductsFromForm();
    hideErr();
    if (!qris || !qris.startsWith("000201")) {
      showErr("QRIS string tidak valid");
      return;
    }
    if (!products.length) {
      showErr("Tambahkan minimal 1 produk");
      return;
    }
    config = { qrisString: qris, products: products };
    if (isGuest) {
      saveToLocal("config", config);
      renderKasir();
    } else {
      fetch(API_URL + "/save", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(config),
      })
        .then((res) => res.json())
        .then(() => renderKasir())
        .catch(() => showErr("Gagal simpan ke server"));
    }
  }

  // ═══ RENDER KASIR ═══
  function renderKasir() {
    els.setupScreen.style.display = "none";
    els.kasirScreen.style.display = "flex";
    if (isGuest) {
      els.guestBadge.style.display = "inline";
      els.userBadge.style.display = "none";
      els.btnAdmin.style.display = "none";
    } else if (currentUser) {
      els.userBadge.textContent =
        (isAdmin ? "🛡 " : "🔒 ") + currentUser.username;
      els.userBadge.style.display = "inline";
      els.guestBadge.style.display = "none";
      els.btnAdmin.style.display = isAdmin ? "inline-block" : "none";
    } else {
      els.userBadge.style.display = "none";
      els.guestBadge.style.display = "none";
      els.btnAdmin.style.display = "none";
    }
    startClock();
    renderProductGrid();
  }

  function renderProductGrid(filter) {
    filter = (filter || "").toLowerCase();
    els.kasirProductGrid.innerHTML = "";
    const filtered = config.products.filter((p) =>
      p.name.toLowerCase().includes(filter)
    );
    filtered.forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.dataset.name = p.name;
      card.dataset.price = p.price;
      card.innerHTML =
        '<div class="tap-hint">TAP UNTUK GENERATE</div>' +
        '<div class="prod-name">' +
        escapeHtml(p.name) +
        '</div><div class="prod-price">Rp ' +
        p.price.toLocaleString("id-ID") +
        '</div><div class="tap-arrow">↗</div>';
      els.kasirProductGrid.appendChild(card);
    });
    const customCard = document.createElement("div");
    customCard.className = "custom-nominal-card";
    customCard.innerHTML =
      '<div class="icon">💰</div><div class="label">Nominal Custom</div><div class="sub">Masukkan jumlah sendiri</div>';
    els.kasirProductGrid.appendChild(customCard);
  }

  // Product grid event delegation
  function initProductGridEvents() {
    els.kasirProductGrid.addEventListener("click", function (e) {
      const card = e.target.closest(".product-card");
      if (card) {
        playSound("click");
        const product = {
          name: card.dataset.name,
          price: parseInt(card.dataset.price),
        };
        selectProduct(product, card);
        return;
      }
      if (e.target.closest(".custom-nominal-card")) {
        playSound("click");
        openNominalModal();
      }
    });
  }

  function selectProduct(product, cardEl) {
    document
      .querySelectorAll(".product-card")
      .forEach((c) => c.classList.remove("selected"));
    cardEl.classList.add("selected");
    currentProduct = product;
    currentFee = 0;
    els.feeEnabled.checked = false;
    els.feeOptions.classList.remove("show");
    els.feeSummary.style.display = "none";
    els.qrEmpty.style.display = "none";
    els.qrResult.style.display = "none";
    els.qrLoading.style.display = "flex";
    setTimeout(() => generateDynamicQR(product), 300);
  }

  // ═══ NOMINAL CUSTOM ═══
  function openNominalModal() {
    els.nominalModal.classList.add("open");
    els.customNominalInput.value = "";
    setTimeout(() => els.customNominalInput.focus(), 100);
  }

  function closeNominalModal() {
    els.nominalModal.classList.remove("open");
  }

  function setQuickNominal(amount) {
    els.customNominalInput.value = amount;
  }

  function confirmCustomNominal() {
    const amount = parseInt(els.customNominalInput.value) || 0;
    if (amount <= 0) return;
    closeNominalModal();
    const virtualProduct = { name: "Nominal Custom", price: amount };
    currentProduct = virtualProduct;
    currentFee = 0;
    els.feeEnabled.checked = false;
    els.feeOptions.classList.remove("show");
    els.feeSummary.style.display = "none";
    els.qrEmpty.style.display = "none";
    els.qrResult.style.display = "none";
    els.qrLoading.style.display = "flex";
    setTimeout(() => generateDynamicQR(virtualProduct), 300);
  }

  // ═══ FEE ═══
  function toggleFee() {
    const enabled = els.feeEnabled.checked;
    els.feeOptions.classList.toggle("show", enabled);
    if (!enabled) {
      currentFee = 0;
      els.feeCustom.classList.remove("show");
      els.feeSummary.style.display = "none";
      if (currentProduct) generateDynamicQR(currentProduct);
    }
  }

  function setFee(amount) {
    currentFee = amount;
    document
      .querySelectorAll(".fee-btn")
      .forEach((b) => b.classList.remove("active"));
    document.querySelector(
      '.fee-btn[data-fee="' + amount + '"]'
    ).classList.add("active");
    els.feeCustom.classList.remove("show");
    updateFeeSummary();
    if (currentProduct) generateDynamicQR(currentProduct);
  }

  function showCustomFee() {
    document
      .querySelectorAll(".fee-btn")
      .forEach((b) => b.classList.remove("active"));
    els.feeCustom.classList.add("show");
    els.feeCustomInput.focus();
  }

  function applyCustomFee() {
    const fee = parseInt(els.feeCustomInput.value) || 0;
    if (fee > 0) {
      currentFee = fee;
      updateFeeSummary();
      if (currentProduct) generateDynamicQR(currentProduct);
    }
  }

  function updateFeeSummary() {
    if (!currentProduct) return;
    const base = currentProduct.price;
    const total = base + currentFee;
    els.feeBase.textContent = "Rp " + base.toLocaleString("id-ID");
    els.feeAmount.textContent = "Rp " + currentFee.toLocaleString("id-ID");
    els.feeTotal.textContent = "Rp " + total.toLocaleString("id-ID");
    els.feeSummary.style.display = "block";
  }

  // ═══ QRIS ENGINE ═══
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
    const tag54 =
      "54" + String(amtStr.length).padStart(2, "0") + amtStr;
    body = body.includes("5802ID")
      ? body.replace("5802ID", tag54 + "5802ID")
      : body + tag54;
    const w = body + "6304";
    return w + crc16(w);
  }

  function generateDynamicQR(product) {
    const totalAmount = product.price + currentFee;
    currentTotal = totalAmount;
    const result = convertMinimal(config.qrisString, totalAmount);
    if (crc16(result.slice(0, -4)) !== result.slice(-4)) {
      alert("CRC tidak valid.");
      els.qrLoading.style.display = "none";
      els.qrEmpty.style.display = "block";
      return;
    }
    showQR(result, product, totalAmount);
  }

  // ═══ SHOW QR ═══
  function showQR(qrisString, product, totalAmount) {
    els.qrBox.innerHTML = "";
    new QRCode(els.qrBox, {
      text: qrisString,
      width: 230,
      height: 230,
      colorDark: "#000",
      colorLight: "#fff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    const displayName =
      currentFee > 0 ? product.name + " + Fee" : product.name;
    els.qrProductBadge.textContent = displayName;
    els.qrAmount.textContent =
      "Rp " + totalAmount.toLocaleString("id-ID");
    els.qrLoading.style.display = "none";
    els.qrResult.style.display = "flex";
    if (currentFee > 0) updateFeeSummary();
    const payload = btoa(
      JSON.stringify({ qris: qrisString, name: displayName, price: totalAmount })
    );
    const link =
      window.location.origin +
      window.location.pathname +
      "#pay=" +
      payload;
    els.paymentLinkInput.value = link;
    els.btnCopyLink.textContent = "📋 Copy";
    els.btnCopyLink.classList.remove("copied");
    addTransaction(product, totalAmount);
    els.qrResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    playSound("success");
  }

  function copyPaymentLink() {
    const link = els.paymentLinkInput.value;
    navigator.clipboard.writeText(link).then(() => {
      els.btnCopyLink.textContent = "✓ Tersalin!";
      els.btnCopyLink.classList.add("copied");
      setTimeout(() => {
        els.btnCopyLink.textContent = "📋 Copy";
        els.btnCopyLink.classList.remove("copied");
      }, 2500);
    });
  }

  function downloadQR() {
    const canvas = document.querySelector("#qr-box canvas");
    if (!canvas) return;
    const pad = 20,
      c2 = document.createElement("canvas");
    c2.width = canvas.width + pad * 2;
    c2.height = canvas.height + pad * 2;
    const ctx = c2.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c2.width, c2.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement("a");
    a.download =
      "3qris-" + (currentProduct ? currentProduct.name.replace(/\s+/g, "-") : "qr") + ".png";
    a.href = c2.toDataURL("image/png");
    a.click();
  }

  function nextTransaction() {
    els.qrResult.style.display = "none";
    els.qrEmpty.style.display = "block";
    document
      .querySelectorAll(".product-card")
      .forEach((c) => c.classList.remove("selected"));
    currentProduct = null;
    currentFee = 0;
    els.feeEnabled.checked = false;
    els.feeOptions.classList.remove("show");
    els.feeSummary.style.display = "none";
  }

  // ═══ TRANSACTIONS ═══
  function addTransaction(product, totalAmount) {
    const time = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const tx = {
      name: product.name,
      price: totalAmount,
      time: time,
      fee: currentFee,
    };
    transactions.unshift(tx);
    if (transactions.length > 20) transactions.pop();
    renderTxLog();
    if (isGuest) {
      saveToLocal("transactions", transactions);
    } else {
      fetch(API_URL + "/transaction", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(tx),
      }).catch((err) => console.log("Gagal simpan transaksi:", err));
    }
  }

  function renderTxLog() {
    if (!transactions.length) {
      els.txList.innerHTML =
        '<div class="tx-empty">Belum ada transaksi</div>';
      return;
    }
    els.txList.innerHTML = transactions
      .map(
        (tx) =>
          '<div class="tx-item"><div><div class="tx-name">' +
          escapeHtml(tx.name) +
          (tx.fee > 0
            ? ' <span style="color:var(--yellow);font-size:11px;">+Fee</span>'
            : "") +
          '</div><div class="tx-time">' +
          tx.time +
          '</div></div><div class="tx-price">Rp ' +
          tx.price.toLocaleString("id-ID") +
          "</div></div>"
      )
      .join("");
  }

  // ═══ SETTINGS ═══
  function openSettings() {
    els.settingsModal.classList.add("open");
  }
  function closeSettings() {
    els.settingsModal.classList.remove("open");
  }
  function goSetup() {
    closeSettings();
    els.kasirScreen.style.display = "none";
    els.setupScreen.style.display = "flex";
    els.qrisManual.value = config.qrisString;
    els.productList.innerHTML = "";
    config.products.forEach((p) => addProductRow(p.name, p.price));
    if (isGuest) {
      removeFromLocal("config");
    }
  }

  function showErr(msg) {
    els.errMsg.textContent = msg;
    els.errMsg.style.display = "block";
  }
  function hideErr() {
    els.errMsg.style.display = "none";
  }

  // ═══ PAYMENT PAGE ═══
  function showPaymentPage(encoded) {
    els.setupScreen.style.display = "none";
    els.kasirScreen.style.display = "none";
    els.paymentScreen.style.display = "flex";
    try {
      const data = JSON.parse(atob(encoded));
      document.title = "Bayar " + data.name + " · 3QRIS";
      els.payProductName.textContent = data.name;
      els.payAmountDisplay.textContent =
        "Rp " + data.price.toLocaleString("id-ID");
      els.paymentQrBox.innerHTML = "";
      new QRCode(els.paymentQrBox, {
        text: data.qris,
        width: 240,
        height: 240,
        colorDark: "#000",
        colorLight: "#fff",
        correctLevel: QRCode.CorrectLevel.M,
      });
      _payData = data;
    } catch (e) {
      els.paymentContent.innerHTML =
        '<div class="pay-error"><div class="exp-icon">❌</div><h3>Link Tidak Valid</h3><p>Link pembayaran ini rusak atau sudah tidak berlaku.<br>Minta link baru dari penjual.</p></div>';
    }
  }

  function downloadPaymentQR() {
    const canvas = document.querySelector("#payment-qr-box canvas");
    if (!canvas) return;
    const pad = 20,
      c2 = document.createElement("canvas");
    c2.width = canvas.width + pad * 2;
    c2.height = canvas.height + pad * 2;
    const ctx = c2.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c2.width, c2.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement("a");
    a.download =
      "3qris-" + ((_payData?.name || "bayar").replace(/\s+/g, "-")) + ".png";
    a.href = c2.toDataURL("image/png");
    a.click();
  }

  // ═══ ADMIN PANEL ═══
  function openAdmin() {
    els.adminModal.classList.add("open");
    loadAdminStats();
    switchAdminTab("users");
  }
  function closeAdmin() {
    els.adminModal.classList.remove("open");
  }

  function switchAdminTab(tab) {
    document.querySelectorAll("#adminModal .welcome-tab").forEach((t, i) => {
      t.classList.toggle(
        "active",
        (tab === "users" && i === 0) || (tab === "transactions" && i === 1)
      );
    });
    els.adminTabUsers.style.display = tab === "users" ? "" : "none";
    els.adminTabTransactions.style.display =
      tab === "transactions" ? "" : "none";
    if (tab === "users") loadAdminUsers();
    if (tab === "transactions") loadAdminTransactions();
  }

  async function loadAdminStats() {
    try {
      const data = await apiFetch(API_URL + "/admin/stats");
      els.statUsers.textContent = data.totalUsers || 0;
      els.statTx.textContent = data.totalTransactions || 0;
      els.statRevenue.textContent =
        "Rp " + (data.totalRevenue || 0).toLocaleString("id-ID");
      els.statToday.textContent =
        "Rp " + (data.todayRevenue || 0).toLocaleString("id-ID");
    } catch (e) {
      console.error("Gagal load stats:", e);
    }
  }

  async function loadAdminUsers() {
    els.adminUsersBody.innerHTML =
      '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted);">Loading...</td></tr>';
    try {
      const users = await apiFetch(API_URL + "/admin/users");
      if (!users.length) {
        els.adminUsersBody.innerHTML =
          '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted);">Belum ada user</td></tr>';
        return;
      }
      els.adminUsersBody.innerHTML = users
        .map(
          (u) =>
            '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:10px 8px;font-weight:600;">' +
            escapeHtml(u.username) +
            '</td>' +
            '<td style="padding:10px 8px;text-align:center;">' +
            '<span style="font-size:11px;padding:3px 8px;border-radius:99px;' +
            (u.role === "admin"
              ? 'background:rgba(234,179,8,0.15);color:var(--yellow);border:1px solid rgba(234,179,8,0.3);'
              : 'background:rgba(59,130,246,0.1);color:var(--accent-g);border:1px solid rgba(59,130,246,0.2);') +
            '">' +
            (u.role === "admin" ? "🛡 Admin" : "👤 User") +
            '</span></td>' +
            '<td style="padding:10px 8px;text-align:center;font-family:\'JetBrains Mono\',monospace;">' +
            (u.tx_count || 0) +
            '</td>' +
            '<td style="padding:10px 8px;text-align:right;font-family:\'JetBrains Mono\',monospace;color:var(--green);">Rp ' +
            (u.total_revenue || 0).toLocaleString("id-ID") +
            '</td>' +
            '<td style="padding:10px 8px;text-align:center;">' +
            (u.role === "user"
              ? '<button data-action="promote" data-userid="' +
                u.id +
                '" data-username="' +
                u.username +
                '" style="font-size:11px;padding:4px 10px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);color:var(--yellow);border-radius:6px;cursor:pointer;">⬆ Admin</button>'
              : u.id !== currentUser.id
              ? '<button data-action="demote" data-userid="' +
                u.id +
                '" data-username="' +
                u.username +
                '" style="font-size:11px;padding:4px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#fca5a5;border-radius:6px;cursor:pointer;">⬇ User</button>'
              : '<span style="font-size:11px;color:var(--muted);">(kamu)</span>') +
            "</td></tr>"
        )
        .join("");
    } catch (e) {
      els.adminUsersBody.innerHTML =
        '<tr><td colspan="5" style="padding:20px;text-align:center;color:#fca5a5;">Gagal load data</td></tr>';
    }
  }

  async function loadAdminTransactions() {
    els.adminTxBody.innerHTML =
      '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted);">Loading...</td></tr>';
    try {
      const txs = await apiFetch(API_URL + "/admin/transactions");
      if (!txs.length) {
        els.adminTxBody.innerHTML =
          '<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted);">Belum ada transaksi</td></tr>';
        return;
      }
      els.adminTxBody.innerHTML = txs
        .map(
          (tx) =>
            '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:10px 8px;font-weight:600;font-size:11px;">' +
            escapeHtml(tx.username || "user#" + tx.user_id) +
            '</td>' +
            '<td style="padding:10px 8px;">' +
            escapeHtml(tx.product) +
            '</td>' +
            '<td style="padding:10px 8px;text-align:right;font-family:\'JetBrains Mono\',monospace;color:var(--green);font-size:11px;">Rp ' +
            (tx.price || 0).toLocaleString("id-ID") +
            '</td>' +
            '<td style="padding:10px 8px;text-align:right;color:var(--muted);font-size:11px;">' +
            (tx.date || "-") +
            "</td></tr>"
        )
        .join("");
    } catch (e) {
      els.adminTxBody.innerHTML =
        '<tr><td colspan="4" style="padding:20px;text-align:center;color:#fca5a5;">Gagal load data</td></tr>';
    }
  }

  async function promoteUser(userId, username) {
    if (!confirm('Promosikan "' + username + '" menjadi Admin?')) return;
    try {
      await apiFetch(API_URL + "/admin/promote/" + userId, { method: "POST" });
      loadAdminUsers();
      loadAdminStats();
    } catch (e) {
      alert("Gagal: " + e.message);
    }
  }

  async function demoteUser(userId, username) {
    if (!confirm('Turunkan "' + username + '" dari Admin menjadi User?'))
      return;
    try {
      await apiFetch(API_URL + "/admin/demote/" + userId, { method: "POST" });
      loadAdminUsers();
      loadAdminStats();
    } catch (e) {
      alert("Gagal: " + e.message);
    }
  }

  // ═══ EVENT LISTENERS ═══
  function initEventListeners() {
    // --- Welcome Modal ---
    // Form submit (handles both button click and enter key)
    $("welcome-login")?.addEventListener("submit", handleLogin);
    $("welcome-register")?.addEventListener("submit", handleRegister);
    document.querySelector(".btn-welcome.guest")?.addEventListener("click", handleGuest);

    // Welcome tab switching
    document.querySelectorAll(".welcome-tab").forEach((tab, i) => {
      tab.addEventListener("click", function () {
        if (i === 0) switchWelcomeTab("login");
        else if (i === 1) switchWelcomeTab("register");
        else switchWelcomeTab("guest");
      });
    });

    // --- Setup Screen ---
    els.uploadZone.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
    els.uploadZone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.add("drag-over");
    });
    els.uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.add("drag-over");
    });
    els.uploadZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.remove("drag-over");
    });
    els.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => e.preventDefault());

    // Add product row button
    document.querySelector(".btn-add")?.addEventListener("click", () => addProductRow());

    // Start kasir button
    document.querySelector(".btn-start")?.addEventListener("click", startKasir);

    // Product list remove buttons (event delegation)
    els.productList.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-icon");
      if (btn) {
        const row = btn.closest(".product-row");
        if (row) row.remove();
      }
    });

    // --- Kasir Screen ---
    els.searchInput?.addEventListener("input", function () {
      renderProductGrid(this.value);
    });

    // Product grid (event delegation for product cards)
    initProductGridEvents();

    // Fee
    els.feeEnabled?.addEventListener("change", toggleFee);
    document.querySelectorAll(".fee-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const v = parseInt(this.dataset.fee);
        if (!isNaN(v)) setFee(v);
      });
    });
    document.querySelector(".fee-btn:last-child")?.addEventListener("click", showCustomFee);
    document.querySelector("#feeCustom .btn-confirm")?.addEventListener("click", applyCustomFee);
    els.feeCustomInput?.addEventListener("change", applyCustomFee);

    // QR Actions
    document.querySelector(".btn-dl")?.addEventListener("click", downloadQR);
    document.querySelector(".btn-next")?.addEventListener("click", nextTransaction);
    els.btnCopyLink?.addEventListener("click", copyPaymentLink);

    // Settings
    els.btnSettings?.addEventListener("click", openSettings);
    els.btnLogout?.addEventListener("click", handleLogout);
    els.btnAdmin?.addEventListener("click", openAdmin);

    // Settings Modal
    document.querySelector("#settingsModal .btn-cancel")?.addEventListener("click", closeSettings);
    document.querySelector("#settingsModal .btn-confirm")?.addEventListener("click", goSetup);

    // Admin Modal
    document.querySelector("#adminModal .btn-cancel")?.addEventListener("click", closeAdmin);
    document.querySelectorAll("#adminModal .welcome-tab").forEach((tab, i) => {
      tab.addEventListener("click", function () {
        switchAdminTab(i === 0 ? "users" : "transactions");
      });
    });

    // Admin users table events (delegation for promote/demote)
    els.adminUsersBody?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const userId = parseInt(btn.dataset.userid);
      const username = btn.dataset.username;
      if (action === "promote") await promoteUser(userId, username);
      else if (action === "demote") await demoteUser(userId, username);
    });

    // Nominal Modal
    document.querySelector("#nominalModal .btn-cancel")?.addEventListener("click", closeNominalModal);
    document.querySelector("#nominalModal .btn-confirm")?.addEventListener("click", confirmCustomNominal);
    els.customNominalInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmCustomNominal();
    });
    document.querySelectorAll("#nominalModal .quick-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const v = parseInt(this.textContent.replace(/[^0-9]/g, ""));
        if (!isNaN(v)) setQuickNominal(v);
      });
    });

    // Payment Page
    document.querySelector(".btn-pay-dl")?.addEventListener("click", downloadPaymentQR);
  }

  // ═══ INIT ═══
  function init() {
    cacheEls();

    // Hash-based routing
    if (window.location.hash.startsWith("#pay=")) {
      showPaymentPage(window.location.hash.slice(5));
      return;
    }

    // Check saved token
    const savedToken = loadFromLocal("token");
    if (savedToken) {
      authToken = savedToken;
      apiFetch(API_URL + "/me")
        .then((data) => {
          currentUser = data.user;
          isAdmin = data.user.role === "admin";
          isGuest = false;
          loadFromServer();
        })
        .catch(() => {
          authToken = null;
          currentUser = null;
          removeFromLocal("token");
          checkGuestOrWelcome();
        });
      return;
    }

    checkGuestOrWelcome();
  }

  function checkGuestOrWelcome() {
    const localConfig = loadFromLocal("config");
    if (localConfig && localConfig.qrisString) {
      isGuest = true;
      config = localConfig;
      const localTx = loadFromLocal("transactions") || [];
      transactions = localTx;
      renderKasir();
      return;
    }
    showWelcomeModal();
    startClock();
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      initEventListeners();
    });
  } else {
    init();
    initEventListeners();
  }
})();
