// ================================
// Hüseyin Bahçe | Ürün Kataloğu
// - Google Sheets CSV
// - Category view + Product view
// - Lightbox image viewer
// - Skeleton loading
// - Scroll position restore on back
// - Cart + WhatsApp order send
// - "Sepete Ekle" -> then - / qty / + / Sil
// - Per-card control updates (no image flicker)
// ================================

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtVmDRnzdNDmXwYzrUfaNrBumsDNqsW6OQKEd_i93mgkvOH8hP3hXceb9SFVLdm-Mu3UgRyjfAZojt/pub?output=csv";

// Yedek yükleme yolu için tablonun dosya kimliği (docs.google.com/spreadsheets/d/<ID>/edit).
// Sayfa dosyadan (file://) açıldığında Google, yukarıdaki CSV isteğine izin vermiyor;
// bu durumda veriler aynı tablodan JSONP (script etiketi) ile çekilir.
const SHEET_ID = "143SSs0A7VOG16_qkJprD-zWmYDgkIhqLp7jQUzJlkXw";

const PHONE_DIGITS = "905394927471";
const CART_STORAGE_KEY = "hb_cart_v1";

// Optional prettier labels
const CATEGORY_LABELS = {
  GIDA: "Gıda",
  OYUNCAK: "Oyuncak",
  EV_TEMIZLIK: "Ev & Temizlik",
  KIRTASIYE: "Kırtasiye",
  PET: "Pet",
};

const els = {
  status: document.getElementById("status"),
  search: document.getElementById("search"),

  categoryView: document.getElementById("categoryView"),
  categories: document.getElementById("categories"),
  catEmpty: document.getElementById("catEmpty"),

  productView: document.getElementById("productView"),
  products: document.getElementById("products"),
  prodEmpty: document.getElementById("prodEmpty"),

  back: document.getElementById("back"),
  viewTitle: document.getElementById("viewTitle"),
  viewSubtitle: document.getElementById("viewSubtitle"),

  lightbox: document.getElementById("lightbox"),
  lbImg: document.getElementById("lbImg"),
  lbTitle: document.getElementById("lbTitle"),
  lbSub: document.getElementById("lbSub"),

  cartBar: document.getElementById("cartBar"),
  cartBarButton: document.getElementById("cartBarButton"),
  cartCount: document.getElementById("cartCount"),

  cartDrawer: document.getElementById("cartDrawer"),
  cartDrawerBackdrop: document.getElementById("cartDrawerBackdrop"),
  cartItems: document.getElementById("cartItems"),
  cartEmptyMsg: document.getElementById("cartEmptyMsg"),
  cartTotal: document.getElementById("cartTotal"),
  cartNote: document.getElementById("cartNote"),
  cartSend: document.getElementById("cartSend"),
  cartClear: document.getElementById("cartClear"),
  cartClose: document.getElementById("cartClose"),
};

let allProducts = [];
let currentCategory = null;
let lastCategoryScrollY = 0;

let currentRenderedProducts = [];
let currentLightboxIndex = 0;

let cart = []; // {id, name, category, pack, price, qty}

// ---------- Status ----------
function showStatus(msg, type = "info") {
  els.status.textContent = msg;
  els.status.classList.remove("hidden", "error");
  if (type === "error") els.status.classList.add("error");
}
function hideStatus() {
  els.status.classList.add("hidden");
  els.status.textContent = "";
  els.status.classList.remove("error");
}

// ---------- Scroll / transitions ----------
function scrollToTopSmooth() {
  try { window.scrollTo({ top: 0, behavior: "smooth" }); }
  catch { window.scrollTo(0, 0); }
}
function restoreCategoryScroll() {
  window.scrollTo(0, lastCategoryScrollY || 0);
}
function pulseViewTransition() {
  document.body.classList.add("view-transition");
  window.setTimeout(() => {
    document.body.classList.remove("view-transition");
  }, 140);
}

