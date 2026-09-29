/* ============================================================
   FREE SPIRIT — Logique interactive
   Boutique (index.html) + Administration (admin.html)
   Données dans Supabase ; le panier reste sur l'appareil du visiteur
   ============================================================ */

'use strict';

/* ==================== CONFIGURATION ==================== */
const CONFIG = {
  CURRENCY: 'FCFA',
  // Clé publique : elle ne donne accès qu'à ce que les politiques RLS de la
  // base autorisent. La clé service_role, elle, ne doit jamais arriver ici.
  SUPABASE_URL: 'https://msamsyotdkxwhwfutens.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zYW1zeW90ZGt4d2h3ZnV0ZW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MzgzMzIsImV4cCI6MjEwNjIxNDMzMn0.FiiWF8yBmiuYTQ-MMaHi3S1IWR3mVXYDfJtYpplhA1Q',
};

// Infos de la boutique : modifiables par l'admin dans admin.html > onglet « Boutique »
const DEFAULT_SETTINGS = {
  whatsapp: '22893838593',            // numéro WhatsApp, format international sans "+"
  phone: '+228 93 83 85 93',          // numéro affiché sur le site
  email: 'contact@freespirit.prod',
  address: 'Lomé, Togo',
  mapsUrl: '',                        // lien Google Maps de la boutique (optionnel)
  waProfile: '',                      // lien du profil WhatsApp (optionnel)
  tiktok: '',                         // pages réseaux sociaux (optionnelles)
  instagram: '',
  facebook: '',
};

const CATEGORIES = {
  tshirts: 'T-Shirts',
  pantalons: 'Pantalons',
  chaussures: 'Chaussures',
  ceintures: 'Ceintures',
};

/* ==================== STOCKAGE ==================== */
// Base de données : catalogue, promos, commandes, avis, vidéos, infos boutique.
const sb = window.supabase
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

// localStorage ne garde que ce qui appartient à l'appareil du visiteur.
const DB = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

const KEYS = {
  cart: 'fs_cart_v2',
  customer: 'fs_customer_v1',
};

const uid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const escapeHtml = (str = '') => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => `${Number(n).toLocaleString('fr-FR')} ${CONFIG.CURRENCY}`;

/* ==================== ÉTAT GLOBAL ==================== */
const state = {
  products: [],
  promos: [],
  cart: [],
  orders: [],
  customer: { name: '', whatsapp: '' },  // identité saisie dans le panier, mémorisée sur l'appareil
  reviews: [],
  reels: [],
  settings: { ...DEFAULT_SETTINGS },
  promo: null,        // code promo appliqué dans le panier
  filter: 'all',
  qv: { product: null, size: null, qty: 1 }, // quick view
};

/* ==================== COUCHE BASE DE DONNÉES ====================
   Lecture publique pour le catalogue, les avis publiés, les vidéos et les
   infos boutique. Écriture réservée au compte admin connecté (RLS), sauf
   les commandes et les avis que le visiteur peut déposer. */

async function fetchRows(table) {
  if (!sb) throw new Error('Bibliothèque Supabase indisponible');
  const { data, error } = await sb.from(table).select('*');
  if (error) throw error;
  return data || [];
}

async function writeRow(table, row) {
  const { error } = await sb.from(table).upsert(row);
  if (error) throw error;
}

/* Le visiteur anonyme n'a qu'un droit d'insertion sur les avis et les
   commandes : un upsert exigerait en plus un droit de modification qu'il
   n'a pas, d'où l'insertion simple ici. */
async function insertRow(table, row) {
  const { error } = await sb.from(table).insert(row);
  if (error) throw error;
}

async function deleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

/* Le détail technique part dans la console : le vendeur n'a qu'à savoir
   que l'enregistrement n'a pas abouti. */
function dbFail(error, message) {
  console.error('[FREE SPIRIT]', message, error);
  toast(message);
}

// Le tri se fait ici plutôt que dans la requête : les listes sont courtes
// et les colonnes de date sont en camelCase.
const newest = (key = 'createdAt') => (a, b) => new Date(b[key]) - new Date(a[key]);
const oldest = (key = 'createdAt') => (a, b) => new Date(a[key]) - new Date(b[key]);

// Chaque écriture envoie la ligne entière : la base refuse une ligne partielle.
const productRow = p => ({
  id: p.id, name: p.name, category: p.category, price: Number(p.price),
  oldPrice: p.oldPrice ? Number(p.oldPrice) : null, image: p.image || '',
  sizes: p.sizes || [], desc: p.desc || '', stock: p.stock ?? null,
  createdAt: p.createdAt || new Date().toISOString(),
});
const promoRow = p => ({
  id: p.id, code: p.code, type: p.type, value: Number(p.value),
  active: !!p.active, createdAt: p.createdAt || new Date().toISOString(),
});
const orderRow = o => ({
  id: o.id, date: o.date, items: o.items, subtotal: o.subtotal, discount: o.discount,
  promoCode: o.promoCode || null, total: o.total, customer: o.customer, whatsapp: o.whatsapp || '',
});
const reviewRow = r => ({
  id: r.id, productId: r.productId, rating: Number(r.rating), author: r.author,
  comment: r.comment || '', date: r.date || new Date().toISOString(),
  status: r.status, verified: !!r.verified,
});
const reelRow = r => ({
  id: r.id, title: r.title || '', video: r.video || '', poster: r.poster || '',
  link: r.link || '', linkLabel: r.linkLabel || '',
  createdAt: r.createdAt || new Date().toISOString(),
});

const SETTINGS_FIELDS = ['whatsapp', 'phone', 'email', 'address', 'mapsUrl', 'waProfile', 'tiktok', 'instagram', 'facebook'];
const settingsRow = s => ({
  id: 1,
  ...Object.fromEntries(SETTINGS_FIELDS.map(k => [k, s[k] || ''])),
  updatedAt: new Date().toISOString(),
});

