// =========================================================
// Hüseyin Bahçe | Ürün Kataloğu — yeni tasarım
// - Aynı veri kaynağı: Google Sheets CSV (+ JSONP yedeği)
// - Kategori görünümü + ürün görünümü + arama
// - Sepet + WhatsApp ile sipariş gönderme
// - Görsel görüntüleyici (lightbox)
// - Geçiş animasyonları (View Transitions API + yedek CSS)
// - Telefonun / tarayıcının geri tuşu uygulama içinde çalışır
// =========================================================
"use strict";

// ---------- Ayarlar ----------
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtVmDRnzdNDmXwYzrUfaNrBumsDNqsW6OQKEd_i93mgkvOH8hP3hXceb9SFVLdm-Mu3UgRyjfAZojt/pub?output=csv";

// Yedek yükleme yolu için tablonun dosya kimliği (docs.google.com/spreadsheets/d/<ID>/edit).
// Sayfa dosyadan (file://) açıldığında Google, yukarıdaki CSV isteğine izin vermiyor;
// bu durumda veriler aynı tablodan JSONP (script etiketi) ile çekilir.
const SHEET_ID = "143SSs0A7VOG16_qkJprD-zWmYDgkIhqLp7jQUzJlkXw";

const PHONE_DIGITS = "905394927471";
const CART_STORAGE_KEY = "hb_cart_v1";
const DEFAULT_WA_TEXT = "Merhaba, ürünler hakkında bilgi almak istiyorum.";

// İsteğe bağlı daha okunaklı kategori adları
const CATEGORY_LABELS = {
  GIDA: "Gıda",
  OYUNCAK: "Oyuncak",
  EV_TEMIZLIK: "Ev & Temizlik",
  KIRTASIYE: "Kırtasiye",
  PET: "Pet",
};

// ---------- İkonlar ----------
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  zoom:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg>',
};

// ---------- Elemanlar ----------
const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  appbar: $("#appbar"),
  status: $("#status"),
  search: $("#search"),
  searchClear: $("#searchClear"),

  statCats: $("#statCats"),
  catStats: $("#catStats"),
  hero: $("#introHero"),

  spotlight: $("#spotlight"),
  spotTrack: $("#spotTrack"),
  spotProgress: $("#spotProgress"),
  spotCounter: $("#spotCounter"),
  statProducts: $("#statProducts"),

  categoryView: $("#categoryView"),
  categories: $("#categories"),
  catEmpty: $("#catEmpty"),

  productView: $("#productView"),
  productBar: $("#productView .product-bar"),
  products: $("#products"),
  prodEmpty: $("#prodEmpty"),
  prodEmptyText: $("#prodEmptyText"),

  back: $("#back"),
  viewTitle: $("#viewTitle"),
  viewSubtitle: $("#viewSubtitle"),

  lightbox: $("#lightbox"),
  lbPanel: $("#lightbox .lightbox-panel"),
  lbMedia: $("#lightbox .lb-media"),
  lbImg: $("#lbImg"),
  lbTitle: $("#lbTitle"),
  lbSub: $("#lbSub"),
  lbCounter: $("#lbCounter"),
  lbPrev: $("#lightbox .lb-prev"),
  lbNext: $("#lightbox .lb-next"),
  lbClose: $("#lightbox .lb-close"),

  cartBar: $("#cartBar"),
  cartBarButton: $("#cartBarButton"),
  cartBarIcon: $("#cartBar .cart-bar-icon"),
  cartBarSub: $("#cartBarSub"),
  cartCount: $("#cartCount"),

  cartDrawer: $("#cartDrawer"),
  cartPanel: $("#cartDrawer .drawer-panel"),
  cartDrawerBackdrop: $("#cartDrawerBackdrop"),
  cartSummary: $("#cartSummary"),
  cartTotalRow: $("#cartTotalRow"),
  cartTotal: $("#cartTotal"),
  cartTotalNote: $("#cartTotalNote"),
  cartItems: $("#cartItems"),
  cartEmptyMsg: $("#cartEmptyMsg"),
  cartNote: $("#cartNote"),
  cartSend: $("#cartSend"),
  cartClear: $("#cartClear"),
  cartClose: $("#cartClose"),

  toast: $("#toast"),
};

// ---------- Durum ----------
const state = {
  products: [],
  view: "categories", // "categories" | "category" | "search"
  category: null,
  list: [], // ekranda listelenen ürünler
  catScrollY: 0,
};

let cart = []; // {id, name, category, pack, price, qty}

const ui = {
  cartOpen: false,
  lightboxOpen: false,
  lastFocus: null,
};

