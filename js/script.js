/* ============================================================
   FREE SPIRIT — Logique interactive
   Boutique (index.html) + Administration (admin.html)
   Données partagées via localStorage
   ============================================================ */

'use strict';

/* ==================== CONFIGURATION ==================== */
const CONFIG = {
  WHATSAPP_NUMBER: '22893838593',    // <-- Numéro WhatsApp du vendeur (format international sans "+")
  PHONE_DISPLAY: '+228 93 83 85 93', // <-- Numéro affiché / appel téléphonique
  PHONE_TEL: '+22893838593',
  CURRENCY: 'FCFA',
  ADMIN_PASSWORD: 'freespirit',        // <-- Mot de passe de l'espace admin
};

// Chemin des visuels par défaut, relatif aux pages (frontend/)
const ASSET = '../assets/images/';
const CATEGORIES = {
  tshirts: 'T-Shirts',
  pantalons: 'Pantalons',
  chaussures: 'Chaussures',
  ceintures: 'Ceintures',
};

/* ==================== STOCKAGE ==================== */
const DB = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

// v2 : données réinitialisées lors du passage des prix en FCFA
const KEYS = {
  products: 'fs_products_v2',
  promos: 'fs_promos_v2',
  cart: 'fs_cart_v2',
  orders: 'fs_orders_v2',
  user: 'fs_user_v1',
  admin: 'fs_admin_unlocked',
};

const uid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const escapeHtml = (str = '') => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => `${Number(n).toLocaleString('fr-FR')} ${CONFIG.CURRENCY}`;

/* ==================== DONNÉES PAR DÉFAUT ==================== */
const DEFAULT_PRODUCTS = [
  {
    id: 'p-overtone', name: 'OVERTONE TEE', category: 'tshirts',
    price: 25000, oldPrice: 30000, image: ASSET + 'tee-sans-manches.jpg',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    desc: "T-shirt sans manches blanc cassé, logo FREE SPIRIT chromé en métal liquide. Coupe boxy, coton lourd 240gsm. Ambitious and talented — SEXY AURA garantie.",
  },
  {
    id: 'p-chromestar', name: 'CHROME STAR TEE', category: 'tshirts',
    price: 28000, oldPrice: null, image: ASSET + 'tee-noir.png',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    desc: "Tee noir oversize, étoile chromée liquide sérigraphiée sur la poitrine. L'essence du streetwear moderne. Stay real, keep it 100.",
  },
  {
    id: 'p-limitless', name: 'LIMITLESS CARGO', category: 'pantalons',
    price: 45000, oldPrice: 58000, image: ASSET + 'pantalon-cargo.png',
    sizes: ['S', 'M', 'L', 'XL'],
    desc: "Cargo noir multi-poches, hardware étoile chromé. Coupe ample, toile technique dense. Au-delà des limites.",
  },
  {
    id: 'p-aura', name: 'AURA RUNNER', category: 'chaussures',
    price: 65000, oldPrice: null, image: ASSET + 'sneakers-chrome.png',
    sizes: ['40', '41', '42', '43', '44', '45'],
    desc: "Sneakers chunky noir/chrome, empiècements métalliques liquides et étoile FS sur le flanc. Release your energy à chaque pas.",
  },
  {
    id: 'p-meteor', name: 'METEOR BELT', category: 'ceintures',
    price: 18000, oldPrice: null, image: ASSET + 'ceinture-etoile.png',
    sizes: ['Unique'],
    desc: "Ceinture cuir noir pleine fleur, boucle étoile FS en chrome poli miroir. La pièce qui turn unbeliever to believer.",
  },
];

const DEFAULT_PROMOS = [
  { id: 'promo-welcome', code: 'WELCOME10', type: 'percent', value: 10, active: true },
  { id: 'promo-aura', code: 'AURA25', type: 'percent', value: 25, active: true },
  { id: 'promo-real', code: 'STAYREAL', type: 'fixed', value: 5000, active: true },
];

/* ==================== ÉTAT GLOBAL ==================== */
const state = {
  products: [],
  promos: [],
  cart: [],
  orders: [],
  user: null,
  promo: null,        // code promo appliqué dans le panier
  filter: 'all',
  qv: { product: null, size: null, qty: 1 }, // quick view
};