async function loadState() {
  state.cart = DB.get(KEYS.cart, []);
  state.customer = { name: '', whatsapp: '', ...(DB.get(KEYS.customer, null) || {}) };
  try {
    const [products, promos, reviews, reels, settings] = await Promise.all([
      fetchRows('products'), fetchRows('promos'), fetchRows('reviews'),
      fetchRows('reels'), fetchRows('settings'),
    ]);
    state.products = products.sort(newest());
    state.promos = promos.sort(newest());
    state.reviews = reviews.sort(newest());
    state.reels = reels.sort(oldest());
    state.settings = { ...DEFAULT_SETTINGS, ...(settings[0] || {}) };
  } catch (error) {
    dbFail(error, 'Boutique indisponible : les articles ne peuvent pas être chargés. Vérifie ta connexion Internet.');
  }
}

/* Les commandes ne sont lisibles que par le compte admin connecté. */
async function loadOrders() {
  try {
    state.orders = (await fetchRows('orders')).sort(newest('date'));
  } catch (error) {
    state.orders = [];
    dbFail(error, 'Liste des commandes indisponible');
  }
}

const saveCart = () => DB.set(KEYS.cart, state.cart);
const saveCustomer = () => DB.set(KEYS.customer, state.customer);

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

/* ==================== COORDONNÉES DE LA BOUTIQUE ==================== */
const WA_INTRO = "Bonjour FREE SPIRIT ! J'aimerais des informations sur vos pièces.";

const digitsOnly = value => String(value || '').replace(/\D/g, '');

/* Un lien affiché sur le site doit rester inoffensif même si la base contient
   une valeur inattendue : seuls http(s), tel:, mailto: et les chemins relatifs
   passent ; tout autre schéma (javascript:, data:…) devient '#'. */
const safeHref = raw => {
  const url = String(raw || '').trim();
  if (!url) return '#';
  if (/^(https?:|tel:|mailto:)/i.test(url)) return url;
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') ? '#' : url;
};
const telHref = () => {
  const n = digitsOnly(state.settings.phone);
  return n ? `tel:+${n}` : '#';
};
const waHref = text => {
  const n = digitsOnly(state.settings.whatsapp);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text || '')}` : '#';
};
const mapsHref = () => {
  const { mapsUrl, address } = state.settings;
  if (mapsUrl && /^https?:\/\//i.test(mapsUrl)) return mapsUrl;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return '#';
};

/* Branche tous les liens du site sur les coordonnées enregistrées par l'admin */
function applyShopInfo() {
  const s = state.settings;
  const link = (id, href) => { const el = document.getElementById(id); if (el) el.href = href; };
  const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  link('waFloat', waHref(WA_INTRO));
  link('phoneFloat', telHref());
  link('phoneFooterLink', telHref());
  link('emailFooterLink', s.email ? `mailto:${s.email}` : '#');
  link('mapsFooterLink', mapsHref());
  link('contactWhatsApp', s.waProfile ? safeHref(s.waProfile) : waHref(WA_INTRO));

  text('phoneLabel', s.phone || 'Numéro à définir');
  text('emailLabel', s.email || 'Email à définir');
  text('addressLabel', s.address || 'Localisation à définir');

  // Réseaux sociaux : un lien non renseigné reste masqué
  [['linkTiktok', s.tiktok], ['linkInstagram', s.instagram], ['linkFacebook', s.facebook]].forEach(([id, url]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = safeHref(url);
    el.classList.toggle('d-none', !url);
  });
}

/* ==================== WHATSAPP ==================== */
function openWhatsApp(text) {
  const url = waHref(text);
  if (url === '#') { toast("Numéro WhatsApp non renseigné dans l'espace admin"); return; }
  window.open(url, '_blank');
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
  if (state.customer.name || state.customer.whatsapp) {
    lines.push('');
    lines.push(`Client : ${state.customer.name || '—'}`);
    if (state.customer.whatsapp) lines.push(`WhatsApp : ${state.customer.whatsapp}`);
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
  if (!validateCustomer()) return;
  const items = state.cart.map(i => {
    const p = state.products.find(pr => pr.id === i.id);
    return { ...i, name: p ? p.name : 'Produit', price: p ? p.price : 0 };
  });
  const subtotal = cartSubtotal();
  const discount = promoDiscount(state.promo, subtotal);
  const message = buildOrderMessage(items, state.promo, { subtotal, discount, total: subtotal - discount }, 'NOUVELLE COMMANDE');
  openWhatsApp(message);
  registerOrder(items, { subtotal, discount, total: subtotal - discount });
  clearCartSilent();
  toast('Commande transmise sur WhatsApp — merci !', 'success');
}

/* La commande part d'abord sur WhatsApp : l'enregistrement en base ne doit
   jamais bloquer le visiteur, d'où l'échec signalé sans interrompre. */
async function registerOrder(items, totals) {
  const order = orderRow({
    id: 'FS-' + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    items: items.map(i => ({ name: i.name, size: i.size, qty: i.qty, price: i.price })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    promoCode: state.promo ? state.promo.code : null,
    total: totals.total,
    customer: state.customer.name || 'Invité',
    whatsapp: state.customer.whatsapp || '',
  });
  state.orders.unshift(order);
  try {
    await insertRow('orders', order);
  } catch (error) {
    dbFail(error, 'Commande transmise sur WhatsApp, mais absente du tableau de bord');
  }
  renderAdminOrders();
  renderAdminStats();
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
  const r = ratingStats(p.id);
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
        ${r.count ? `<div class="pc-rating">${starsHTML(r.avg)}<span class="pc-rating-count">(${r.count})</span></div>` : ''}
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

/* ---------- IDENTITÉ DU CLIENT (nom + WhatsApp) ---------- */
function readCustomer() {
  state.customer = {
    name: (document.getElementById('customerName')?.value || '').trim(),
    whatsapp: (document.getElementById('customerWhatsapp')?.value || '').trim(),
  };
  saveCustomer();
}

function bindCustomerFields() {
  const name = document.getElementById('customerName');
  const whatsapp = document.getElementById('customerWhatsapp');
  if (name) { name.value = state.customer.name || ''; name.addEventListener('input', readCustomer); }
  if (whatsapp) { whatsapp.value = state.customer.whatsapp || ''; whatsapp.addEventListener('input', readCustomer); }
}

function validateCustomer() {
  readCustomer();
  if (!state.customer.name) {
    toast('Indique ton nom pour commander');
    document.getElementById('customerName')?.focus();
    return false;
  }
  if (!state.customer.whatsapp) {
    toast('Indique ton numéro WhatsApp pour commander');
    document.getElementById('customerWhatsapp')?.focus();
    return false;
  }
  return true;
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
        ${qvReviewsHTML(p)}
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

/* ==================== AVIS CLIENTS ====================
   Les visiteurs proposent un avis (statut « pending ») ; rien n'est publié
   tant que l'admin ne l'a pas validé dans admin.html > onglet « Avis ». */
const approvedReviews = productId => state.reviews
  .filter(r => r.productId === productId && r.status === 'approved')
  .sort((a, b) => new Date(b.date) - new Date(a.date));

function ratingStats(productId) {
  const list = approvedReviews(productId);
  if (!list.length) return { avg: 0, count: 0 };
  return { avg: list.reduce((n, r) => n + r.rating, 0) / list.length, count: list.length };
}

/* Étoiles pleines / demi / vides selon la note */
function starsHTML(rating) {
  const n = Number(rating) || 0;
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<i class="bi ${n >= i ? 'bi-star-fill' : (n >= i - 0.5 ? 'bi-star-half' : 'bi-star')}"></i>`;
  }
  return `<span class="stars" role="img" aria-label="${n.toFixed(1)} sur 5">${out}</span>`;
}