const lb = { list: [], index: 0 };

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// =========================================================
// Yardımcılar
// =========================================================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const FOLD_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
// Türkçe büyük/küçük harf + "cikolata" ile "çikolata" aynı sonucu versin
function fold(str) {
  return String(str || "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => FOLD_MAP[c] || c)
    .replace(/\s+/g, " ")
    .trim();
}

function retrigger(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

// ---------- Durum mesajı ----------
function showStatus(msg, type = "info", { retry = false } = {}) {
  els.status.innerHTML = `
    <div class="status-card">
      <p>${escapeHtml(msg)}</p>
      ${retry ? '<button class="status-retry" type="button" data-action="retry">Tekrar dene</button>' : ""}
    </div>`;
  els.status.classList.remove("hidden", "error");
  if (type === "error") els.status.classList.add("error");
}
function hideStatus() {
  els.status.classList.add("hidden");
  els.status.classList.remove("error");
  els.status.innerHTML = "";
}

// ---------- Geçmiş (history) ----------
function currentDepth() {
  return (history.state && history.state.depth) || 0;
}
function safePushState(st, url) {
  try {
    history.pushState(st, "", url);
  } catch {
    try { history.pushState(st, ""); } catch { /* yok say */ }
  }
}
function safeReplaceState(st, url) {
  try {
    history.replaceState(st, "", url);
  } catch {
    try { history.replaceState(st, ""); } catch { /* yok say */ }
  }
}
function baseUrl() {
  return location.pathname + location.search;
}
function categoryHash(cat) {
  return "#k=" + encodeURIComponent(cat);
}

// ---------- Kaydırma kilidi ----------
let lockCount = 0;
function lockScroll() {
  if (lockCount++ > 0) return;
  const sw = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (sw > 0) document.body.style.paddingRight = sw + "px";
}
function unlockScroll() {
  if (lockCount === 0) return;
  if (--lockCount > 0) return;
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
}

// ---------- Odak tuzağı ----------
function trapFocus(e, container) {
  if (e.key !== "Tab") return;
  const focusables = [...container.querySelectorAll(
    'button:not([disabled]), [href], textarea, input, [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// =========================================================
// WhatsApp
// =========================================================
function waLink(text) {
  return `https://wa.me/${PHONE_DIGITS}?text=${encodeURIComponent(text)}`;
}

function openWhatsAppWithText(text) {
  const url = waLink(text);
  const w = window.open(url, "_blank");
  if (w) {
    try { w.opener = null; } catch { /* yok say */ }
  } else {
    window.location.href = url;
  }
}

function bindContactLinks() {
  document
    .querySelectorAll('[data-role="header-whatsapp"], [data-role="footer-whatsapp"]')
    .forEach((a) => {
      a.href = waLink(DEFAULT_WA_TEXT);
    });
}

// =========================================================
// CSV
// =========================================================
function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  return semiCount > commaCount ? ";" : ",";
}

function splitCSVLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCSV(text) {
  const clean = text.trim();
  if (!clean) return [];

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCSVLine(lines.shift(), delimiter);

  return lines.map((line) => {
    const values = splitCSVLine(line, delimiter);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i] ?? ""));
    return obj;
  });
}

// Sütun başlıkları büyük/küçük harf veya boşluk farkıyla yazılsa da bulunur
function rowGetter(r) {
  const keys = Object.keys(r);
  return (name) => {
    if (r[name] !== undefined) return String(r[name] ?? "").trim();
    const key = keys.find((k) => fold(k) === name);
    return key ? String(r[key] ?? "").trim() : "";
  };
}

// "kampanya" sütununda "var" yazan ürünler kampanyalıdır
function isCampaignValue(v) {
  return ["var", "evet", "x", "1", "true"].includes(fold(v));
}

function normalizeRow(r) {
  const get = rowGetter(r);
  return {
    category: get("category"),
    name: get("name"),
    pack: get("pack"),
    image: get("image"),
    price: get("price"),
    campaign: isCampaignValue(get("kampanya")),
  };
}

// ---------- Fiyat ----------
// "180", "180 TL", "1.250", "1.250,50", "12,5" gibi yazımları sayıya çevirir
function parsePrice(value) {
  let s = String(value || "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(/,/g, ".");
    if ((s.match(/\./g) || []).length > 1) return null;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Ekranda gösterilecek fiyat: { value: "1.250", currency: true } ya da sayı değilse metnin kendisi
function displayPrice(value) {
  const n = parsePrice(value);
  if (n === null) return value ? { value: String(value).trim(), currency: false } : null;
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return {
    value: new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n),
    currency: true,
  };
}

function priceHTML(value, cls) {
  const p = displayPrice(value);
  if (!p) return "";
  return `<span class="${cls}">${escapeHtml(p.value)}${p.currency ? "<small>₺</small>" : ""}</span>`;
}

function validateProducts(rows) {
  return rows.filter((p) => p.category && p.name);
}

// =========================================================
// Kategori / görsel yardımcıları
// =========================================================
function categoryLabel(key) {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  // Tamamı büyük harf yazılmış kategori adlarını okunaklı hale getir (ör. "KEDİ MAMASI" → "Kedi Maması")
  if (!/[a-zçğıöşü]/.test(key) && /[A-ZÇĞİÖŞÜ]{3,}/.test(key)) {
    return key
      .toLocaleLowerCase("tr")
      .replace(/(^|[\s&\-/(])(\S)/g, (m, sep, ch) => sep + ch.toLocaleUpperCase("tr"));
  }
  return key;
}

function getCategories(products) {
  const map = new Map();
  products.forEach((p) => map.set(p.category, (map.get(p.category) || 0) + 1));
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key, "tr"));
}

function driveIdFrom(str) {
  if (!str) return null;
  const m = str.match(/(?:\/d\/|id=)([-\w]{25,})/);
  return m ? m[1] : null;
}

function resolveImageSrc(imageValue) {
  if (!imageValue) return "";
  const v = imageValue.trim();
  if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) {
    if (v.includes("drive.google.com")) {
      const id = driveIdFrom(v);
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
    }
    return v;
  }
  return "img/" + v;
}

function getPreviewImagesForCategory(catKey) {
  const seen = new Set();
  const out = [];
  for (const p of state.products) {
    if (p.category !== catKey || !p.image) continue;
    const src = resolveImageSrc(p.image);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    if (out.length >= 3) break;
  }
  return out;
}

function productById(id) {
  return state.products.find((p) => p.id === id);
}

// =========================================================
// Görünüm geçişleri
// =========================================================
let vtNamed = [];
function setVtName(el, name) {
  if (!el) return;
  el.style.viewTransitionName = name;
  vtNamed.push(el);
}
function clearVtNames() {
  vtNamed.forEach((el) => (el.style.viewTransitionName = ""));
  vtNamed = [];
}

/**
 * Görünümler arası geçiş.
 * dir: "forward" | "back" | "fade"
 * sharedFrom / sharedTo: başlığın bir görünümden diğerine "uçarak" geçmesi için
 */
function transition(update, { dir = "forward", sharedFrom = null, sharedTo = null } = {}) {
  const root = document.documentElement;
  const reduce = prefersReducedMotion();

  if (typeof document.startViewTransition === "function" && !reduce) {
    clearVtNames();
    root.dataset.vtDir = dir;
    setVtName(sharedFrom, "vt-title");

    let vt;
    try {
      vt = document.startViewTransition(() => {
        clearVtNames();
        update();
        const to = typeof sharedTo === "function" ? sharedTo() : sharedTo;
        if (to && sharedFrom) setVtName(to, "vt-title");
      });
    } catch {
      clearVtNames();
      delete root.dataset.vtDir;
      update();
      return;
    }
    vt.finished.finally(() => {
      clearVtNames();
      delete root.dataset.vtDir;
    });
    return;
  }

  update();

  if (!reduce) {
    const view = state.view === "categories" ? els.categoryView : els.productView;
    const cls = dir === "back" ? "view-enter-back" : "view-enter-forward";
    view.classList.remove("view-enter-back", "view-enter-forward");
    void view.offsetWidth;
    view.classList.add(cls);
  }
}

// ---------- Kademeli giriş animasyonu ----------
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          let n = 0;
          entries
            .filter((en) => en.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
            .forEach((en) => {
              const el = en.target;
              el.style.setProperty("--d", `${Math.min(n++, 10) * 45}ms`);
              el.classList.add("is-in");
              revealObserver.unobserve(el);
            });
        },
        { rootMargin: "0px 0px -4% 0px", threshold: 0.01 }
      )
    : null;

function observeReveal(nodes) {
  if (!revealObserver || prefersReducedMotion()) {
    nodes.forEach((n) => n.classList.add("is-in"));
    return;
  }
  nodes.forEach((n) => revealObserver.observe(n));
}

// =========================================================
// İskeletler
// =========================================================
function renderCategorySkeletons() {
  els.categories.innerHTML = Array.from({ length: 8 })
    .map(
      () => `
      <div class="skel" aria-hidden="true">
        <div class="skel-box"></div>
        <div class="skel-line"></div>
        <div class="skel-line short"></div>
      </div>`
    )
    .join("");
}