// ---------- WhatsApp helper ----------
function openWhatsAppWithText(text) {
  const encoded = encodeURIComponent(text);
  const phone = PHONE_DIGITS;
  const appLink = `whatsapp://send?phone=${phone}&text=${encoded}`;
  const webLink = `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;

  window.location.href = appLink;
  setTimeout(() => {
    try {
      window.open(webLink, "_blank", "noopener");
    } catch {
      window.location.href = webLink;
    }
  }, 500);
}

function bindHeaderWhatsApp() {
  const headerChip = document.querySelector('[data-role="header-whatsapp"]');
  const footerLink = document.querySelector('[data-role="footer-whatsapp"]');

  if (headerChip) {
    headerChip.addEventListener("click", (e) => {
      e.preventDefault();
      openWhatsAppWithText("Merhaba, ürünler hakkında bilgi almak istiyorum.");
    });
  }

  if (footerLink) {
    footerLink.addEventListener("click", (e) => {
      e.preventDefault();
      openWhatsAppWithText("Merhaba, ürünler hakkında bilgi almak istiyorum.");
    });
  }
}

// ---------- CSV parsing ----------
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

// ---------- Normalization ----------
function normalizeRow(r) {
  return {
    category: (r.category || "").trim(),
    name: (r.name || "").trim(),
    pack: (r.pack || "").trim(),
    image: (r.image || "").trim(),
    price: (r.price || "").trim(),
  };
}

function validateProducts(rows) {
  return rows.filter((p) => p.category && p.name);
}

// ---------- Price ----------
function parsePriceNumber(value) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/[^\d,.\-]/g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return num;
}

function formatTRY(value) {
  if (value === null || value === undefined || value === "") return "";
  const num =
    typeof value === "number" ? value : parsePriceNumber(String(value));
  if (!Number.isFinite(num)) return String(value).trim();
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(num);
}

// ---------- Category helpers ----------
function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key;
}

function getCategories(products) {
  const map = new Map();
  products.forEach((p) =>
    map.set(p.category, (map.get(p.category) || 0) + 1)
  );

  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key, "tr"));
}

// ---------- Image helpers ----------
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
      if (id) {
        return `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
      }
    }
    return v;
  }

  return "img/" + v;
}

// ---------- Category preview ----------
function getPreviewImagesForCategory(catKey) {
  const imgs = allProducts
    .filter((p) => p.category === catKey && p.image)
    .map((p) => resolveImageSrc(p.image))
    .filter(Boolean);

  const seen = new Set();
  const uniq = [];
  for (const i of imgs) {
    if (!seen.has(i)) {
      seen.add(i);
      uniq.push(i);
    }
    if (uniq.length >= 3) break;
  }
  return uniq;
}

// ---------- Skeletons ----------
function renderCategorySkeletons() {
  const count = 8;
  els.categories.innerHTML = Array.from({ length: count })
    .map(
      () => `
    <div class="skeleton-card">
      <div class="skel-line lg"></div>
      <div class="skel-line md"></div>
      <div class="skel-thumbs">
        <div class="skel-thumb"></div>
        <div class="skel-thumb"></div>
        <div class="skel-thumb"></div>
      </div>
    </div>
  `
    )
    .join("");
}

// (product skeleton available if needed)
function renderProductSkeletons() {
  const count = 8;
  els.products.innerHTML = Array.from({ length: count })
    .map(
      () => `
    <div class="skel-prod">
      <div class="skel-media"></div>
      <div class="skel-body">
        <div class="skel-name"></div>
        <div class="skel-pack"></div>
      </div>
    </div>
  `
    )
    .join("");
}

// ---------- Build controls HTML (used in multiple places) ----------
function buildControlsHTML(productId, qty) {
  if (qty > 0) {
    return `
      <div class="prod-cart-controls" data-id="${productId}">
        <button class="prod-cart-btn" type="button" data-action="dec">-</button>
        <span class="prod-cart-qty">${qty}</span>
        <button class="prod-cart-btn" type="button" data-action="inc">+</button>
        <button class="prod-cart-remove" type="button" data-action="remove">Sil</button>
      </div>
    `;
  } else {
    return `
      <button class="cart-add-btn" type="button" data-id="${productId}">
        Sepete Ekle
      </button>
    `;
  }
}

// ---------- Sync visible product cards with cart (no full re-render) ----------
function syncVisibleProductCardsWithCart() {
  const cards = els.products.querySelectorAll(".prod-card[data-id]");
  cards.forEach((card) => {
    const id = Number(card.dataset.id);
    if (!Number.isFinite(id)) return;
    const item = cart.find((i) => i.id === id);
    const qty = item ? item.qty : 0;

    const slot = card.querySelector(".prod-controls");
    if (!slot) return;
    slot.innerHTML = buildControlsHTML(id, qty);
  });
}