function reviewItemHTML(r) {
  return `
    <div class="review-item">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="review-author">${escapeHtml(r.author)}</div>
          ${starsHTML(r.rating)}
        </div>
        <small class="text-secondary text-nowrap">${new Date(r.date).toLocaleDateString('fr-FR')}</small>
      </div>
      ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ''}
      ${r.verified ? '<small class="review-verified"><i class="bi bi-patch-check-fill me-1"></i>Achat vérifié</small>' : ''}
    </div>`;
}

/* Bloc avis intégré à la fiche produit (quick view) */
function qvReviewsHTML(p) {
  const r = ratingStats(p.id);
  const list = approvedReviews(p.id).slice(0, 3);
  return `
    <div class="qv-reviews">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <span class="review-avg">${r.count ? r.avg.toFixed(1) : '—'}</span>
        ${starsHTML(r.avg)}
        <small class="text-secondary">${r.count ? `${r.count} avis client${r.count > 1 ? 's' : ''}` : 'Aucun avis pour le moment'}</small>
      </div>
      ${list.length ? `<div class="review-list">${list.map(reviewItemHTML).join('')}</div>` : ''}
      <button type="button" class="btn-review-toggle" onclick="toggleReviewForm(this)"><i class="bi bi-star me-1"></i>Donner mon avis</button>
      <form id="reviewForm" class="review-form d-none" onsubmit="submitReview(event)">
        <div class="star-picker mb-2" id="starPicker">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-btn" onclick="pickStar(${n})" aria-label="${n} étoile${n > 1 ? 's' : ''}"><i class="bi bi-star"></i></button>`).join('')}
        </div>
        <input type="hidden" id="reviewRating" value="0">
        <input type="text" class="form-control form-control-sm mb-2" id="reviewAuthor" placeholder="Ton nom ou pseudo" maxlength="40" required>
        <textarea class="form-control form-control-sm mb-2" id="reviewComment" rows="2" placeholder="Ton avis sur la pièce (optionnel)" maxlength="400"></textarea>
        <button type="submit" class="btn btn-fs btn-sm w-100"><i class="bi bi-send me-1"></i>Envoyer mon avis</button>
        <small class="review-note">Publié après validation de la boutique.</small>
      </form>
    </div>`;
}

function toggleReviewForm(btn) {
  const form = document.getElementById('reviewForm');
  if (!form) return;
  const hidden = form.classList.toggle('d-none');
  if (btn) btn.classList.toggle('d-none', !hidden);
  if (!hidden) document.getElementById('reviewAuthor')?.focus();
}

/* Allume les étoiles jusqu'à la note choisie */
function paintStars(pickerId, inputId, n) {
  const field = document.getElementById(inputId);
  if (field) field.value = n;
  document.querySelectorAll(`#${pickerId} .star-btn`).forEach((b, i) => {
    b.classList.toggle('on', i < n);
    const icon = b.querySelector('i');
    if (icon) icon.className = `bi ${i < n ? 'bi-star-fill' : 'bi-star'}`;
  });
}

function pickStar(n) { paintStars('starPicker', 'reviewRating', n); }
function pickAdminStar(n) { paintStars('arfStars', 'arfRating', n); }

async function submitReview(e) {
  e.preventDefault();
  const p = state.qv.product;
  if (!p) return;
  const rating = Number(document.getElementById('reviewRating')?.value || 0);
  const author = (document.getElementById('reviewAuthor')?.value || '').trim();
  const comment = (document.getElementById('reviewComment')?.value || '').trim();
  if (rating < 1 || rating > 5) { toast('Choisis une note en étoiles'); return; }
  if (!author) { toast('Indique ton nom ou ton pseudo'); return; }

  const alreadyKey = 'fs_reviewed_' + p.id;
  if (DB.get(alreadyKey, false)) { toast('Tu as déjà laissé un avis sur cette pièce'); return; }

  const review = reviewRow({
    id: uid(), productId: p.id, rating, author, comment,
    date: new Date().toISOString(), status: 'pending', verified: false,
  });
  try {
    await insertRow('reviews', review);
  } catch (error) {
    dbFail(error, "Avis non envoyé. Vérifie ta connexion puis réessaie.");
    return;
  }
  state.reviews.unshift(review);
  DB.set(alreadyKey, true);
  toggleReviewForm(null);
  const form = document.getElementById('reviewForm');
  if (form) { form.reset(); pickStar(0); form.classList.add('d-none'); }
  document.querySelectorAll('.btn-review-toggle').forEach(b => b.classList.remove('d-none'));
  toast('Merci ! Ton avis sera publié après validation.', 'success');
}

/* ==================== VIDÉOS 9:16 (SHOWREEL) ====================
   Une carte = un visuel vertical qui joue en muet, avec un bouton qui
   renvoie vers la publication d'origine (TikTok, Instagram, YouTube).
   Le visuel de couverture est facultatif : sans lui la carte montre la
   première image de la vidéo. Sur toutes les cartes vidéo, un clic (ou un
   survol à la souris) lance un extrait ; au survol le visuel s'efface. */