function loadState() {
  // Les produits sauvegardés avec l'ancien dossier "FREE SPIRIT/" sont migrés vers assets/images/
  const migrateImage = img => String(img || '').replace(/^FREE%20SPIRIT\//, ASSET);
  state.products = (DB.get(KEYS.products, null) || DEFAULT_PRODUCTS.slice()).map(p => ({ ...p, image: migrateImage(p.image) }));
  state.promos = DB.get(KEYS.promos, null) || DEFAULT_PROMOS.slice();
  state.cart = DB.get(KEYS.cart, []);
  state.orders = DB.get(KEYS.orders, []);
  state.user = DB.get(KEYS.user, null);
  if (!localStorage.getItem(KEYS.products)) DB.set(KEYS.products, state.products);
  if (!localStorage.getItem(KEYS.promos)) DB.set(KEYS.promos, state.promos);
}
const saveProducts = () => DB.set(KEYS.products, state.products);
const savePromos = () => DB.set(KEYS.promos, state.promos);
const saveCart = () => DB.set(KEYS.cart, state.cart);
const saveOrders = () => DB.set(KEYS.orders, state.orders);
const saveUser = () => DB.set(KEYS.user, state.user);

/* ==================== TOASTS ==================== */
function toast(message, type = 'info') {
  const zone = document.getElementById('toastZone');
  if (!zone) return;
  const el = document.createElement('div');
  el.className = `fs-toast ${type}`;
  el.innerHTML = `<i class="bi ${type === 'success' ? 'bi-check-circle-fill' : 'bi-lightning-charge-fill'}"></i><span>${escapeHtml(message)}</span>`;
  zone.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3200);
}

/* ==================== PROMOS : calculs ==================== */
function activePromos() { return state.promos.filter(p => p.active); }

function findPromo(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return state.promos.find(p => p.active && p.code.toUpperCase() === normalized) || null;
}

function promoDiscount(promo, subtotal) {
  if (!promo) return 0;
  if (promo.type === 'percent') return Math.round(subtotal * promo.value / 100);
  return Math.min(promo.value, subtotal);
}

/* ==================== PANIER ==================== */
function cartCount() { return state.cart.reduce((n, i) => n + i.qty, 0); }

function cartSubtotal() {
  return state.cart.reduce((sum, item) => {
    const p = state.products.find(pr => pr.id === item.id);
    return p ? sum + p.price * item.qty : sum;
  }, 0);
}

function addToCart(id, size, qty = 1) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  size = size || product.sizes[0];
  const existing = state.cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty += qty;
  else state.cart.push({ id, size, qty });
  saveCart();
  renderCart();
  toast(`${product.name} (${size}) ajouté au panier`, 'success');
}

function setCartQty(index, qty) {
  if (qty <= 0) state.cart.splice(index, 1);
  else state.cart[index].qty = qty;
  saveCart();
  renderCart();
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  saveCart();
  renderCart();
}

function clearCart() {
  state.cart = [];
  state.promo = null;
  saveCart();
  renderCart();
}

/* ==================== WHATSAPP ==================== */
function openWhatsApp(text) {
  window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, '_blank');
}

function buildOrderMessage(items, promo, totals, title) {
  const lines = [];
  lines.push(`*FREE SPIRIT — ${title}*`);
  lines.push('━━━━━━━━━━━━━━━');
  items.forEach(it => {
    lines.push(`▪ ${it.name} (Taille ${it.size}) x${it.qty} — ${fmt(it.price * it.qty)}`);
  });
  lines.push('━━━━━━━━━━━━━━━');
  lines.push(`Sous-total : ${fmt(totals.subtotal)}`);
  if (promo) {
    lines.push(`Code promo ${promo.code} : -${fmt(totals.discount)}`);
  }
  lines.push(`*TOTAL : ${fmt(totals.total)}*`);
  if (state.user) {
    lines.push('');
    lines.push(`Client : ${state.user.name} (${state.user.email})`);
  }
  lines.push('');
  lines.push('Free Spirit — au-delà des limites.');
  return lines.join('\n');
}

/* Commande directe d'un produit (quick view) */
function orderProductViaWhatsApp() {
  const { product, size, qty } = state.qv;
  if (!product) return;
  const chosenSize = size || product.sizes[0];
  const subtotal = product.price * qty;
  const discount = promoDiscount(state.promo, subtotal);
  const message = buildOrderMessage(
    [{ name: product.name, size: chosenSize, qty, price: product.price }],
    state.promo,
    { subtotal, discount, total: subtotal - discount },
    'COMMANDE DIRECTE'
  );
  openWhatsApp(message);
  registerOrder([{ id: product.id, name: product.name, size: chosenSize, qty, price: product.price }], { subtotal, discount, total: subtotal - discount });
}