// =========================================================
// Kategoriler
// =========================================================
function renderCategories() {
  const cats = getCategories(state.products);
  const campaignCats = new Set(state.products.filter((p) => p.campaign).map((p) => p.category));

  if (cats.length === 0) {
    els.categories.innerHTML = "";
    els.catEmpty.classList.remove("hidden");
    return;
  }
  els.catEmpty.classList.add("hidden");

  els.categories.innerHTML = cats
    .map((c, i) => {
      const label = categoryLabel(c.key);
      const imgs = getPreviewImagesForCategory(c.key);

      const mosaic = imgs.length
        ? `<span class="cat-mosaic n${imgs.length}">
            ${imgs
              .map(
                (src, j) => `
              <span class="cat-tile t${j}">
                <img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"
                     onload="this.classList.add('is-loaded')"
                     onerror="this.parentNode.classList.add('is-broken')">
              </span>`
              )
              .join("")}
          </span>`
        : `<span class="cat-mosaic n0"><span class="cat-initial">${escapeHtml(label.charAt(0))}</span></span>`;

      return `
        <button class="cat-card reveal" type="button" data-cat="${escapeHtml(c.key)}" data-tint="${i % 5}"
                aria-label="${escapeHtml(label)}, ${c.count} ürün">
          ${mosaic}
          ${campaignCats.has(c.key) ? '<span class="cat-tag">Kampanya</span>' : ""}
          <span class="cat-body">
            <span class="cat-title">${escapeHtml(label)}</span>
            <span class="cat-meta">${c.count} ürün</span>
          </span>
          <span class="cat-arrow" aria-hidden="true">${ICON.arrow}</span>
        </button>`;
    })
    .join("");

  observeReveal(els.categories.querySelectorAll(".reveal"));
}

// Masaüstü hero alanında farklı kategorilerden üç ürün görseli
function renderHeroArt() {
  const box = document.getElementById("heroArt");
  if (!box) return;
  const picks = [];
  const usedCats = new Set();
  for (const p of state.products) {
    if (picks.length >= 3) break;
    if (usedCats.has(p.category)) continue;
    const src = resolveImageSrc(p.image);
    if (!src) continue;
    usedCats.add(p.category);
    picks.push(src);
  }
  box.innerHTML = picks
    .map(
      (src, i) => `<div class="hero-card c${i}">
        <img src="${escapeHtml(src)}" alt="" decoding="async" onerror="this.parentNode.remove()">
      </div>`
    )
    .join("");
}

// =========================================================
// Kampanya vitrini (spotlight)
// =========================================================
const spot = { list: [], index: 0, pausers: new Set(), inView: true, leaveTimer: null };
// index.html eski sürümde kalırsa (vitrin bölümü yoksa) site yine de çalışsın
const hasSpot = !!(els.spotlight && els.spotTrack && els.spotProgress && els.spotCounter);

function spotSlideHTML(p, i, n) {
  const src = resolveImageSrc(p.image);
  const name = escapeHtml(p.name);
  const meta = [categoryLabel(p.category), p.pack].filter(Boolean).map(escapeHtml).join('<span class="sep">•</span>');
  const price = priceHTML(p.price, "spot-price-value");

  return `
    <article class="spot-slide" data-id="${p.id}" data-index="${i}" role="group"
             aria-roledescription="slayt" aria-label="${i + 1} / ${n}: ${name}">
      <div class="spot-stage">
        <span class="spot-halo" aria-hidden="true"></span>
        <div class="spot-float">
          <div class="spot-bob">
            <button class="spot-tile${src ? "" : " no-image"}" type="button" data-action="zoom"
                    aria-label="${name} görselini büyüt" ${src ? "" : "disabled"}>
              ${src ? `<img src="${escapeHtml(src)}" alt="${name}" decoding="async"
                     onload="this.classList.add('is-loaded')"
                     onerror="this.parentNode.classList.add('is-broken')">` : ""}
              <span class="media-fallback">${ICON.image}Görsel yok</span>
            </button>
            <span class="spot-ribbon" aria-hidden="true">Kampanya</span>
          </div>
        </div>
        <span class="spot-floor" aria-hidden="true"></span>
      </div>
      <div class="spot-info">
        ${meta ? `<div class="spot-meta">${meta}</div>` : "<div></div>"}
        <h3 class="spot-name">${name}</h3>
        <div class="spot-buy">
          ${price ? `<div class="spot-price"><span class="spot-price-label">Kampanya fiyatı</span>${price}</div>` : "<div></div>"}
          <div class="prod-controls spot-controls">${buildControlsHTML(p.id, qtyOf(p.id))}</div>
        </div>
      </div>
    </article>`;
}

function renderSpotlight() {
  if (!hasSpot) {
    spot.list = [];
    if (els.hero) els.hero.classList.remove("hidden");
    renderHeroArt();
    return;
  }
  spot.list = state.products.filter((p) => p.campaign);
  els.spotlight.classList.remove("is-loading");

  if (!spot.list.length) {
    // Kampanya yoksa eski karşılama alanı gösterilir
    els.spotlight.classList.add("hidden");
    els.spotTrack.innerHTML = "";
    els.hero.classList.remove("hidden");
    renderHeroArt();
    return;
  }

  els.hero.classList.add("hidden");
  els.spotlight.classList.remove("hidden");
  const n = spot.list.length;
  els.spotlight.classList.toggle("is-single", n === 1);
  els.spotlight.classList.toggle("no-autoplay", prefersReducedMotion());

  els.spotTrack.innerHTML = spot.list.map((p, i) => spotSlideHTML(p, i, n)).join("");
  els.spotProgress.innerHTML =
    n > 1
      ? spot.list
          .map(
            (p, i) => `<button class="spot-seg" type="button" data-seg="${i}" aria-label="${i + 1}. kampanyaya git">
                <span class="spot-seg-track"><span class="spot-seg-fill"></span></span>
              </button>`
          )
          .join("")
      : "";

  // Önbellekten gelen görseller
  els.spotTrack.querySelectorAll(".spot-tile img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
  });

  spot.index = Math.min(spot.index, n - 1);
  goSpot(spot.index, 1, { initial: true });
}

function goSpot(next, dir = 1, { initial = false } = {}) {
  if (!hasSpot) return;
  const n = spot.list.length;
  if (!n) return;
  next = ((next % n) + n) % n;

  const slides = els.spotTrack.children;
  const prev = slides[spot.index];
  const cur = slides[next];
  if (!cur) return;

  els.spotTrack.style.setProperty("--dir", dir < 0 ? -1 : 1);

  if (prev && prev !== cur) {
    prev.classList.remove("is-active");
    if (!initial && !prefersReducedMotion()) {
      prev.classList.add("is-leaving");
      clearTimeout(spot.leaveTimer);
      spot.leaveTimer = setTimeout(() => prev.classList.remove("is-leaving"), 480);
    }
  }
  [...slides].forEach((s) => {
    if (s !== cur && s !== prev) s.classList.remove("is-active", "is-leaving");
  });
  cur.classList.remove("is-leaving");
  if (cur.classList.contains("is-active")) {
    cur.classList.remove("is-active");
    void cur.offsetWidth;
  }
  cur.classList.add("is-active");

  spot.index = next;
  els.spotCounter.textContent = `${next + 1} / ${n}`;

  [...els.spotProgress.children].forEach((seg, i) => {
    seg.classList.toggle("is-done", i < next);
    seg.setAttribute("aria-current", i === next ? "true" : "false");
    if (i === next) retrigger(seg, "is-active");
    else seg.classList.remove("is-active");
  });

  updateSpotPlayState();
}

function updateSpotPlayState() {
  if (!hasSpot) return;
  const paused =
    spot.pausers.size > 0 || !spot.inView || document.hidden || ui.cartOpen || ui.lightboxOpen;
  els.spotlight.classList.toggle("is-paused", paused);
}