function reelCardHTML(r) {
  const src = r.video || '';
  const video = !!src;
  const preview = video && !!r.poster;
  const media = video
    ? `<video src="${escapeHtml(src)}"${r.poster ? ` poster="${escapeHtml(r.poster)}"` : ''} muted loop playsinline preload="metadata"></video>${
        preview ? `<img class="reel-still" src="${escapeHtml(r.poster)}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : ''
      }`
    : `<img src="${escapeHtml(r.poster || '')}" alt="${escapeHtml(r.title || '')}" loading="lazy">`;
  return `
    <figure class="reel-card${preview ? ' has-preview' : ''}" data-reel="${escapeHtml(r.id)}">
      <div class="reel-media">${media}</div>
      ${video ? '<button type="button" class="reel-play" aria-label="Lire la vidéo"><i class="bi bi-play-fill"></i></button>' : ''}
      <figcaption class="reel-caption">
        ${r.title ? `<span class="reel-title">${escapeHtml(r.title)}</span>` : ''}
        ${r.link ? `<a class="reel-link" href="${escapeHtml(safeHref(r.link))}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right me-1"></i>${escapeHtml(r.linkLabel || 'Voir la vidéo')}</a>` : ''}
      </figcaption>
      ${video ? '<button type="button" class="reel-sound" aria-label="Activer le son"><i class="bi bi-volume-mute"></i></button>' : ''}
    </figure>`;
}

function renderReels() {
  const section = document.getElementById('showreel');
  const track = document.getElementById('reelTrack');
  if (!section || !track) return;

  const cards = state.reels.filter(r => r.video || r.poster).map(reelCardHTML);

  if (!cards.length) { track.innerHTML = ''; section.classList.add('d-none'); return; }
  section.classList.remove('d-none');
  track.innerHTML = cards.join('');
  updateReelCounter();
  observeReels();
}

/* Seule la carte visible joue : les autres sont mises en pause pour
   économiser la batterie et le forfait data du visiteur. */
let reelObserver = null;
const hasHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function observeReels() {
  if (reelObserver) reelObserver.disconnect();
  reelObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const card = en.target;
      const v = card.querySelector('video');
      if (!v) return;
      if (en.isIntersecting && en.intersectionRatio >= .6) {
        // À la souris, le démarrage est piloté par le survol et par le clic.
        if (!hasHover()) v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, { threshold: [0, .6, 1] });
  document.querySelectorAll('#reelTrack .reel-card').forEach(c => reelObserver.observe(c));
  bindReelControls();
}

/* L'icône suit l'état réel de la vidéo : survol, clic et défilement
   automatique passent tous par les mêmes évènements de lecture. */
function paintReelState(card, playing) {
  card.classList.toggle('playing', playing);
  const btn = card.querySelector('.reel-play');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (icon) icon.className = `bi ${playing ? 'bi-pause-fill' : 'bi-play-fill'}`;
  btn.setAttribute('aria-label', playing ? 'Mettre en pause' : 'Lire la vidéo');
}

function syncReelSound(card) {
  const v = card.querySelector('video');
  const btn = card.querySelector('.reel-sound');
  if (!v || !btn) return;
  const icon = btn.querySelector('i');
  if (icon) icon.className = `bi ${v.muted ? 'bi-volume-mute' : 'bi-volume-up-fill'}`;
  btn.setAttribute('aria-label', v.muted ? 'Activer le son' : 'Couper le son');
}

/* Un clic lance la lecture avec le son — le geste de l'utilisateur l'autorise.
   Si le navigateur refuse, on retombe sur une lecture muette. */
function toggleReel(target) {
  const card = target.closest ? target.closest('.reel-card') : target;
  const v = card && card.querySelector('video');
  if (!v) return;
  if (v.paused) {
    delete card.dataset.hoverPlay;
    v.muted = false;
    v.play().then(() => syncReelSound(card), () => {
      v.muted = true;
      v.play().catch(() => {});
      syncReelSound(card);
    });
  } else {
    v.pause();
    syncReelSound(card);
  }
}

function bindReelControls() {
  const hover = hasHover();
  document.querySelectorAll('#reelTrack .reel-card').forEach(card => {
    const v = card.querySelector('video');
    if (!v) return;

    v.addEventListener('play', () => paintReelState(card, true));
    v.addEventListener('pause', () => paintReelState(card, false));

    // Sans visuel, `preload="metadata"` ne peint pas forcément la 1re image :
    // un décalage infime force l'affichage et évite une carte noire.
    if (!v.poster) {
      const seek = () => { try { v.currentTime = .001; } catch {} };
      if (v.readyState >= 1) seek();
      else v.addEventListener('loadedmetadata', seek, { once: true });
    }

    card.querySelector('.reel-play')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleReel(card);
    });
    card.querySelector('.reel-sound')?.addEventListener('click', e => {
      e.stopPropagation();
      v.muted = !v.muted;
      syncReelSound(card);
      if (!v.muted && v.paused) v.play().catch(() => {});
    });
    // Un clic n'importe où sur la carte lance ou coupe la lecture.
    card.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      toggleReel(card);
    });

    if (!hover) return;
    card.addEventListener('mouseenter', () => {
      if (!v.paused) return;
      card.dataset.hoverPlay = '1';
      v.currentTime = 0;
      v.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => {
      if (card.dataset.hoverPlay !== '1') return;
      delete card.dataset.hoverPlay;
      v.pause();
      v.currentTime = 0;
    });
  });
}

function updateReelCounter() {
  const track = document.getElementById('reelTrack');
  const counter = document.getElementById('reelCounter');
  if (!track || !counter) return;
  const cards = [...track.querySelectorAll('.reel-card')];
  if (!cards.length) return;
  const trackBox = track.getBoundingClientRect();
  const mid = trackBox.left + trackBox.width / 2;
  let idx = 0;
  let best = Infinity;
  cards.forEach((c, i) => {
    const box = c.getBoundingClientRect();
    const distance = Math.abs(box.left + box.width / 2 - mid);
    if (distance < best) { best = distance; idx = i; }
  });
  counter.textContent = `${idx + 1} / ${cards.length}`;
}

/* ==================== INIT BOUTIQUE ==================== */
async function initShop() {
  await loadState();

  renderProducts();
  renderPromoStrip();
  renderCart();
  bindCustomerFields();
  renderReels();

  const reelTrack = document.getElementById('reelTrack');
  if (reelTrack) reelTrack.addEventListener('scroll', updateReelCounter, { passive: true });

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

  // Coordonnées de la boutique (numéro, WhatsApp, email, localisation)
  applyShopInfo();
  const heroWa = document.getElementById('heroWhatsApp');
  if (heroWa) heroWa.addEventListener('click', () => openWhatsApp('Bonjour FREE SPIRIT ! Je veux commander une pièce de la collection.'));

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
let editingReelId = null;

async function initAdmin() {
  await loadState();
  await checkAdminGate();

  const pfImage = document.getElementById('pfImage');
  if (pfImage) pfImage.addEventListener('input', updateProductImagePreview);
  const pfImageFile = document.getElementById('pfImageFile');
  if (pfImageFile) pfImageFile.addEventListener('change', handleProductImageFile);
  const pfPreview = document.getElementById('pfImagePreview');
  if (pfPreview) pfPreview.addEventListener('error', () => {
    document.getElementById('pfImagePreviewWrap')?.classList.remove('show');
  });

  const rfPoster = document.getElementById('rfPoster');
  if (rfPoster) rfPoster.addEventListener('input', updateReelPosterPreview);
  const rfPosterFile = document.getElementById('rfPosterFile');
  if (rfPosterFile) rfPosterFile.addEventListener('change', handleReelPosterFile);
  const rfPreview = document.getElementById('rfPosterPreview');
  if (rfPreview) rfPreview.addEventListener('error', () => {
    document.getElementById('rfPosterPreviewWrap')?.classList.remove('show');
  });
}

/* Connexion réelle : la session Supabase survit au rechargement de la page
   et disparaît au clic sur « Verrouiller ». */
async function checkAdminGate() {
  const session = sb ? (await sb.auth.getSession()).data.session : null;
  const unlocked = !!session;
  document.getElementById('adminGate').classList.toggle('d-none', unlocked);
  document.getElementById('adminShell').classList.toggle('d-none', !unlocked);
  const who = document.getElementById('adminWho');
  if (who) who.innerHTML = unlocked
    ? `<i class="bi bi-person-check me-1"></i>${escapeHtml(session.user.email)}`
    : '';
  if (!unlocked) return;
  await loadOrders();
  renderAdmin();
}

async function submitAdminLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { toast('Email et mot de passe obligatoires'); return; }
  if (!sb) { toast('Base de données injoignable. Recharge la page.'); return; }

  const button = document.querySelector('#adminGate button[type="submit"]');
  button.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  button.disabled = false;

  if (error) {
    console.error('[FREE SPIRIT] Connexion refusée', error);
    toast(/invalid login credentials|email not confirmed/i.test(error.message)
      ? 'Email ou mot de passe incorrect'
      : 'Connexion impossible, réessaie dans un instant');
    passwordInput.classList.add('is-invalid');
    setTimeout(() => passwordInput.classList.remove('is-invalid'), 1500);
    return;
  }
  passwordInput.value = '';
  toast('Accès administrateur débloqué', 'success');
  await checkAdminGate();
}

async function adminLogout() {
  const { error } = await sb.auth.signOut();
  // Une session déjà expirée côté serveur ne doit pas bloquer la déconnexion.
  if (error) await sb.auth.signOut({ scope: 'local' });
  state.orders = [];
  await checkAdminGate();
}

const ADMIN_PANELS = {
  products: 'adminProductsPanel',
  orders: 'adminOrdersPanel',
  promos: 'adminPromosPanel',
  reviews: 'adminReviewsPanel',
  reels: 'adminReelsPanel',
  shop: 'adminShopPanel',
};

function setAdminTab(tab) {
  adminTab = tab;
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  Object.entries(ADMIN_PANELS).forEach(([key, id]) => {
    document.getElementById(id)?.classList.toggle('d-none', key !== tab);
  });
}

function renderAdmin() {
  renderAdminStats();
  renderAdminProducts();
  renderAdminOrders();
  renderAdminPromos();
  renderAdminReviews();
  renderAdminReels();
  renderAdminShop();
}

/* ---------- INFOS BOUTIQUE ---------- */
function renderAdminShop() {
  const field = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
  field('sfWhatsapp', state.settings.whatsapp);
  field('sfPhone', state.settings.phone);
  field('sfEmail', state.settings.email);
  field('sfAddress', state.settings.address);
  field('sfMaps', state.settings.mapsUrl);
  field('sfWaProfile', state.settings.waProfile);
  field('sfTiktok', state.settings.tiktok);
  field('sfInstagram', state.settings.instagram);
  field('sfFacebook', state.settings.facebook);
}

async function submitShopSettings(e) {
  e.preventDefault();
  const value = id => (document.getElementById(id)?.value || '').trim();
  const whatsapp = digitsOnly(value('sfWhatsapp'));
  const phone = value('sfPhone');
  const email = value('sfEmail');
  if (!whatsapp) { toast('Numéro WhatsApp requis (indicatif pays inclus)'); return; }
  if (!phone) { toast("Numéro de téléphone d'affichage requis"); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Adresse email invalide'); return; }

  const urlFields = [
    ['sfMaps', 'mapsUrl', 'Le lien Google Maps'],
    ['sfWaProfile', 'waProfile', 'Le lien du profil WhatsApp'],
    ['sfTiktok', 'tiktok', 'Le lien TikTok'],
    ['sfInstagram', 'instagram', 'Le lien Instagram'],
    ['sfFacebook', 'facebook', 'Le lien Facebook'],
  ];
  const urls = {};
  for (const [id, key, label] of urlFields) {
    const raw = value(id);
    if (!raw) { urls[key] = ''; continue; }
    if (!/^https?:\/\//i.test(raw)) { toast(`${label} doit commencer par http:// ou https://`); return; }
    urls[key] = raw;
  }

  const next = {
    ...state.settings,
    whatsapp,
    phone,
    email,
    address: value('sfAddress'),
    ...urls,
  };
  try {
    await writeRow('settings', settingsRow(next));
  } catch (error) {
    dbFail(error, 'Informations non enregistrées');
    return;
  }
  state.settings = next;
  renderAdminShop();
  applyShopInfo();
  toast('Informations de la boutique mises à jour', 'success');
}