// ---------- Render categories ----------
function renderCategories(products) {
  const cats = getCategories(products);

  if (cats.length === 0) {
    els.categories.innerHTML = "";
    els.catEmpty.classList.remove("hidden");
    return;
  }
  els.catEmpty.classList.add("hidden");

  els.categories.innerHTML = cats
    .map((c) => {
      const label = categoryLabel(c.key);
      const previews = getPreviewImagesForCategory(c.key);

      const thumbsHtml = `
      <div class="cat-thumbs">
        ${[0, 1, 2]
          .map((i) => {
            const src = previews[i];
            if (!src) return `<div class="cat-thumb"></div>`;
            return `
            <div class="cat-thumb">
              <img src="${src}" alt="${escapeHtml(
              label
            )} görsel ${i + 1}" loading="lazy"
                   onerror="this.style.display='none'">
            </div>
          `;
          })
          .join("")}
      </div>
    `;

      return `
      <button class="cat-card" type="button" data-cat="${escapeHtml(c.key)}">
        <div class="cat-title">${escapeHtml(label)}</div>
        <div class="cat-meta">${c.count} ürün</div>
        ${thumbsHtml}
      </button>
    `;
    })
    .join("");
}

// ---------- Render products ----------
function renderProducts(list) {
  currentRenderedProducts = list.slice();

  if (!list || list.length === 0) {
    els.products.innerHTML = "";
    els.prodEmpty.classList.remove("hidden");
    return;
  }
  els.prodEmpty.classList.add("hidden");

  els.products.innerHTML = list
    .map((p, idx) => {
      const src = resolveImageSrc(p.image);
      const cartItem = cart.find((i) => i.id === p.id);
      const qty = cartItem ? cartItem.qty : 0;

      const mediaHtml = src
        ? `
        <div class="prod-media">
          <img
            src="${src}"
            alt="${escapeHtml(p.name)}"
            loading="lazy"
            data-img-index="${idx}"
            onerror="this.style.display='none'">
        </div>
      `
        : `
        <div class="prod-media" style="display:grid;place-items:center;color:rgba(107,114,128,.7);font-size:12px;">
          Görsel yok
        </div>
      `;

      const priceHtml = p.price
        ? `<div class="prod-price">${escapeHtml(formatTRY(p.price))}</div>`
        : "";

      const controlsHtml = buildControlsHTML(p.id, qty);

      return `
      <article class="prod-card" data-id="${p.id}">
        ${mediaHtml}
        <div class="prod-body">
          <h3 class="prod-name">${escapeHtml(p.name)}</h3>
          ${p.pack ? `<div class="prod-pack">${escapeHtml(p.pack)}</div>` : ""}
          ${priceHtml}
          <div class="prod-controls" data-id="${p.id}">
            ${controlsHtml}
          </div>
        </div>
      </article>
    `;
    })
    .join("");
}

// ---------- Views ----------
function showCategoriesScreen({ restoreScrollPos = false } = {}) {
  currentCategory = null;

  els.productView.classList.add("hidden");
  els.categoryView.classList.remove("hidden");

  renderCategories(allProducts);

  if (els.viewSubtitle) els.viewSubtitle.textContent = "";

  pulseViewTransition();

  if (restoreScrollPos) {
    requestAnimationFrame(() => restoreCategoryScroll());
  } else {
    scrollToTopSmooth();
  }
}

function showProductsScreen(title, subtitle = "") {
  els.categoryView.classList.add("hidden");
  els.productView.classList.remove("hidden");

  els.viewTitle.textContent = title;
  els.viewSubtitle.textContent = subtitle;

  pulseViewTransition();
  scrollToTopSmooth();
}

function openCategory(catKey) {
  lastCategoryScrollY = window.scrollY;

  currentCategory = catKey;
  const label = categoryLabel(catKey);
  const filtered = allProducts.filter((p) => p.category === catKey);

  showProductsScreen(label, `${filtered.length} ürün`);
  renderProducts(filtered);
}