function setSpotPause(reason, on) {
  if (on) spot.pausers.add(reason);
  else spot.pausers.delete(reason);
  updateSpotPlayState();
}

// İlerleme çubuğu dolunca sonraki kampanyaya geç (süre CSS'teki --spot-dur)
if (hasSpot) {
els.spotProgress.addEventListener("animationend", (e) => {
  if (e.animationName !== "spot-fill" || prefersReducedMotion()) return;
  goSpot(spot.index + 1, 1);
});
els.spotProgress.addEventListener("click", (e) => {
  const seg = e.target.closest("[data-seg]");
  if (!seg) return;
  const i = Number(seg.dataset.seg);
  if (i !== spot.index) goSpot(i, i > spot.index ? 1 : -1);
});
els.spotlight.addEventListener("click", (e) => {
  const b = e.target.closest("[data-spot]");
  if (!b) return;
  goSpot(spot.index + (b.dataset.spot === "next" ? 1 : -1), b.dataset.spot === "next" ? 1 : -1);
});

// Kaydırma (swipe) ve basılı tutunca durdurma
let spotTouch = null;
els.spotTrack.addEventListener(
  "touchstart",
  (e) => {
    const t = e.changedTouches[0];
    spotTouch = { x: t.clientX, y: t.clientY };
    setSpotPause("touch", true);
  },
  { passive: true }
);
els.spotTrack.addEventListener(
  "touchend",
  (e) => {
    setSpotPause("touch", false);
    if (!spotTouch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - spotTouch.x;
    const dy = t.clientY - spotTouch.y;
    spotTouch = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      goSpot(spot.index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
  },
  { passive: true }
);
els.spotTrack.addEventListener("touchcancel", () => setSpotPause("touch", false), { passive: true });
els.spotlight.addEventListener("pointerenter", (e) => {
  if (e.pointerType === "mouse") setSpotPause("hover", true);
});
els.spotlight.addEventListener("pointerleave", () => setSpotPause("hover", false));
els.spotlight.addEventListener("focusin", () => setSpotPause("focus", true));
els.spotlight.addEventListener("focusout", (e) => {
  if (!els.spotlight.contains(e.relatedTarget)) setSpotPause("focus", false);
});
els.spotlight.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") goSpot(spot.index + 1, 1);
  else if (e.key === "ArrowLeft") goSpot(spot.index - 1, -1);
});
document.addEventListener("visibilitychange", updateSpotPlayState);
if ("IntersectionObserver" in window) {
  new IntersectionObserver(
    (entries) => {
      spot.inView = entries[0].isIntersecting;
      updateSpotPlayState();
    },
    { threshold: 0.35 }
  ).observe(els.spotlight);
}
} // hasSpot

function findCategoryCard(catKey) {
  return [...els.categories.querySelectorAll(".cat-card")].find((b) => b.dataset.cat === catKey) || null;
}

// Sayıları kısa bir animasyonla say
function countUp(el, to) {
  if (!el) return;
  if (prefersReducedMotion() || !to) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(to * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// =========================================================
// Ürünler
// =========================================================
function qtyOf(id) {
  const item = cart.find((i) => i.id === id);
  return item ? item.qty : 0;
}

function buildControlsHTML(id, qty) {
  if (qty > 0) {
    return `
      <div class="stepper" data-id="${id}">
        <button class="step-btn" type="button" data-action="dec" aria-label="Azalt">${ICON.minus}</button>
        <span class="step-qty" aria-live="polite">${qty}</span>
        <button class="step-btn" type="button" data-action="inc" aria-label="Artır">${ICON.plus}</button>
        <button class="step-remove" type="button" data-action="remove" aria-label="Sil" title="Sil">${ICON.trash}</button>
      </div>`;
  }
  return `
    <button class="add-btn" type="button" data-action="add" data-id="${id}">
      ${ICON.plus}<span>Sepete Ekle</span>
    </button>`;
}

function renderProducts(list, { showCategory = false } = {}) {
  state.list = list.slice();

  if (!list.length) {
    els.products.innerHTML = "";
    els.prodEmpty.classList.remove("hidden");
    return;
  }
  els.prodEmpty.classList.add("hidden");

  els.products.innerHTML = list
    .map((p) => {
      const src = resolveImageSrc(p.image);
      const name = escapeHtml(p.name);

      const media = src
        ? `<button class="prod-media" type="button" data-action="zoom" aria-label="${name} görselini büyüt">
             <img src="${escapeHtml(src)}" alt="${name}" loading="lazy" decoding="async"
                  onload="this.classList.add('is-loaded');this.parentNode.classList.add('is-ready')"
                  onerror="this.parentNode.classList.add('is-broken')">
             <span class="media-fallback">${ICON.image}Görsel yok</span>
             <span class="zoom-hint" aria-hidden="true">${ICON.zoom}</span>
           </button>`
        : `<div class="prod-media no-image">
             <span class="media-fallback">${ICON.image}Görsel yok</span>
           </div>`;

      return `
        <article class="prod-card reveal${p.campaign ? " is-campaign" : ""}" data-id="${p.id}">
          <div class="prod-media-wrap">
            ${media}
            ${p.campaign ? '<span class="prod-badge">Kampanya</span>' : ""}
          </div>
          <div class="prod-body">
            ${showCategory ? `<div class="prod-cat">${escapeHtml(categoryLabel(p.category))}</div>` : ""}
            <h3 class="prod-name">${name}</h3>
            ${p.pack ? `<div class="prod-pack">${escapeHtml(p.pack)}</div>` : ""}
            ${p.campaign ? priceHTML(p.price, "prod-price") : ""}
            <div class="prod-controls">${buildControlsHTML(p.id, qtyOf(p.id))}</div>
          </div>
        </article>`;
    })
    .join("");

  // Önbellekten gelen görseller için
  els.products.querySelectorAll(".prod-media img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add("is-loaded");
      img.parentNode.classList.add("is-ready");
    }
  });

  observeReveal(els.products.querySelectorAll(".reveal"));
}

// Sepet değişince yalnızca ilgili kartın kontrolleri güncellenir (görseller yeniden yüklenmez)
function syncCard(card) {
  const id = Number(card.dataset.id);
  if (!Number.isFinite(id)) return;
  const qty = qtyOf(id);
  const slot = card.querySelector(".prod-controls");
  if (!slot) return;

  const stepper = slot.querySelector(".stepper");
  const hadFocus = slot.contains(document.activeElement);

  if (qty > 0 && stepper) {
    const q = stepper.querySelector(".step-qty");
    if (q && q.textContent !== String(qty)) {
      q.textContent = qty;
      retrigger(q, "tick");
    }
    return;
  }
  if ((qty > 0 && !stepper) || (qty === 0 && stepper)) {
    slot.innerHTML = buildControlsHTML(id, qty);
    const el = slot.firstElementChild;
    if (el && !prefersReducedMotion()) el.classList.add("swap-in");
    if (hadFocus) {
      const f = slot.querySelector('[data-action="inc"]') || slot.querySelector('[data-action="add"]');
      if (f) f.focus({ preventScroll: true });
    }
  }
}