function renderAdminStats() {
  const el = id => document.getElementById(id);
  if (el('statProducts')) el('statProducts').textContent = state.products.length;
  if (el('statPromos')) el('statPromos').textContent = state.promos.length;
  if (el('statActivePromos')) el('statActivePromos').textContent = activePromos().length;
  if (el('statOrders')) el('statOrders').textContent = state.orders.length;
  if (el('statCatalogValue')) el('statCatalogValue').textContent = fmt(state.products.reduce((s, p) => s + Number(p.price), 0));
}

/* ---------- COMMANDES ---------- */
function renderAdminOrders() {
  const tbody = document.getElementById('adminOrdersBody');
  if (!tbody) return;
  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-receipt"></i>Aucune commande pour le moment.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.orders.map(o => `
    <tr>
      <td>
        <span class="t-name">${escapeHtml(o.id)}</span>
        <br><small class="text-secondary">${new Date(o.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
      </td>
      <td>
        <span class="t-name">${escapeHtml(o.customer || 'Invité')}</span>
        ${o.whatsapp ? `<br><small class="text-secondary"><i class="bi bi-whatsapp me-1"></i>${escapeHtml(o.whatsapp)}</small>` : '<br><small class="text-secondary">Numéro non renseigné</small>'}
      </td>
      <td><small class="text-secondary">${o.items.map(i => `${escapeHtml(i.name)} (T.${escapeHtml(i.size)}) ×${i.qty}`).join('<br>')}</small></td>
      <td>
        <span class="fw-bold">${fmt(o.total)}</span>
        ${o.promoCode ? `<br><small class="red-text">Code ${escapeHtml(o.promoCode)}</small>` : ''}
      </td>
      <td class="text-nowrap">
        <button class="icon-action danger" title="Supprimer" onclick="deleteOrder('${o.id}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

async function deleteOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`Supprimer la commande ${o.id} ?`)) return;
  try {
    await deleteRow('orders', id);
  } catch (error) {
    dbFail(error, 'Commande non supprimée');
    return;
  }
  state.orders = state.orders.filter(x => x.id !== id);
  renderAdminOrders();
  renderAdminStats();
  toast(`Commande ${o.id} supprimée`);
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

async function submitProductForm(e) {
  e.preventDefault();
  const name = document.getElementById('pfName').value.trim();
  const category = document.getElementById('pfCategory').value;
  const price = Number(document.getElementById('pfPrice').value);
  const oldPriceRaw = document.getElementById('pfOldPrice').value;
  const image = document.getElementById('pfImage').value.trim();
  const sizes = document.getElementById('pfSizes').value.split(',').map(s => s.trim()).filter(Boolean);
  const desc = document.getElementById('pfDesc').value.trim();

  if (!name || !price || !image) { toast('Nom, prix et image sont obligatoires'); return; }

  const idx = editingProductId ? state.products.findIndex(p => p.id === editingProductId) : -1;
  const previous = idx >= 0 ? state.products[idx] : null;
  const row = productRow({
    ...(previous || {}),
    id: previous ? previous.id : uid(),
    name, category, price,
    oldPrice: oldPriceRaw ? Number(oldPriceRaw) : null,
    image, sizes: sizes.length ? sizes : ['Unique'], desc,
  });

  try {
    await writeRow('products', row);
  } catch (error) {
    dbFail(error, 'Produit non enregistré');
    return;
  }

  if (previous) {
    state.products[idx] = row;
    toast(`Produit "${name}" modifié`, 'success');
  } else {
    state.products.unshift(row);
    toast(`Produit "${name}" ajouté à la boutique`, 'success');
  }
  renderAdminProducts();
  renderAdminStats();
  bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
}

async function deleteProduct(id) {
  const p = state.products.find(pr => pr.id === id);
  if (!p) return;
  if (!confirm(`Supprimer définitivement "${p.name}" ?`)) return;
  try {
    await deleteRow('products', id);
  } catch (error) {
    dbFail(error, 'Produit non supprimé');
    return;
  }
  state.products = state.products.filter(pr => pr.id !== id);
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

async function submitPromoForm(e) {
  e.preventDefault();
  const code = document.getElementById('prfCode').value.trim().toUpperCase();
  const type = document.getElementById('prfType').value;
  const value = Number(document.getElementById('prfValue').value);
  const active = document.getElementById('prfActive').checked;

  if (!code || !value || value <= 0) { toast('Code et valeur obligatoires'); return; }
  const duplicate = state.promos.find(p => p.code.toUpperCase() === code && p.id !== editingPromoId);
  if (duplicate) { toast('Ce code existe déjà'); return; }

  const idx = editingPromoId ? state.promos.findIndex(p => p.id === editingPromoId) : -1;
  const row = promoRow({ ...(idx >= 0 ? state.promos[idx] : {}), id: idx >= 0 ? editingPromoId : uid(), code, type, value, active });

  try {
    await writeRow('promos', row);
  } catch (error) {
    // La base est seule juge : deux appareils peuvent créer le même code.
    if (error.code === '23505') toast('Ce code existe déjà');
    else dbFail(error, 'Code promo non enregistré');
    return;
  }

  if (idx >= 0) {
    state.promos[idx] = row;
    toast(`Code "${code}" modifié`, 'success');
  } else {
    state.promos.unshift(row);
    toast(`Code "${code}" créé — visible sur la boutique`, 'success');
  }
  renderAdminPromos();
  renderAdminStats();
  bootstrap.Modal.getInstance(document.getElementById('promoModal'))?.hide();
}

async function togglePromo(id) {
  const p = state.promos.find(pr => pr.id === id);
  if (!p) return;
  const next = { ...p, active: !p.active };
  try {
    await writeRow('promos', promoRow(next));
  } catch (error) {
    dbFail(error, 'Code promo non mis à jour');
    return;
  }
  Object.assign(p, next);
  renderAdminPromos();
  renderAdminStats();
  toast(`Code "${p.code}" ${p.active ? 'activé' : 'désactivé'}`);
}

async function deletePromo(id) {
  const p = state.promos.find(pr => pr.id === id);
  if (!p) return;
  if (!confirm(`Supprimer le code "${p.code}" ?`)) return;
  try {
    await deleteRow('promos', id);
  } catch (error) {
    dbFail(error, 'Code promo non supprimé');
    return;
  }
  state.promos = state.promos.filter(pr => pr.id !== id);
  renderAdminPromos();
  renderAdminStats();
  toast(`Code "${p.code}" supprimé`);
}

/* ---------- MODÉRATION DES AVIS ---------- */
function renderAdminReviews() {
  const badge = document.getElementById('tabBadgeReviews');
  const pending = state.reviews.filter(r => r.status !== 'approved').length;
  if (badge) {
    badge.textContent = pending;
    badge.classList.toggle('d-none', pending === 0);
  }

  const tbody = document.getElementById('adminReviewsBody');
  if (!tbody) return;
  if (!state.reviews.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="bi bi-star"></i>Aucun avis client. Les visiteurs peuvent noter une pièce depuis sa fiche.</div></td></tr>`;
    return;
  }
  const sorted = [...state.reviews].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'approved' ? 1 : -1;
    return new Date(b.date) - new Date(a.date);
  });
  tbody.innerHTML = sorted.map(r => {
    const product = state.products.find(p => p.id === r.productId);
    const published = r.status === 'approved';
    return `
    <tr>
      <td>
        <span class="t-name">${escapeHtml(r.author)}</span>
        ${starsHTML(r.rating)}
        ${r.verified ? '<br><small class="text-secondary"><i class="bi bi-patch-check-fill me-1"></i>Achat vérifié</small>' : ''}
      </td>
      <td><small>${escapeHtml(product ? product.name : 'Produit supprimé')}</small></td>
      <td><small class="text-secondary">${escapeHtml(r.comment || '—')}</small><br><small class="text-secondary">${new Date(r.date).toLocaleDateString('fr-FR')}</small></td>
      <td><span class="status-pill ${published ? 'on' : 'off'}">${published ? 'Publié' : 'En attente'}</span></td>
      <td class="text-nowrap">
        <button class="icon-action me-1" title="${published ? 'Retirer de la boutique' : 'Publier sur la boutique'}" onclick="toggleReview('${r.id}')"><i class="bi bi-${published ? 'eye-slash' : 'check2'}"></i></button>
        <button class="icon-action danger" title="Supprimer" onclick="deleteReview('${r.id}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function toggleReview(id) {
  const r = state.reviews.find(rv => rv.id === id);
  if (!r) return;
  const next = { ...r, status: r.status === 'approved' ? 'pending' : 'approved' };
  try {
    await writeRow('reviews', reviewRow(next));
  } catch (error) {
    dbFail(error, 'Avis non mis à jour');
    return;
  }
  Object.assign(r, next);
  renderAdminReviews();
  toast(`Avis de ${r.author} ${r.status === 'approved' ? 'publié' : 'retiré de la boutique'}`, r.status === 'approved' ? 'success' : undefined);
}

async function deleteReview(id) {
  const r = state.reviews.find(rv => rv.id === id);
  if (!r) return;
  if (!confirm(`Supprimer définitivement l'avis de "${r.author}" ?`)) return;
  try {
    await deleteRow('reviews', id);
  } catch (error) {
    dbFail(error, 'Avis non supprimé');
    return;
  }
  state.reviews = state.reviews.filter(rv => rv.id !== id);
  renderAdminReviews();
  toast('Avis supprimé');
}

/* Saisie manuelle d'un avis (ex. un client satisfait qui t'écrit sur WhatsApp) */
function openReviewForm() {
  const select = document.getElementById('arfProduct');
  if (!select) return;
  select.innerHTML = state.products
    .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');
  document.getElementById('arfAuthor').value = '';
  document.getElementById('arfComment').value = '';
  document.getElementById('arfVerified').checked = true;
  document.getElementById('arfPublish').checked = true;
  pickAdminStar(5);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('reviewModal')).show();
}

async function submitAdminReviewForm(e) {
  e.preventDefault();
  const productId = document.getElementById('arfProduct').value;
  const author = document.getElementById('arfAuthor').value.trim();
  const rating = Number(document.getElementById('arfRating').value || 0);
  const comment = document.getElementById('arfComment').value.trim();
  if (!productId) { toast('Aucun produit disponible'); return; }
  if (!author) { toast('Nom du client obligatoire'); return; }
  if (rating < 1 || rating > 5) { toast('Choisis une note en étoiles'); return; }

  const row = reviewRow({
    id: uid(), productId, rating, author, comment,
    date: new Date().toISOString(),
    status: document.getElementById('arfPublish').checked ? 'approved' : 'pending',
    verified: document.getElementById('arfVerified').checked,
  });
  try {
    await writeRow('reviews', row);
  } catch (error) {
    dbFail(error, 'Avis non enregistré');
    return;
  }
  state.reviews.unshift(row);
  renderAdminReviews();
  bootstrap.Modal.getInstance(document.getElementById('reviewModal'))?.hide();
  toast(`Avis de ${author} enregistré`, 'success');
}

/* ---------- CRUD VIDÉOS 9:16 ---------- */
function renderAdminReels() {
  const tbody = document.getElementById('adminReelsBody');
  if (!tbody) return;
  if (!state.reels.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="bi bi-camera-reels"></i>Aucune vidéo. La section reste masquée sur la boutique tant qu'elle est vide.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.reels.map(r => `
    <tr>
      <td>${r.poster
        ? `<img class="thumb" src="${escapeHtml(r.poster)}" alt="">`
        : r.video ? '<i class="bi bi-film text-secondary"></i>' : '<span class="text-secondary">—</span>'}</td>
      <td>
        <span class="t-name">${escapeHtml(r.title || 'Sans titre')}</span>
        <br><small class="text-secondary">${r.video ? 'Lien externe' : 'Visuel fixe'}</small>
      </td>
      <td><small class="text-secondary">${r.link ? escapeHtml(r.linkLabel || 'Voir la vidéo') : 'Aucune redirection'}</small></td>
      <td class="text-nowrap">
        <button class="icon-action me-1" title="Modifier" onclick="openReelForm('${r.id}')"><i class="bi bi-pencil"></i></button>
        <button class="icon-action danger" title="Supprimer" onclick="deleteReel('${r.id}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

function updateReelPosterPreview() {
  const input = document.getElementById('rfPoster');
  const wrap = document.getElementById('rfPosterPreviewWrap');
  const img = document.getElementById('rfPosterPreview');
  if (!input || !wrap || !img) return;
  const val = input.value.trim();
  if (!val) { wrap.classList.remove('show'); return; }
  img.src = val;
  wrap.classList.add('show');
}

function handleReelPosterFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    e.target.value = '';
    toast('Image trop lourde (2 Mo max). Passe par une URL.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('rfPoster').value = reader.result;
    updateReelPosterPreview();
    toast('Visuel chargé. Enregistre pour publier.', 'success');
  };
  reader.onerror = () => toast('Impossible de lire ce fichier image');
  reader.readAsDataURL(file);
}

function openReelForm(id = null) {
  editingReelId = id;
  const r = id ? state.reels.find(x => x.id === id) : null;
  document.getElementById('reelFormTitle').textContent = r ? 'Modifier la vidéo' : 'Ajouter une vidéo';
  document.getElementById('rfTitle').value = r ? (r.title || '') : '';
  document.getElementById('rfVideo').value = r ? (r.video || '') : '';
  document.getElementById('rfPoster').value = r ? (r.poster || '') : '';
  document.getElementById('rfPosterFile').value = '';
  document.getElementById('rfLink').value = r ? (r.link || '') : '';
  document.getElementById('rfLinkLabel').value = r ? (r.linkLabel || '') : '';
  updateReelPosterPreview();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('reelModal')).show();
}

/* Un src média est sûr s'il est en http(s), en data:image/ (import local),
   ou en chemin relatif — tout autre schéma (javascript:, data:text/html…) est refusé. */
function isSafeMediaSrc(raw, allowDataImage) {
  if (/^https?:\/\//i.test(raw)) return true;
  if (allowDataImage && /^data:image\//i.test(raw)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('//');
}

async function submitReelForm(e) {
  e.preventDefault();
  const value = id => (document.getElementById(id)?.value || '').trim();
  const title = value('rfTitle');
  const video = value('rfVideo');
  const poster = value('rfPoster');
  const link = value('rfLink');
  const linkLabel = value('rfLinkLabel');

  if (!video && !poster) { toast('Renseigne au moins une vidéo ou un visuel'); return; }
  if (video && !isSafeMediaSrc(video, false)) { toast("L'URL de la vidéo doit être un lien http(s) ou un fichier du site"); return; }
  if (poster && !isSafeMediaSrc(poster, true)) { toast('Le visuel doit être un lien http(s), un fichier du site ou une image importée'); return; }
  if (link && !/^https?:\/\//i.test(link)) { toast('Le lien de redirection doit commencer par http:// ou https://'); return; }

  const previous = editingReelId ? state.reels.find(x => x.id === editingReelId) : null;
  const row = reelRow({ ...(previous || {}), id: previous ? previous.id : uid(), title, video, poster, link, linkLabel });

  try {
    await writeRow('reels', row);
  } catch (error) {
    dbFail(error, 'Vidéo non enregistrée');
    return;
  }

  if (previous) {
    Object.assign(previous, row);
    toast('Vidéo modifiée', 'success');
  } else {
    state.reels.push(row);
    toast('Vidéo ajoutée — visible en bas de la boutique', 'success');
  }
  renderAdminReels();
  bootstrap.Modal.getInstance(document.getElementById('reelModal'))?.hide();
}

async function deleteReel(id) {
  const r = state.reels.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Supprimer "${r.title || 'cette vidéo'}" ?`)) return;
  try {
    await deleteRow('reels', id);
  } catch (error) {
    dbFail(error, 'Vidéo non supprimée');
    return;
  }
  state.reels = state.reels.filter(x => x.id !== id);
  renderAdminReels();
  toast('Vidéo supprimée');
}

/* ==================== BOUTON RETOUR ====================
   Chaque popup ouverte empile une entrée d'historique : le retour
   du téléphone ferme la popup au lieu de quitter le site. */
const overlayStack = [];
let historyClosing = 0;   // fermetures déjà déclenchées par le bouton retour

function initOverlayHistory() {
  document.addEventListener('shown.bs.modal', e => overlayOpened(e.target));
  document.addEventListener('shown.bs.offcanvas', e => overlayOpened(e.target));
  document.addEventListener('hidden.bs.modal', e => overlayClosed(e.target));
  document.addEventListener('hidden.bs.offcanvas', e => overlayClosed(e.target));
  window.addEventListener('popstate', onOverlayPopstate);
}

function overlayOpened(el) {
  overlayStack.push(el);
  history.pushState({ fsOverlay: overlayStack.length }, '');
}

function overlayClosed(el) {
  const i = overlayStack.indexOf(el);
  if (i >= 0) overlayStack.splice(i, 1);
  if (historyClosing > 0) { historyClosing--; return; }
  history.back();
}

function onOverlayPopstate(e) {
  if (!overlayStack.length) return;
  const target = e.state && typeof e.state.fsOverlay === 'number' ? e.state.fsOverlay : 0;
  if (target >= overlayStack.length) return;
  const count = overlayStack.length - target;
  historyClosing = count;
  overlayStack.slice(-count).reverse().forEach(el => {
    const inst = bootstrap.Modal.getInstance(el) || bootstrap.Offcanvas.getInstance(el);
    if (inst) inst.hide();
  });
}

/* ==================== ROUTAGE ==================== */
document.addEventListener('DOMContentLoaded', () => {
  initOverlayHistory();
  const page = document.body.dataset.page;
  if (page === 'shop') initShop();
  if (page === 'admin') initAdmin();
});