// ---------- Search ----------
function applySearch() {
  const q = els.search.value.trim().toLowerCase();

  if (!q) {
    if (currentCategory) openCategory(currentCategory);
    else showCategoriesScreen({ restoreScrollPos: false });
    return;
  }

  const results = allProducts.filter((p) => {
    const name = p.name.toLowerCase();
    const cat = p.category.toLowerCase();
    const pack = (p.pack || "").toLowerCase();
    return (
      name.includes(q) ||
      cat.includes(q) ||
      pack.includes(q)
    );
  });

  showProductsScreen("Arama Sonuçları", `${results.length} ürün`);
  renderProducts(results);
}

// ---------- Lightbox ----------
function openLightboxAt(index) {
  if (!currentRenderedProducts.length) return;

  currentLightboxIndex = Math.max(
    0,
    Math.min(index, currentRenderedProducts.length - 1)
  );
  const p = currentRenderedProducts[currentLightboxIndex];
  const src = resolveImageSrc(p.image);
  if (!src) return;

  els.lbImg.src = src;
  els.lbImg.alt = p.name || "Ürün görseli";
  els.lbTitle.textContent = p.name || "";
  els.lbSub.textContent = [
    p.category ? categoryLabel(p.category) : "",
    p.pack || "",
    p.price ? formatTRY(p.price) : "",
  ]
    .filter(Boolean)
    .join(" • ");

  els.lightbox.classList.remove("hidden");
  els.lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  els.lightbox.classList.add("hidden");
  els.lightbox.setAttribute("aria-hidden", "true");
  els.lbImg.src = "";
  document.body.style.overflow = "";
}

function lbPrev() {
  openLightboxAt(currentLightboxIndex - 1);
}
function lbNext() {
  openLightboxAt(currentLightboxIndex + 1);
}

// Touch swipe for lightbox
let touchXStart = 0;
let touchXEnd = 0;

function onLbTouchStart(e) {
  touchXStart = e.changedTouches[0].screenX;
}
function onLbTouchEnd(e) {
  touchXEnd = e.changedTouches[0].screenX;
  const dx = touchXEnd - touchXStart;
  if (Math.abs(dx) < 40) return;
  if (dx > 0) lbPrev();
  else lbNext();
}

// ---------- Cart helpers ----------
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
        qty:
          typeof item.qty === "number" && item.qty > 0 ? item.qty : 1,
      }))
      .filter((i) => i.id !== undefined);
    updateCartUI();
  } catch (err) {
    console.warn("Cart restore failed", err);
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.warn("Cart save failed", err);
  }
}

function getCartTotals() {
  let totalQty = 0;
  let totalPrice = 0;
  let hasPrice = false;

  for (const item of cart) {
    totalQty += item.qty;
    const num = parsePriceNumber(item.price);
    if (num !== null) {
      totalPrice += num * item.qty;
      hasPrice = true;
    }
  }
  return { totalQty, totalPrice, hasPrice };
}

function updateCartBadge() {
  if (!els.cartBar || !els.cartCount) return;
  const { totalQty } = getCartTotals();
  if (totalQty > 0) {
    els.cartBar.classList.remove("hidden");
    els.cartCount.textContent = totalQty;
  } else {
    els.cartBar.classList.add("hidden");
    els.cartCount.textContent = "0";
  }
}