function syncVisibleProductCardsWithCart() {
  els.products.querySelectorAll(".prod-card[data-id]").forEach(syncCard);
  if (els.spotTrack) els.spotTrack.querySelectorAll(".spot-slide[data-id]").forEach(syncCard);
}

// =========================================================
// Görünümler
// =========================================================
function showCategoriesNow({ restoreScroll = true } = {}) {
  state.view = "categories";
  state.category = null;
  els.productView.classList.add("hidden");
  els.categoryView.classList.remove("hidden");
  els.viewSubtitle.textContent = "";
  window.scrollTo(0, restoreScroll ? state.catScrollY || 0 : 0);
  updateScrollState();
}

function showProductsNow(title, subtitle, list, opts = {}) {
  els.categoryView.classList.add("hidden");
  els.productView.classList.remove("hidden");
  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = subtitle;
  renderProducts(list, opts);
  window.scrollTo(0, 0);
  updateScrollState();
}

function openCategory(catKey, { fromHistory = false, dir = "forward", sharedFrom = null } = {}) {
  if (state.view === "categories") state.catScrollY = window.scrollY;

  const label = categoryLabel(catKey);
  const filtered = state.products.filter((p) => p.category === catKey);

  if (!fromHistory) {
    safePushState({ view: "category", cat: catKey, depth: currentDepth() + 1 }, categoryHash(catKey));
  }

  transition(
    () => {
      state.view = "category";
      state.category = catKey;
      showProductsNow(label, `${filtered.length} ürün`, filtered);
    },
    { dir, sharedFrom, sharedTo: sharedFrom ? els.viewTitle : null }
  );
}

function goCategories({ fromHistory = false } = {}) {
  const prevCat = state.view === "category" ? state.category : null;

  if (!fromHistory) {
    safeReplaceState({ view: "categories", depth: 0 }, baseUrl());
  }

  transition(() => showCategoriesNow({ restoreScroll: true }), {
    dir: "back",
    sharedFrom: prevCat ? els.viewTitle : null,
    sharedTo: prevCat ? () => findCategoryCard(prevCat)?.querySelector(".cat-title") : null,
  });
}

// Uygulama içi "geri": geçmişte bizim eklediğimiz bir adım varsa tarayıcı geri tuşu gibi davran
function navigateBack() {
  if (currentDepth() > 0) {
    history.back();
  } else {
    clearSearchInput();
    goCategories();
  }
}

function navigateHome() {
  const d = currentDepth();
  if (d > 0) {
    history.go(-d);
  } else if (state.view !== "categories") {
    clearSearchInput();
    goCategories();
  } else {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

function applyRoute(st) {
  if (st.view === "category" && st.cat) {
    if (state.view !== "category" || state.category !== st.cat) {
      const exists = state.products.some((p) => p.category === st.cat);
      clearSearchInput();
      if (exists) {
        openCategory(st.cat, { fromHistory: true, dir: state.view === "categories" ? "forward" : "fade" });
      } else {
        goCategories({ fromHistory: true });
      }
    }
    return;
  }
  if (st.view === "search") return; // ileri tuşuyla aramaya dönüş: mevcut görünüm korunur

  if (state.view !== "categories") {
    clearSearchInput();
    goCategories({ fromHistory: true });
  }
}

function routeFromHash() {
  const m = location.hash.match(/^#k=(.+)$/);
  if (m) {
    try { return { view: "category", cat: decodeURIComponent(m[1]), depth: 0 }; } catch { /* yok say */ }
  }
  return { view: "categories", depth: 0 };
}

function onPopState(e) {
  const st = e.state || routeFromHash();
  if (ui.lightboxOpen && st.overlay !== "lightbox") closeLightbox({ fromHistory: true });
  if (ui.cartOpen && st.overlay !== "cart") closeCart({ fromHistory: true });
  if (st.overlay) return;
  applyRoute(st);
}

// =========================================================
// Arama
// =========================================================
let searchTimer = null;

function clearSearchInput() {
  els.search.value = "";
  els.searchClear.hidden = true;
}

function runSearch() {
  const q = fold(els.search.value);
  els.searchClear.hidden = !els.search.value;

  if (!q) {
    if (state.view === "search") {
      if (history.state && history.state.view === "search") {
        history.back();
      } else if (state.category) {
        openCategory(state.category, { fromHistory: true, dir: "fade" });
      } else {
        goCategories({ fromHistory: true });
      }
    }
    return;
  }

  const results = state.products.filter((p) => p._s.includes(q));
  const title = `“${els.search.value.trim()}”`;
  const subtitle = `${results.length} ürün bulundu`;
  els.prodEmptyText.textContent = `“${els.search.value.trim()}” için sonuç bulunamadı.`;

  if (state.view !== "search") {
    if (state.view === "categories") state.catScrollY = window.scrollY;
    safePushState(
      { view: "search", cat: state.category, depth: currentDepth() + 1 },
      location.hash ? location.pathname + location.search + location.hash : baseUrl()
    );
    transition(
      () => {
        state.view = "search";
        showProductsNow(title, subtitle, results, { showCategory: true });
      },
      { dir: "fade" }
    );
  } else {
    els.viewTitle.textContent = title;
    els.viewSubtitle.textContent = subtitle;
    renderProducts(results, { showCategory: true });
  }
}

// =========================================================
// Görsel görüntüleyici
// =========================================================
function openLightbox(productId, list = state.list) {
  lb.list = list.filter((p) => resolveImageSrc(p.image));
  lb.index = lb.list.findIndex((p) => p.id === productId);
  if (lb.index < 0) return;

  ui.lastFocus = document.activeElement;
  showLightboxItem(0);

  ui.lightboxOpen = true;
  updateSpotPlayState();
  els.lightbox.classList.add("is-open");
  els.lightbox.setAttribute("aria-hidden", "false");
  lockScroll();
  safePushState({ ...(history.state || {}), overlay: "lightbox", depth: currentDepth() + 1 });
  setTimeout(() => els.lbClose.focus({ preventScroll: true }), 50);
}

function showLightboxItem(dir) {
  const p = lb.list[lb.index];
  if (!p) return;
  const src = resolveImageSrc(p.image);
  const img = els.lbImg;

  els.lbMedia.classList.add("is-loading");
  img.classList.remove("is-loaded", "slide-next", "slide-prev");

  const onLoad = () => {
    els.lbMedia.classList.remove("is-loading");
    img.classList.add("is-loaded");
    if (dir && !prefersReducedMotion()) {
      void img.offsetWidth;
      img.classList.add(dir > 0 ? "slide-next" : "slide-prev");
    }
  };
  img.onload = onLoad;
  img.onerror = () => els.lbMedia.classList.remove("is-loading");
  img.alt = p.name || "Ürün görseli";

  const abs = new URL(src, location.href).href;
  if (img.src === abs && img.complete && img.naturalWidth > 0) onLoad();
  else img.src = src;

  els.lbTitle.textContent = p.name || "";
  els.lbSub.textContent = [p.category ? categoryLabel(p.category) : "", p.pack || ""].filter(Boolean).join(" • ");
  els.lbCounter.textContent = `${lb.index + 1} / ${lb.list.length}`;
  els.lbPrev.disabled = lb.index === 0;
  els.lbNext.disabled = lb.index === lb.list.length - 1;

  // komşu görselleri önceden yükle
  [lb.list[lb.index - 1], lb.list[lb.index + 1]].forEach((n) => {
    if (n) new Image().src = resolveImageSrc(n.image);
  });
}

function lbGo(delta) {
  const next = lb.index + delta;
  if (next < 0 || next >= lb.list.length) return;
  lb.index = next;
  showLightboxItem(delta);
}

function closeLightbox({ fromHistory = false } = {}) {
  if (!ui.lightboxOpen) return;
  if (!fromHistory && history.state && history.state.overlay === "lightbox") {
    history.back(); // popstate tekrar çağıracak
    return;
  }
  ui.lightboxOpen = false;
  updateSpotPlayState();
  els.lightbox.classList.remove("is-open");
  els.lightbox.setAttribute("aria-hidden", "true");
  unlockScroll();
  setTimeout(() => {
    if (!ui.lightboxOpen) els.lbImg.removeAttribute("src");
  }, 400);
  if (ui.lastFocus && document.contains(ui.lastFocus)) ui.lastFocus.focus({ preventScroll: true });
}

// Dokunmatik kaydırma
let touchStart = null;
function onLbTouchStart(e) {
  const t = e.changedTouches[0];
  touchStart = { x: t.screenX, y: t.screenY };
}
function onLbTouchEnd(e) {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.screenX - touchStart.x;
  const dy = t.screenY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
    lbGo(dx > 0 ? -1 : 1);
  } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
    closeLightbox();
  }
}

// =========================================================
// Sepet
// =========================================================
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    cart = parsed
      .map((item) => ({
        id: item.id,
        name: item.name || "",
        category: item.category || "",
        pack: item.pack || "",
        price: item.price || "",
        qty: typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
      }))
      .filter((i) => i.id !== undefined);
  } catch (err) {
    console.warn("Sepet geri yüklenemedi", err);
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.warn("Sepet kaydedilemedi", err);
  }
}