/* Commande du panier complet */
function checkoutCartViaWhatsApp() {
  if (!state.cart.length) { toast('Votre panier est vide'); return; }
  const items = state.cart.map(i => {
    const p = state.products.find(pr => pr.id === i.id);
    return { ...i, name: p ? p.name : 'Produit', price: p ? p.price : 0 };
  });
  const subtotal = cartSubtotal();
  const discount = promoDiscount(state.promo, subtotal);
  const message = buildOrderMessage(items, state.promo, { subtotal, discount, total: subtotal - discount }, 'NOUVELLE COMMANDE');
  openWhatsApp(message);
  registerOrder(items, { subtotal, discount, total: subtotal - discount });
  toast('Commande transmise sur WhatsApp — merci !', 'success');
}

function registerOrder(items, totals) {
  const order = {
    id: 'FS-' + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    items: items.map(i => ({ name: i.name, size: i.size, qty: i.qty, price: i.price })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    promoCode: state.promo ? state.promo.code : null,
    total: totals.total,
    customer: state.user ? state.user.name : 'Invité',
  };
  state.orders.unshift(order);
  saveOrders();
  clearCartSilent();
  renderOrders();
}

function clearCartSilent() {
  state.cart = [];
  state.promo = null;
  saveCart();
  renderCart();
}

/* ==================== RENDU : BOUTIQUE ==================== */
function productCardHTML(p) {
  const hasPromo = p.oldPrice && p.oldPrice > p.price;
  const discountPct = hasPromo ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return `
  <div class="col-6 col-md-4 reveal">
    <article class="product-card h-100" data-id="${p.id}" onclick="openQuickView('${p.id}')">
      <div class="pc-media">
        ${hasPromo ? `<span class="pc-badge sale">-${discountPct}%</span>` : `<span class="pc-badge new">FS</span>`}
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
        <div class="pc-actions" onclick="event.stopPropagation()">
          <button class="btn btn-add" onclick="quickAdd('${p.id}')"><i class="bi bi-bag-plus me-1"></i>Ajouter</button>
          <button class="btn btn-view" onclick="openQuickView('${p.id}')" title="Aperçu"><i class="bi bi-eye"></i></button>
        </div>
      </div>
      <div class="pc-info">
        <div class="pc-cat">${CATEGORIES[p.category] || escapeHtml(p.category)}</div>
        <h3 class="pc-name">${escapeHtml(p.name)}</h3>
        <div class="pc-price">
          <span class="now ${hasPromo ? 'hot' : ''}">${fmt(p.price)}</span>
          ${hasPromo ? `<span class="old">${fmt(p.oldPrice)}</span>` : ''}
        </div>
      </div>
    </article>
  </div>`;
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const list = state.products.filter(p => state.filter === 'all' || p.category === state.filter);
  grid.innerHTML = list.length
    ? list.map(productCardHTML).join('')
    : `<div class="col-12"><div class="empty-state"><i class="bi bi-inboxes"></i>Aucun produit dans cette catégorie pour le moment.</div></div>`;
  observeReveals();
}

function renderPromoStrip() {
  const strip = document.getElementById('promoStrip');
  if (!strip) return;
  const actives = activePromos();
  if (!actives.length) { strip.classList.add('d-none'); return; }
  strip.classList.remove('d-none');
  strip.innerHTML = `<i class="bi bi-lightning-charge-fill red-text me-2"></i> Codes actifs :
    ${actives.map(p => `<span class="code-chip">${escapeHtml(p.code)} · ${p.type === 'percent' ? '-' + p.value + '%' : '-' + fmt(p.value)}</span>`).join('')}`;
}

function renderCart() {
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = cartCount();
    badge.classList.toggle('show', cartCount() > 0);
  }
  const body = document.getElementById('cartItems');
  if (!body) return;

  if (!state.cart.length) {
    body.innerHTML = `<div class="empty-state"><i class="bi bi-bag"></i>Votre panier est vide.<br><small>Libérez votre énergie, ajoutez une pièce Free Spirit.</small></div>`;
  } else {
    body.innerHTML = state.cart.map((item, idx) => {
      const p = state.products.find(pr => pr.id === item.id);
      if (!p) return '';
      return `
      <div class="cart-item">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="ci-name">${escapeHtml(p.name)}</div>
              <div class="ci-meta">Taille : ${escapeHtml(item.size)}</div>
            </div>
            <button class="ci-remove" onclick="removeFromCart(${idx})" title="Retirer"><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <div class="qty-stepper">
              <button onclick="setCartQty(${idx}, ${item.qty - 1})"><i class="bi bi-dash"></i></button>
              <span>${item.qty}</span>
              <button onclick="setCartQty(${idx}, ${item.qty + 1})"><i class="bi bi-plus"></i></button>
            </div>
            <span class="ci-price">${fmt(p.price * item.qty)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  const subtotal = cartSubtotal();
  const discount = promoDiscount(state.promo, subtotal);
  const totalsEl = document.getElementById('cartTotals');
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="cart-total-row"><span>Sous-total</span><span>${fmt(subtotal)}</span></div>
      ${state.promo ? `<div class="cart-total-row"><span>Code ${escapeHtml(state.promo.code)}</span><span class="discount">-${fmt(discount)}</span></div>` : ''}
      <div class="cart-total-row grand"><span>Total</span><span>${fmt(subtotal - discount)}</span></div>`;
  }

  const promoInput = document.getElementById('promoInput');
  const promoFeedback = document.getElementById('promoFeedback');
  if (promoInput && state.promo) promoInput.value = state.promo.code;
  if (promoFeedback) {
    promoFeedback.innerHTML = state.promo
      ? `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Code "${escapeHtml(state.promo.code)}" appliqué</span>`
      : '';
  }
  const checkoutBtn = document.getElementById('checkoutWhatsApp');
  if (checkoutBtn) checkoutBtn.disabled = !state.cart.length;
}

function renderAccount() {
  const btn = document.getElementById('accountBtn');
  if (!btn) return;
  if (state.user) {
    btn.innerHTML = `<span class="chrome-text font-display fw-bold">${escapeHtml(state.user.name.charAt(0).toUpperCase())}</span>`;
    btn.title = `Compte : ${state.user.name}`;
  } else {
    btn.innerHTML = `<i class="bi bi-person"></i>`;
    btn.title = 'Se connecter';
  }
}

function renderOrders() {
  const zone = document.getElementById('ordersList');
  if (!zone) return;
  const orders = state.user ? state.orders : state.orders;
  if (!orders.length) {
    zone.innerHTML = `<div class="empty-state"><i class="bi bi-receipt"></i>Aucune commande pour le moment.</div>`;
    return;
  }
  zone.innerHTML = orders.map(o => `
    <div class="order-card mb-3">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <span class="oc-id chrome-text">${escapeHtml(o.id)}</span>
          <div class="oc-date mt-1">${new Date(o.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · ${escapeHtml(o.customer)}</div>
        </div>
        <div class="text-end">
          <div class="font-display fw-bold">${fmt(o.total)}</div>
          ${o.promoCode ? `<small class="red-text">Code ${escapeHtml(o.promoCode)} appliqué</small>` : ''}
        </div>
      </div>
      <hr class="divider-chrome my-2">
      <small class="text-secondary">${o.items.map(i => `${escapeHtml(i.name)} (T.${escapeHtml(i.size)}) ×${i.qty}`).join(' · ')}</small>
    </div>`).join('');
}

/* ==================== QUICK VIEW ==================== */
function openQuickView(id) {
  const p = state.products.find(pr => pr.id === id);
  if (!p) return;
  state.qv = { product: p, size: p.sizes[0], qty: 1 };

  const body = document.getElementById('quickViewBody');
  if (!body) return;
  const hasPromo = p.oldPrice && p.oldPrice > p.price;
  const active = activePromos();
  body.innerHTML = `
    <div class="row g-4">
      <div class="col-md-6">
        <div class="qv-media"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}"></div>
      </div>
      <div class="col-md-6 d-flex flex-column">
        <span class="label-tag mb-2">${CATEGORIES[p.category] || ''}</span>
        <h3 class="section-title fs-3 mb-2">${escapeHtml(p.name)}</h3>
        <div class="pc-price mb-3">
          <span class="now fs-4 ${hasPromo ? 'hot' : ''}">${fmt(p.price)}</span>
          ${hasPromo ? `<span class="old fs-6">${fmt(p.oldPrice)}</span>` : ''}
        </div>
        <p class="text-secondary small lh-lg mb-3">${escapeHtml(p.desc || '')}</p>
        ${active.length ? `<div class="mb-3"><small class="text-secondary"><i class="bi bi-lightning-charge-fill red-text me-1"></i>Code actif : <b class="text-white">${escapeHtml(active[0].code)}</b> — appliqué si saisi dans le panier</small></div>` : ''}
        <div class="mb-2"><small class="text-uppercase text-secondary" style="letter-spacing:.2em">Taille</small></div>
        <div class="d-flex flex-wrap gap-2 mb-3" id="qvSizes">
          ${p.sizes.map((s, i) => `<span class="size-pill ${i === 0 ? 'selected' : ''}" data-size="${escapeHtml(s)}" onclick="selectQvSize(this)">${escapeHtml(s)}</span>`).join('')}
        </div>
        <div class="d-flex align-items-center gap-3 mb-4">
          <div class="qty-stepper">
            <button onclick="setQvQty(-1)"><i class="bi bi-dash"></i></button>
            <span id="qvQty">1</span>
            <button onclick="setQvQty(1)"><i class="bi bi-plus"></i></button>
          </div>
          <small class="text-secondary">Quantité</small>
        </div>
        <div class="d-grid gap-2 mt-auto">
          <button class="btn btn-fs" onclick="qvAddToCart()"><i class="bi bi-bag-plus me-2"></i>Ajouter au panier</button>
          <button class="btn btn-chrome" onclick="orderProductViaWhatsApp()"><i class="bi bi-whatsapp me-2"></i>Commander via WhatsApp</button>
        </div>
      </div>
    </div>`;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('quickViewModal')).show();
}

function selectQvSize(el) {
  document.querySelectorAll('#qvSizes .size-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  state.qv.size = el.dataset.size;
}

function setQvQty(delta) {
  state.qv.qty = Math.max(1, state.qv.qty + delta);
  const el = document.getElementById('qvQty');
  if (el) el.textContent = state.qv.qty;
}

function qvAddToCart() {
  addToCart(state.qv.product.id, state.qv.size, state.qv.qty);
  bootstrap.Modal.getInstance(document.getElementById('quickViewModal'))?.hide();
}

function quickAdd(id) {
  const p = state.products.find(pr => pr.id === id);
  if (p) addToCart(id, p.sizes[0], 1);
}

/* ==================== AUTH (SIMULÉE) ==================== */
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('authLoginForm').classList.toggle('d-none', tab !== 'login');
  document.getElementById('authRegisterForm').classList.toggle('d-none', tab !== 'register');
}

function handleAuth(mode, e) {
  e.preventDefault();
  const name = document.getElementById(mode === 'login' ? 'loginName' : 'registerName')?.value.trim();
  const email = document.getElementById(mode === 'login' ? 'loginEmail' : 'registerEmail')?.value.trim();
  if (!name || !email) { toast('Remplis tous les champs'); return; }
  state.user = { name, email };
  saveUser();
  renderAccount();
  renderOrders();
  bootstrap.Modal.getInstance(document.getElementById('authModal'))?.hide();
  toast(`Bienvenue dans l'univers Free Spirit, ${name}`, 'success');
}

function socialLogin(provider) {
  state.user = { name: provider + ' Rider', email: `rider@${provider.toLowerCase()}.com` };
  saveUser();
  renderAccount();
  renderOrders();
  bootstrap.Modal.getInstance(document.getElementById('authModal'))?.hide();
  toast(`Connexion ${provider} simulée — bienvenue !`, 'success');
}

function logout() {
  state.user = null;
  saveUser();
  renderAccount();
  renderOrders();
  bootstrap.Modal.getInstance(document.getElementById('accountModal'))?.hide();
  toast('Déconnexion effectuée');
}

/* ==================== INIT BOUTIQUE ==================== */
function initShop() {
  loadState();

  renderProducts();
  renderPromoStrip();
  renderCart();
  renderAccount();
  renderOrders();

  // Filtres catégories
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      renderProducts();
    });
  });

  // Navbar effet scroll
  const navbar = document.getElementById('mainNavbar');
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 40), { passive: true });

  // Appliquer un code promo
  const applyBtn = document.getElementById('applyPromo');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const input = document.getElementById('promoInput');
      const promo = findPromo(input.value);
      if (!input.value.trim()) { state.promo = null; renderCart(); return; }
      if (promo) {
        state.promo = promo;
        toast(`Code "${promo.code}" appliqué : ${promo.type === 'percent' ? '-' + promo.value + '%' : '-' + fmt(promo.value)}`, 'success');
      } else {
        state.promo = null;
        toast('Code promo invalide ou expiré');
      }
      renderCart();
    });
  }

  // Liens & boutons statiques
  const waFloat = document.getElementById('waFloat');
  if (waFloat) waFloat.href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour FREE SPIRIT ! J'aimerais des informations sur vos pièces.")}`;
  const phoneFloat = document.getElementById('phoneFloat');
  if (phoneFloat) phoneFloat.href = `tel:${CONFIG.PHONE_TEL}`;
  const phoneLabel = document.getElementById('phoneLabel');
  if (phoneLabel) phoneLabel.textContent = CONFIG.PHONE_DISPLAY;
  const heroWa = document.getElementById('heroWhatsApp');
  if (heroWa) heroWa.addEventListener('click', () => openWhatsApp("Bonjour FREE SPIRIT ! Je veux commander une pièce de la collection."));
  const contactWa = document.getElementById('contactWhatsApp');
  if (contactWa) contactWa.href = waFloat ? waFloat.href : '#';

  // Compte
  const accountBtn = document.getElementById('accountBtn');
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      if (state.user) {
        document.getElementById('accountName').textContent = state.user.name;
        document.getElementById('accountEmail').textContent = state.user.email;
        renderOrders();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('accountModal')).show();
      } else {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).show();
      }
    });
  }

  // Mise à jour en temps réel si l'admin modifie les données dans un autre onglet
  window.addEventListener('storage', e => {
    if (e.key === KEYS.products) { state.products = DB.get(KEYS.products, []); renderProducts(); renderCart(); }
    if (e.key === KEYS.promos) { state.promos = DB.get(KEYS.promos, []); renderPromoStrip(); renderCart(); }
  });

  // Parallaxe légère des étoiles du hero
  const hero = document.getElementById('hero');
  if (hero) {
    hero.addEventListener('mousemove', e => {
      const x = (e.clientX / window.innerWidth - .5);
      const y = (e.clientY / window.innerHeight - .5);
      document.querySelectorAll('.hero-star, .hero-star-2').forEach((el, i) => {
        const depth = i === 0 ? 26 : 14;
        el.style.translate = `${x * depth}px ${y * depth}px`;
      });
    });
  }

  // Onglets auth au clic
  document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => switchAuthTab(t.dataset.tab)));
  const loginForm = document.getElementById('authLoginForm');
  if (loginForm) loginForm.addEventListener('submit', e => handleAuth('login', e));
  const registerForm = document.getElementById('authRegisterForm');
  if (registerForm) registerForm.addEventListener('submit', e => handleAuth('register', e));

  observeReveals();
}