function renderCartDrawer() {
  if (!els.cartItems) return;

  const { hasPrice, totalPrice } = getCartTotals();

  if (!cart.length) {
    els.cartItems.innerHTML = "";
    els.cartEmptyMsg.classList.remove("hidden");
    els.cartTotal.textContent = "-";
    els.cartSend.disabled = true;
    els.cartClear.disabled = true;
    return;
  }

  els.cartEmptyMsg.classList.add("hidden");
  els.cartSend.disabled = false;
  els.cartClear.disabled = false;

  els.cartItems.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item-main">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        <div class="cart-item-pack">${escapeHtml(
          item.pack || item.category || ""
        )}</div>
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn" type="button" data-action="dec">-</button>
        <span class="cart-qty">${item.qty}</span>
        <button class="cart-qty-btn" type="button" data-action="inc">+</button>
        <button class="cart-remove-btn" type="button" data-action="remove">Sil</button>
      </div>
    </div>
  `
    )
    .join("");

  if (hasPrice) {
    els.cartTotal.textContent = formatTRY(totalPrice);
  } else {
    els.cartTotal.textContent = "-";
  }
}

function updateCartUI() {
  updateCartBadge();
  renderCartDrawer();
  saveCartToStorage();
  syncVisibleProductCardsWithCart(); // only controls change, images stay
}

function addProductToCart(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;

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
}

function changeCartQty(productId, delta) {
  const idx = cart.findIndex((i) => i.id === productId);
  if (idx === -1) return;
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) {
    cart.splice(idx, 1);
  }
  updateCartUI();
}

function removeCartItem(productId) {
  const idx = cart.findIndex((i) => i.id === productId);
  if (idx === -1) return;
  cart.splice(idx, 1);
  updateCartUI();
}

function clearCart() {
  cart = [];
  updateCartUI();
}

function openCartDrawer() {
  if (!els.cartDrawer) return;
  renderCartDrawer();
  els.cartDrawer.classList.remove("hidden");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  if (!els.cartDrawer) return;
  els.cartDrawer.classList.add("hidden");
  els.cartDrawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function buildCartMessage() {
  if (!cart.length) return "";
  const header = "Hüseyin Bahçe Ürün Kataloğu siparişi:\n\n";
  const lines = cart.map((item, index) => {
    const parts = [];
    if (item.category) parts.push(item.category);
    parts.push(item.name);
    if (item.pack) parts.push(item.pack);
    const base = `${index + 1}) ${parts.join(" – ")}`;
    const qtyPart = ` x ${item.qty}`;
    return base + qtyPart;
  });

  let text = header + lines.join("\n");

  const note = els.cartNote?.value.trim();
  if (note) {
    text += "\n\nNot: " + note;
  }
  return text;
}

function sendCartViaWhatsApp() {
  if (!cart.length) {
    alert("Sepetiniz boş.");
    return;
  }
  const msg = buildCartMessage();
  openWhatsAppWithText(msg);
}

// ---------- Load ----------
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
        if (!resp || resp.status === "error" || !resp.table) {
          throw new Error("gviz error");
        }
        const headers = resp.table.cols.map((c) => (c.label || "").trim());
        const rows = (resp.table.rows || []).map((r) => {
          const obj = {};
          headers.forEach((h, i) => {
            if (!h) return;
            const cell = r.c ? r.c[i] : null;
            if (!cell || cell.v === null || cell.v === undefined) {
              obj[h] = "";
            } else {
              obj[h] = cell.f !== undefined && cell.f !== null
                ? String(cell.f)
                : String(cell.v);
            }
          });
          return obj;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    const tqx = encodeURIComponent("out:json;responseHandler:" + cbName);
    script.src =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
      `?headers=1&tqx=${tqx}&v=${Date.now()}`;
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
    const url = SHEET_CSV_URL + "&v=" + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
    const text = await res.text();
    return parseCSV(text);
  } catch (err) {
    console.warn("CSV yüklenemedi, JSONP yedeğine geçiliyor:", err);
    return await loadSheetRowsViaJsonp();
  }
}

async function loadData() {
  hideStatus();
  renderCategorySkeletons();

  try {
    const rows = (await fetchSheetRows()).map(normalizeRow);
    const valid = validateProducts(rows);

    allProducts = valid.map((p, idx) => ({ ...p, id: idx }));

    if (allProducts.length === 0) {
      showStatus(
        "Ürün bulunamadı. Google Sheets başlıklarının category, name, pack, image, price olduğundan emin olun.",
        "error"
      );
    }

    showCategoriesScreen({ restoreScrollPos: false });
  } catch (err) {
    console.error(err);
    showStatus(
      "Veri yüklenemedi. Google Sheets linkinin 'Web'de yayınla' ile paylaşıldığından emin olun.",
      "error"
    );
    els.categories.innerHTML = "";
  }
}

// ---------- Utils ----------
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- Events ----------
els.categories.addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-card");
  if (!btn) return;
  const cat = btn.dataset.cat;
  if (cat) openCategory(cat);
});

els.back.addEventListener("click", () => {
  els.search.value = "";
  showCategoriesScreen({ restoreScrollPos: true });
});

els.search.addEventListener("input", applySearch);

// Product grid: "Sepete Ekle" + inline qty controls + image -> lightbox
els.products.addEventListener("click", (e) => {
  // 1) Sepete Ekle button (qty=0)
  const addBtn = e.target.closest(".cart-add-btn");
  if (addBtn) {
    const id = Number(addBtn.dataset.id);
    if (Number.isFinite(id)) {
      addProductToCart(id);   // will update controls only
    }
    return;
  }

  // 2) Inline qty controls (qty>0)
  const qtyBtn = e.target.closest(".prod-cart-btn");
  if (qtyBtn) {
    const wrapper = qtyBtn.closest(".prod-cart-controls");
    if (!wrapper) return;
    const id = Number(wrapper.dataset.id);
    if (!Number.isFinite(id)) return;
    const action = qtyBtn.dataset.action;
    if (action === "inc") {
      addProductToCart(id);
    } else if (action === "dec") {
      changeCartQty(id, -1);
    }
    return;
  }

  // 3) Remove button
  const rmBtn = e.target.closest(".prod-cart-remove");
  if (rmBtn) {
    const wrapper = rmBtn.closest(".prod-cart-controls");
    if (!wrapper) return;
    const id = Number(wrapper.dataset.id);
    if (!Number.isFinite(id)) return;
    removeCartItem(id);
    return;
  }

  // 4) Image -> lightbox
  const img = e.target.closest("img[data-img-index]");
  if (!img) return;
  const idx = Number(img.dataset.imgIndex);
  if (Number.isFinite(idx)) openLightboxAt(idx);
});

// Lightbox events
document.addEventListener("click", (e) => {
  const closeEl = e.target.closest("[data-lb-close]");
  if (closeEl) {
    closeLightbox();
    return;
  }
  if (e.target.closest(".lb-prev")) lbPrev();
  if (e.target.closest(".lb-next")) lbNext();
});

document.addEventListener("keydown", (e) => {
  if (els.lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lbPrev();
  if (e.key === "ArrowRight") lbNext();
});

const lbPanel = document.querySelector(".lightbox-panel");
if (lbPanel) {
  lbPanel.addEventListener("touchstart", onLbTouchStart, { passive: true });
  lbPanel.addEventListener("touchend", onLbTouchEnd, { passive: true });
}

// Cart bar / drawer events
if (els.cartBarButton) {
  els.cartBarButton.addEventListener("click", () => openCartDrawer());
}
if (els.cartDrawerBackdrop) {
  els.cartDrawerBackdrop.addEventListener("click", () => closeCartDrawer());
}
if (els.cartClose) {
  els.cartClose.addEventListener("click", () => closeCartDrawer());
}

if (els.cartItems) {
  els.cartItems.addEventListener("click", (e) => {
    const row = e.target.closest(".cart-item");
    if (!row) return;
    const id = Number(row.dataset.id);
    if (!Number.isFinite(id)) return;

    const action = e.target.dataset.action;
    if (action === "inc") {
      changeCartQty(id, 1);
    } else if (action === "dec") {
      changeCartQty(id, -1);
    } else if (action === "remove") {
      removeCartItem(id);
    }
  });
}

if (els.cartSend) {
  els.cartSend.addEventListener("click", () => sendCartViaWhatsApp());
}
if (els.cartClear) {
  els.cartClear.addEventListener("click", () => {
    if (!cart.length) return;
    if (confirm("Sepeti temizlemek istediğinize emin misiniz?")) {
      clearCart();
    }
  });
}

// Close cart with ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.cartDrawer.classList.contains("hidden")) {
    closeCartDrawer();
  }
});

// ---------- Sticky back bar offset ----------
// Üst barın (appbar) yüksekliğini CSS değişkenine yazar; ürün başlığı/geri tuşu
// satırı bu yüksekliğin hemen altına yapışır (mobil/masaüstü yükseklik farkı için).
function syncAppbarHeight() {
  const appbar = document.querySelector(".appbar");
  if (!appbar) return;
  document.documentElement.style.setProperty(
    "--appbar-h",
    appbar.offsetHeight + "px"
  );
}
syncAppbarHeight();
window.addEventListener("resize", syncAppbarHeight);
if ("ResizeObserver" in window) {
  const appbarEl = document.querySelector(".appbar");
  if (appbarEl) new ResizeObserver(syncAppbarHeight).observe(appbarEl);
}

// ---------- Init ----------
bindHeaderWhatsApp();
loadCartFromStorage();
loadData();