// Tablo satırları değişirse kayıtlı sepet yanlış ürüne bağlanmasın: ad/kategori/paket ile yeniden eşle
function reconcileCart() {
  let orphan = -1;
  const merged = new Map();
  cart.forEach((item) => {
    const match = state.products.find(
      (p) => p.name === item.name && p.category === item.category && (p.pack || "") === (item.pack || "")
    );
    const id = match ? match.id : orphan--;
    const prev = merged.get(id);
    if (prev) prev.qty += item.qty;
    else merged.set(id, { ...item, id });
  });
  cart = [...merged.values()];
}

// Sepetteki ürünün güncel birim fiyatı (tablodaki fiyat; yoksa eklendiği andaki fiyat)
function unitPriceOf(item) {
  const p = productById(item.id);
  const raw = p && p.name === item.name ? p.price : item.price;
  return parsePrice(raw);
}

function formatTL(n) {
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function getCartTotals() {
  let totalQty = 0;
  let totalPrice = 0;
  let pricedLines = 0;
  for (const item of cart) {
    totalQty += item.qty;
    const unit = unitPriceOf(item);
    if (unit !== null) {
      totalPrice += unit * item.qty;
      pricedLines++;
    }
  }
  return { totalQty, lines: cart.length, totalPrice, pricedLines };
}

function summaryText({ withPrice = false } = {}) {
  const { totalQty, lines, totalPrice, pricedLines } = getCartTotals();
  let text = `${lines} çeşit · ${totalQty} adet`;
  if (withPrice && pricedLines) text += ` · ${formatTL(totalPrice)} ₺`;
  return text;
}

function renderCartTotal() {
  if (!els.cartTotalRow) return;
  const { lines, totalPrice, pricedLines } = getCartTotals();
  if (!pricedLines) {
    els.cartTotalRow.classList.add("hidden");
    return;
  }
  els.cartTotalRow.classList.remove("hidden");
  const html = `${escapeHtml(formatTL(totalPrice))}<small>₺</small>`;
  if (els.cartTotal.innerHTML !== html) {
    els.cartTotal.innerHTML = html;
    if (!prefersReducedMotion()) retrigger(els.cartTotal, "tick");
  }
  const missing = lines - pricedLines;
  els.cartTotalNote.textContent = missing
    ? `Fiyatı belirtilmemiş ${missing} ürün toplama dahil değil`
    : "";
}

function updateCartBar() {
  const { totalQty } = getCartTotals();
  const visible = totalQty > 0;
  els.cartBar.classList.toggle("is-visible", visible);
  els.cartBar.setAttribute("aria-hidden", visible ? "false" : "true");
  els.cartBarButton.tabIndex = visible ? 0 : -1;
  els.cartCount.textContent = totalQty;
  els.cartBarSub.textContent = summaryText({ withPrice: true });
}

let renderedCartIds = new Set();
function renderCartDrawer() {
  els.cartSummary.textContent = cart.length ? summaryText() : "";
  renderCartTotal();

  if (!cart.length) {
    els.cartItems.innerHTML = "";
    els.cartEmptyMsg.classList.remove("hidden");
    els.cartSend.disabled = true;
    els.cartClear.disabled = true;
    resetClearConfirm();
    renderedCartIds = new Set();
    return;
  }

  els.cartEmptyMsg.classList.add("hidden");
  els.cartSend.disabled = false;
  els.cartClear.disabled = false;

  let n = 0;
  els.cartItems.innerHTML = cart
    .map((item) => {
      const p = productById(item.id);
      const src = p ? resolveImageSrc(p.image) : "";
      const isNew = !renderedCartIds.has(item.id);
      const style = isNew ? `style="--d:${Math.min(n++, 8) * 40}ms"` : 'style="animation:none"';
      return `
        <div class="cart-item" data-id="${item.id}" ${style}>
          <div class="cart-thumb">
            ${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.remove()">` : ICON.image}
          </div>
          <div class="cart-item-main">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            <div class="cart-item-pack">${escapeHtml(item.pack || categoryLabel(item.category) || "")}</div>
            ${(() => {
              const unit = unitPriceOf(item);
              if (unit === null) return "";
              return `<div class="cart-item-price">${escapeHtml(formatTL(unit * item.qty))} ₺${
                item.qty > 1 ? ` <span>(${escapeHtml(formatTL(unit))} ₺ × ${item.qty})</span>` : ""
              }</div>`;
            })()}
          </div>
          <div class="mini-stepper">
            <button class="cart-qty-btn" type="button" data-action="dec" aria-label="Azalt">${ICON.minus}</button>
            <span class="cart-qty">${item.qty}</span>
            <button class="cart-qty-btn" type="button" data-action="inc" aria-label="Artır">${ICON.plus}</button>
            <button class="cart-remove-btn" type="button" data-action="remove" aria-label="Sil">${ICON.trash}</button>
          </div>
        </div>`;
    })
    .join("");

  renderedCartIds = new Set(cart.map((i) => i.id));
}

function updateCartUI() {
  updateCartBar();
  renderCartDrawer();
  saveCartToStorage();
  syncVisibleProductCardsWithCart();
}

function addProductToCart(productId) {
  const product = productById(productId);
  if (!product) return false;

  const existing = cart.find((i) => i.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      category: product.category,
      pack: product.pack,
      price: product.price,
      qty: 1,
    });
  }
  updateCartUI();
  return true;
}

function changeCartQty(productId, delta) {
  const item = cart.find((i) => i.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((i) => i !== item);
  updateCartUI();
}

function removeCartItem(productId) {
  cart = cart.filter((i) => i.id !== productId);
  updateCartUI();
}

function clearCart() {
  cart = [];
  updateCartUI();
}

// Silinecek satırı kısa bir animasyonla çıkar
function animateCartRowOut(id, done) {
  const row = els.cartItems.querySelector(`.cart-item[data-id="${id}"]`);
  if (!row || prefersReducedMotion()) return done();
  row.style.animation = "";
  row.classList.add("is-leaving");
  setTimeout(done, 260);
}

function openCart() {
  if (ui.cartOpen) return;
  ui.lastFocus = document.activeElement;
  renderedCartIds = new Set(); // açılışta satırlar sırayla gelsin
  renderCartDrawer();
  ui.cartOpen = true;
  updateSpotPlayState();
  els.cartDrawer.classList.add("is-open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  lockScroll();
  safePushState({ ...(history.state || {}), overlay: "cart", depth: currentDepth() + 1 });
  setTimeout(() => els.cartClose.focus({ preventScroll: true }), 60);
}

function closeCart({ fromHistory = false } = {}) {
  if (!ui.cartOpen) return;
  if (!fromHistory && history.state && history.state.overlay === "cart") {
    history.back();
    return;
  }
  ui.cartOpen = false;
  updateSpotPlayState();
  els.cartDrawer.classList.remove("is-open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
  unlockScroll();
  resetClearConfirm();
  if (ui.lastFocus && document.contains(ui.lastFocus)) ui.lastFocus.focus({ preventScroll: true });
}

let clearConfirmTimer = null;
function resetClearConfirm() {
  clearTimeout(clearConfirmTimer);
  els.cartClear.classList.remove("is-confirm");
  els.cartClear.textContent = "Sepeti Temizle";
}

function buildCartMessage() {
  if (!cart.length) return "";
  const header = "Hüseyin Bahçe Ürün Kataloğu siparişi:\n\n";
  const lines = cart.map((item, index) => {
    const parts = [];
    if (item.category) parts.push(item.category);
    parts.push(item.name);
    if (item.pack) parts.push(item.pack);
    return `${index + 1}) ${parts.join(" – ")} x ${item.qty}`;
  });

  let text = header + lines.join("\n");
  const note = els.cartNote.value.trim();
  if (note) text += "\n\nNot: " + note;
  return text;
}

function sendCartViaWhatsApp() {
  if (!cart.length) {
    showToast("Sepetiniz boş.");
    return;
  }
  openWhatsAppWithText(buildCartMessage());
}

// Sepete ekleme animasyonu: ürün görseli sepet çubuğuna uçar
function flyToCart(fromEl, imgSrc) {
  const bump = () => retrigger(els.cartBarIcon, "bump");
  if (prefersReducedMotion() || !fromEl || !els.cartBarIcon.animate) return bump();

  const a = fromEl.getBoundingClientRect();
  const b = els.cartBarIcon.getBoundingClientRect();
  if (!a.width || !b.width) return bump();

  // Çubuk o anda ekrana giriyor olabilir: son konumunu hesaba kat
  let offsetY = 0;
  try {
    offsetY = new DOMMatrixReadOnly(getComputedStyle(els.cartBar).transform).m42 || 0;
  } catch { /* yok say */ }

  const size = 48;
  const startX = a.left + a.width / 2 - size / 2;
  const startY = a.top + a.height / 2 - size / 2;
  const dx = b.left + b.width / 2 - size / 2 - startX;
  const dy = b.top - offsetY + b.height / 2 - size / 2 - startY;

  const dot = document.createElement("div");
  dot.className = "fly-dot";
  dot.style.left = startX + "px";
  dot.style.top = startY + "px";
  if (imgSrc) dot.style.backgroundImage = `url("${imgSrc.replace(/"/g, "%22")}")`;
  document.body.appendChild(dot);

  const anim = dot.animate(
    [
      { transform: "translate(0,0) scale(.6)", opacity: 0 },
      { transform: "translate(0,-6px) scale(1)", opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 70}px) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0.2 },
    ],
    { duration: 720, easing: "cubic-bezier(.45,0,.25,1)" }
  );
  anim.onfinish = () => {
    dot.remove();
    bump();
  };
  anim.oncancel = () => dot.remove();
}