/* ==================== REVEAL AU SCROLL ==================== */
let revealObserver = null;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('visible'); revealObserver.unobserve(en.target); }
      });
    }, { threshold: .12 });
  }
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
}

/* ============================================================
   ADMINISTRATION
   ============================================================ */
let adminTab = 'products';
let editingProductId = null;
let editingPromoId = null;

function initAdmin() {
  loadState();
  checkAdminGate();

  const pfImage = document.getElementById('pfImage');
  if (pfImage) pfImage.addEventListener('input', updateProductImagePreview);
  const pfImageFile = document.getElementById('pfImageFile');
  if (pfImageFile) pfImageFile.addEventListener('change', handleProductImageFile);
  const pfPreview = document.getElementById('pfImagePreview');
  if (pfPreview) pfPreview.addEventListener('error', () => {
    document.getElementById('pfImagePreviewWrap')?.classList.remove('show');
  });
}

function checkAdminGate() {
  const unlocked = sessionStorage.getItem(KEYS.admin) === '1';
  document.getElementById('adminGate').classList.toggle('d-none', unlocked);
  document.getElementById('adminShell').classList.toggle('d-none', !unlocked);
  if (unlocked) renderAdmin();
}

function submitAdminPassword(e) {
  e.preventDefault();
  const input = document.getElementById('adminPassword');
  if (input.value === CONFIG.ADMIN_PASSWORD) {
    sessionStorage.setItem(KEYS.admin, '1');
    input.value = '';
    checkAdminGate();
    toast('Accès administrateur débloqué', 'success');
  } else {
    toast('Mot de passe incorrect');
    input.classList.add('is-invalid');
    setTimeout(() => input.classList.remove('is-invalid'), 1500);
  }
}