// =========================================================
// Veri yükleme
// =========================================================
// Yedek: Google Sheets gviz uç noktasını <script> ile (JSONP) yükler.
// fetch/CORS kısıtlamalarından (ör. file:// ile açılan sayfa) etkilenmez.
function loadSheetRowsViaJsonp(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "__hbSheetCb_" + Date.now();
    const script = document.createElement("script");
    let timer = null;

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch { window[cbName] = undefined; }
      script.remove();
    }

    window[cbName] = (resp) => {
      cleanup();
      try {
        if (!resp || resp.status === "error" || !resp.table) throw new Error("gviz error");
        const headers = resp.table.cols.map((c) => (c.label || "").trim());
        const rows = (resp.table.rows || []).map((r) => {
          const obj = {};
          headers.forEach((h, i) => {
            if (!h) return;
            const cell = r.c ? r.c[i] : null;
            if (!cell || cell.v === null || cell.v === undefined) obj[h] = "";
            else obj[h] = cell.f !== undefined && cell.f !== null ? String(cell.f) : String(cell.v);
          });
          return obj;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    const tqx = encodeURIComponent("out:json;responseHandler:" + cbName);
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?headers=1&tqx=${tqx}&v=${Date.now()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load failed"));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

async function fetchSheetRows() {
  try {
    const res = await fetch(SHEET_CSV_URL + "&v=" + Date.now());
    if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
    return parseCSV(await res.text());
  } catch (err) {
    console.warn("CSV yüklenemedi, JSONP yedeğine geçiliyor:", err);
    return await loadSheetRowsViaJsonp();
  }
}

async function loadData() {
  hideStatus();
  renderCategorySkeletons();
  if (hasSpot && !spot.list.length) {
    els.spotlight.classList.remove("hidden");
    els.spotlight.classList.add("is-loading");
  }
  els.catEmpty.classList.add("hidden");

  try {
    const rows = (await fetchSheetRows()).map(normalizeRow);
    const valid = validateProducts(rows);

    state.products = valid.map((p, idx) => {
      const product = { ...p, id: idx };
      product._s = fold([p.name, p.category, categoryLabel(p.category), p.pack, p.campaign ? "kampanya" : ""].join(" "));
      return product;
    });

    if (state.products.length === 0) {
      showStatus(
        "Ürün bulunamadı. Google Sheets başlıklarının category, name, pack, image, price olduğundan emin olun.",
        "error"
      );
    }

    reconcileCart();
    updateCartUI();

    renderCategories();
    renderSpotlight();
    const catCount = getCategories(state.products).length;
    countUp(els.statCats, catCount);
    countUp(els.statProducts, state.products.length);
    if (spot.list.length && els.catStats) {
      els.catStats.innerHTML = `<strong>${catCount}</strong> kategori · <strong>${state.products.length}</strong> ürün`;
    }

    // Bağlantı ile bir kategoriye gelindiyse (#k=...) doğrudan aç
    const initial = routeFromHash();
    const cat = initial.view === "category" ? initial.cat : null;
    if (cat && state.products.some((p) => p.category === cat)) {
      safeReplaceState({ view: "category", cat, depth: 0 }, categoryHash(cat));
      state.view = "category";
      state.category = cat;
      const list = state.products.filter((p) => p.category === cat);
      showProductsNow(categoryLabel(cat), `${list.length} ürün`, list);
    } else {
      safeReplaceState({ view: "categories", depth: 0 }, baseUrl());
      showCategoriesNow({ restoreScroll: false });
    }

    // Sayfa yüklenirken arama kutusuna yazılmışsa
    if (els.search.value.trim()) runSearch();
  } catch (err) {
    console.error(err);
    els.categories.innerHTML = "";
    if (els.spotlight) els.spotlight.classList.add("hidden");
    showStatus("Veri yüklenemedi. Google Sheets linkinin 'Web'de yayınla' ile paylaşıldığından emin olun.", "error", {
      retry: true,
    });
  }
}

// =========================================================
// Kaydırma durumu (üst bar gölgesi, yapışkan başlık)
// =========================================================
let scrollTicking = false;
function updateScrollState() {
  scrollTicking = false;
  const y = window.scrollY;
  els.appbar.classList.toggle("is-scrolled", y > 8);
  if (!els.productView.classList.contains("hidden")) {
    const top = els.productBar.getBoundingClientRect().top;
    const appbarH = els.appbar.offsetHeight;
    els.productBar.classList.toggle("is-stuck", y > 4 && top <= appbarH + 1);
  }
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(updateScrollState);
    }
  },
  { passive: true }
);

// Üst barın yüksekliğini CSS değişkenine yazar; ürün başlığı/geri tuşu satırı bunun hemen altına yapışır
function syncAppbarHeight() {
  document.documentElement.style.setProperty("--appbar-h", els.appbar.offsetHeight + "px");
}
syncAppbarHeight();
window.addEventListener("resize", syncAppbarHeight);
if ("ResizeObserver" in window) new ResizeObserver(syncAppbarHeight).observe(els.appbar);

// =========================================================
// Olaylar
// =========================================================

// Kategori kartı
els.categories.addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-card");
  if (!btn || !btn.dataset.cat) return;
  openCategory(btn.dataset.cat, { sharedFrom: btn.querySelector(".cat-title") });
});

// Geri tuşu / ana sayfa
els.back.addEventListener("click", navigateBack);
document.addEventListener("click", (e) => {
  const home = e.target.closest('[data-action="home"]');
  if (home) {
    e.preventDefault();
    navigateHome();
    return;
  }
  if (e.target.closest('[data-action="retry"]')) loadData();
});

// Arama
els.search.addEventListener("input", () => {
  els.searchClear.hidden = !els.search.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 140);
});
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.search.value) {
    e.preventDefault();
    clearSearchInput();
    runSearch();
  } else if (e.key === "Enter") {
    clearTimeout(searchTimer);
    runSearch();
    els.search.blur();
  }
});
els.searchClear.addEventListener("click", () => {
  clearSearchInput();
  runSearch();
  els.search.focus();
});