function adminLogout() {
  sessionStorage.removeItem(KEYS.admin);
  checkAdminGate();
}

function setAdminTab(tab) {
  adminTab = tab;
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('adminProductsPanel').classList.toggle('d-none', tab !== 'products');
  document.getElementById('adminPromosPanel').classList.toggle('d-none', tab !== 'promos');
}

function renderAdmin() {
  renderAdminStats();
  renderAdminProducts();
  renderAdminPromos();
}

function renderAdminStats() {
  const el = id => document.getElementById(id);
  if (el('statProducts')) el('statProducts').textContent = state.products.length;
  if (el('statPromos')) el('statPromos').textContent = state.promos.length;
  if (el('statActivePromos')) el('statActivePromos').textContent = activePromos().length;
  if (el('statOrders')) el('statOrders').textContent = state.orders.length;
  if (el('statCatalogValue')) el('statCatalogValue').textContent = fmt(state.products.reduce((s, p) => s + Number(p.price), 0));
}

/* ---------- CRUD PRODUITS ---------- */
function renderAdminProducts() {
  const tbody = document.getElementById('adminProductsBody');
  if (!tbody) return;
  if (!state.products.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="bi bi-inboxes"></i>Aucun produit. Ajoute ton premier article.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.products.map(p => `
    <tr>
      <td><img class="thumb" src="${escapeHtml(p.image)}" alt=""></td>
      <td><span class="t-name">${escapeHtml(p.name)}</span></td>
      <td>${CATEGORIES[p.category] || escapeHtml(p.category)}</td>
      <td>
        <span class="fw-bold">${fmt(p.price)}</span>
        ${p.oldPrice ? `<br><small class="text-secondary text-decoration-line-through">${fmt(p.oldPrice)}</small>` : ''}
      </td>
      <td><small class="text-secondary">${(p.sizes || []).map(escapeHtml).join(', ')}</small></td>
      <td class="text-nowrap">
        <button class="icon-action me-1" title="Modifier" onclick="openProductForm('${p.id}')"><i class="bi bi-pencil"></i></button>
        <button class="icon-action danger" title="Supprimer" onclick="deleteProduct('${p.id}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

/* Image produit : saisie par URL ou import d'un fichier local (data URL) */
function updateProductImagePreview() {
  const input = document.getElementById('pfImage');
  const wrap = document.getElementById('pfImagePreviewWrap');
  const img = document.getElementById('pfImagePreview');
  if (!input || !wrap || !img) return;
  const val = input.value.trim();
  if (!val) { wrap.classList.remove('show'); return; }
  img.src = val;
  wrap.classList.add('show');
}

function handleProductImageFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    e.target.value = '';
    toast('Image trop lourde (2 Mo max). Choisissez un fichier plus léger ou passez par une URL.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('pfImage').value = reader.result;
    updateProductImagePreview();
    toast('Image chargée. Enregistrez pour l\'ajouter à la boutique.', 'success');
  };
  reader.onerror = () => toast('Impossible de lire ce fichier image');
  reader.readAsDataURL(file);
}

function openProductForm(id = null) {
  editingProductId = id;
  const p = id ? state.products.find(pr => pr.id === id) : null;
  document.getElementById('productFormTitle').textContent = p ? 'Modifier le produit' : 'Ajouter un produit';
  document.getElementById('pfName').value = p ? p.name : '';
  document.getElementById('pfCategory').value = p ? p.category : 'tshirts';
  document.getElementById('pfPrice').value = p ? p.price : '';
  document.getElementById('pfOldPrice').value = p && p.oldPrice ? p.oldPrice : '';
  document.getElementById('pfImage').value = p ? p.image : '';
  document.getElementById('pfImageFile').value = '';
  document.getElementById('pfSizes').value = p ? (p.sizes || []).join(', ') : 'S, M, L, XL';
  document.getElementById('pfDesc').value = p ? (p.desc || '') : '';
  updateProductImagePreview();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal')).show();
}

function submitProductForm(e) {
  e.preventDefault();
  const name = document.getElementById('pfName').value.trim();
  const category = document.getElementById('pfCategory').value;
  const price = Number(document.getElementById('pfPrice').value);
  const oldPriceRaw = document.getElementById('pfOldPrice').value;
  const image = document.getElementById('pfImage').value.trim();
  const sizes = document.getElementById('pfSizes').value.split(',').map(s => s.trim()).filter(Boolean);
  const desc = document.getElementById('pfDesc').value.trim();

  if (!name || !price || !image) { toast('Nom, prix et image sont obligatoires'); return; }

  const data = {
    name, category, price,
    oldPrice: oldPriceRaw ? Number(oldPriceRaw) : null,
    image, sizes: sizes.length ? sizes : ['Unique'], desc,
  };

  if (editingProductId) {
    const idx = state.products.findIndex(p => p.id === editingProductId);
    state.products[idx] = { ...state.products[idx], ...data };
    toast(`Produit "${name}" modifié`, 'success');
  } else {
    state.products.unshift({ id: uid(), ...data });
    toast(`Produit "${name}" ajouté à la boutique`, 'success');
  }
  saveProducts();
  renderAdminProducts();
  renderAdminStats();
  bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
}

function deleteProduct(id) {
  const p = state.products.find(pr => pr.id === id);
  if (!p) return;
  if (!confirm(`Supprimer définitivement "${p.name}" ?`)) return;
  state.products = state.products.filter(pr => pr.id !== id);
  saveProducts();
  renderAdminProducts();
  renderAdminStats();
  toast(`Produit "${p.name}" supprimé`);
}

/* ---------- CRUD PROMOS ---------- */
function renderAdminPromos() {
  const tbody = document.getElementById('adminPromosBody');
  if (!tbody) return;
  if (!state.promos.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-tag"></i>Aucun code promo créé.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.promos.map(p => `
    <tr>
      <td><span class="t-name chrome-text">${escapeHtml(p.code)}</span></td>
      <td>${p.type === 'percent' ? `Réduction <b>-${p.value}%</b>` : `Montant fixe <b>-${fmt(p.value)}</b>`}</td>
      <td><span class="status-pill ${p.active ? 'on' : 'off'}">${p.active ? 'Actif' : 'Inactif'}</span></td>
      <td class="text-nowrap">
        <button class="icon-action me-1" title="Modifier" onclick="openPromoForm('${p.id}')"><i class="bi bi-pencil"></i></button>
        <button class="icon-action ${p.active ? '' : ''} me-1" title="${p.active ? 'Désactiver' : 'Activer'}" onclick="togglePromo('${p.id}')"><i class="bi bi-${p.active ? 'pause' : 'play'}"></i></button>
        <button class="icon-action danger" title="Supprimer" onclick="deletePromo('${p.id}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

function openPromoForm(id = null) {
  editingPromoId = id;
  const p = id ? state.promos.find(pr => pr.id === id) : null;
  document.getElementById('promoFormTitle').textContent = p ? 'Modifier le code promo' : 'Créer un code promo';
  document.getElementById('prfCode').value = p ? p.code : '';
  document.getElementById('prfType').value = p ? p.type : 'percent';
  document.getElementById('prfValue').value = p ? p.value : '';
  document.getElementById('prfActive').checked = p ? p.active : true;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('promoModal')).show();
}

function submitPromoForm(e) {
  e.preventDefault();
  const code = document.getElementById('prfCode').value.trim().toUpperCase();
  const type = document.getElementById('prfType').value;
  const value = Number(document.getElementById('prfValue').value);
  const active = document.getElementById('prfActive').checked;

  if (!code || !value || value <= 0) { toast('Code et valeur obligatoires'); return; }
  const duplicate = state.promos.find(p => p.code.toUpperCase() === code && p.id !== editingPromoId);
  if (duplicate) { toast('Ce code existe déjà'); return; }

  if (editingPromoId) {
    const idx = state.promos.findIndex(p => p.id === editingPromoId);
    state.promos[idx] = { ...state.promos[idx], code, type, value, active };
    toast(`Code "${code}" modifié`, 'success');
  } else {
    state.promos.unshift({ id: uid(), code, type, value, active });
    toast(`Code "${code}" créé — visible sur la boutique`, 'success');
  }
  savePromos();
  renderAdminPromos();
  renderAdminStats();
  bootstrap.Modal.getInstance(document.getElementById('promoModal'))?.hide();
}

function togglePromo(id) {
  const p = state.promos.find(pr => pr.id === id);
  if (!p) return;
  p.active = !p.active;
  savePromos();
  renderAdminPromos();
  renderAdminStats();
  toast(`Code "${p.code}" ${p.active ? 'activé' : 'désactivé'}`);
}

function deletePromo(id) {
  const p = state.promos.find(pr => pr.id === id);
  if (!p) return;
  if (!confirm(`Supprimer le code "${p.code}" ?`)) return;
  state.promos = state.promos.filter(pr => pr.id !== id);
  savePromos();
  renderAdminPromos();
  renderAdminStats();
  toast(`Code "${p.code}" supprimé`);
}

/* ==================== ROUTAGE ==================== */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'shop') initShop();
  if (page === 'admin') initAdmin();
});