// Ürün kartları ve kampanya vitrini: sepete ekle, adet, sil, görsel büyütme
function onCardAction(e, cardSelector, zoomList) {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  const card = actionEl.closest(cardSelector);
  if (!card) return;
  const id = Number(card.dataset.id);
  if (!Number.isFinite(id)) return;

  switch (actionEl.dataset.action) {
    case "add": {
      const img = card.querySelector(".prod-media img.is-loaded, .spot-tile img.is-loaded");
      const p = productById(id);
      if (addProductToCart(id)) flyToCart(img || actionEl, img && p ? resolveImageSrc(p.image) : "");
      break;
    }
    case "inc":
      addProductToCart(id);
      retrigger(els.cartBarIcon, "bump");
      break;
    case "dec":
      changeCartQty(id, -1);
      break;
    case "remove":
      removeCartItem(id);
      break;
    case "zoom":
      if (!actionEl.classList.contains("is-broken")) openLightbox(id, zoomList());
      break;
  }
}
els.products.addEventListener("click", (e) => onCardAction(e, ".prod-card", () => state.list));
if (hasSpot) els.spotTrack.addEventListener("click", (e) => onCardAction(e, ".spot-slide", () => spot.list));

// Görsel görüntüleyici
els.lightbox.addEventListener("click", (e) => {
  if (e.target.closest("[data-lb-close]")) closeLightbox();
  else if (e.target.closest(".lb-prev")) lbGo(-1);
  else if (e.target.closest(".lb-next")) lbGo(1);
});
els.lbPanel.addEventListener("click", (e) => {
  // Görselin dışındaki boş alana dokunmak da kapatır
  if (e.target === els.lbPanel) closeLightbox();
});
els.lbPanel.addEventListener("touchstart", onLbTouchStart, { passive: true });
els.lbPanel.addEventListener("touchend", onLbTouchEnd, { passive: true });

// Sepet
els.cartBarButton.addEventListener("click", openCart);
els.cartDrawerBackdrop.addEventListener("click", () => closeCart());
els.cartClose.addEventListener("click", () => closeCart());

els.cartItems.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const row = e.target.closest(".cart-item");
  if (!btn || !row) return;
  const id = Number(row.dataset.id);
  if (!Number.isFinite(id)) return;

  const action = btn.dataset.action;
  if (action === "inc") {
    changeCartQty(id, 1);
  } else if (action === "dec") {
    const item = cart.find((i) => i.id === id);
    if (item && item.qty <= 1) animateCartRowOut(id, () => changeCartQty(id, -1));
    else changeCartQty(id, -1);
  } else if (action === "remove") {
    animateCartRowOut(id, () => removeCartItem(id));
  }
});

els.cartSend.addEventListener("click", sendCartViaWhatsApp);

els.cartClear.addEventListener("click", () => {
  if (!cart.length) return;
  if (!els.cartClear.classList.contains("is-confirm")) {
    els.cartClear.classList.add("is-confirm");
    els.cartClear.textContent = "Emin misiniz? Temizlemek için tekrar dokunun";
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(resetClearConfirm, 3500);
    return;
  }
  resetClearConfirm();
  clearCart();
  showToast("Sepet temizlendi");
});

// Klavye
document.addEventListener("keydown", (e) => {
  if (ui.lightboxOpen) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbGo(-1);
    else if (e.key === "ArrowRight") lbGo(1);
    else trapFocus(e, els.lightbox);
    return;
  }
  if (ui.cartOpen) {
    if (e.key === "Escape") closeCart();
    else trapFocus(e, els.cartPanel);
    return;
  }
  // "/" ile aramaya odaklan
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    els.search.focus();
  }
});

window.addEventListener("popstate", onPopState);

// =========================================================
// Başlat
// =========================================================
bindContactLinks();
loadCartFromStorage();
updateCartBar();
loadData();
