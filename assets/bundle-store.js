/*
  bundle-store.js — shared singleton store for the bundle builder.

  The single source of truth for the bundle draft. <bundle-builder> and
  <cart-drawer> are both thin views over this store; <cart-icon> reads it for
  its count. Because the store self-hydrates from localStorage, the drawer can
  render AND mutate the bundle on any page — even ones without the
  <bundle-builder> section.

  ----------------------------------------------------------------------------
  State

    pouches : ordered array of variant ids — one entry per pouch. Order is
              significant: pouch i fills box floor(i / slotsPerBox), slot
              i % slotsPerBox. <bundle-stage> derives its grid from this order.
    config  : the catalogue + rules needed to compute everything. Written by
              <bundle-builder> from the section markup (hydrateConfig) and
              persisted, so other pages can rehydrate it.

  ----------------------------------------------------------------------------
  localStorage — single key `frood.bundle.v2`

    {
      pouches: ["variantId", ...],
      config: {
        products: { [variantId]: { handle, title, size, price, textureUrl } },
        tiers:    [{ min, pct }, ...],   // min in POUCHES, pct as a fraction
        currency, slotsPerBox, maxQty,
        i18n:     { error }
      }
    }

  config goes stale if the merchant edits products/prices until the shopper
  next loads the bundle page (which calls hydrateConfig with fresh data).

  ----------------------------------------------------------------------------
  Event contract — dispatched on `document`

    'bundle:updated'  detail: { pouches: [variantId, ...], snapshot: {...} }

  Fired on every mutation and on hydrateConfig. `detail.pouches` keeps
  <bundle-stage> working unchanged; `detail.snapshot` is the render-ready
  payload consumed by assets/bundle-cart-view.js:

    snapshot = {
      lines:    [{ id, title, size, price, qty }],  // price = per-unit, minor units
      counts:   { [id]: qty },                      // drives the checkout POST
      subtotal, discount, total,                    // minor units
      totalQty,                                     // pouch count
      tierPct,                                      // active tier fraction, 0 if none
      currency
    }

  The store also answers 'bundle:request-state' (no detail) by re-emitting
  'bundle:updated' — the handshake for <bundle-stage>, whose three.js module
  graph upgrades later than this module and can miss the connect-time emit.
*/

const STORAGE_KEY = 'frood.bundle.v2';

class BundleStore {
  constructor() {
    this.pouches = [];
    this.config = null;
    this.tiersDesc = [];
    this.tiersAsc = [];
    // Grouping token for the cart line-item `_bundle` property — one per page load.
    this.bundleId = `bundle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    this.loadFromStorage();

    document.addEventListener('bundle:request-state', () => this.emit());
  }

  // ---- Persistence ------------------------------------------------------

  loadFromStorage() {
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.pouches)) {
        this.pouches = data.pouches.filter((id) => typeof id === 'string');
      }
      if (data && data.config) this.setConfig(data.config);
    } catch {
      /* corrupt payload — start empty */
    }
  }

  save() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pouches: this.pouches, config: this.config })
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  // ---- Config -----------------------------------------------------------

  // Internal: applies a config object and derives tier lookup tables. Used by
  // both loadFromStorage (rehydrate) and hydrateConfig (fresh from markup).
  setConfig(config) {
    this.config = config;
    const tiers = Array.isArray(config.tiers)
      ? config.tiers.filter((t) => t && t.min > 0 && t.pct > 0)
      : [];
    // Desc for getTier()'s "best match"; asc for the "next tier to unlock" lookup.
    this.tiersDesc = [...tiers].sort((a, b) => b.min - a.min);
    this.tiersAsc = [...tiers].sort((a, b) => a.min - b.min);
    // Drop any persisted pouches whose product no longer exists in the catalogue.
    this.pouches = this.pouches.filter((id) => this.config.products[id]);
  }

  // Called by <bundle-builder> with data parsed from the section markup.
  // Persists the config so non-bundle pages can rehydrate it, then re-emits.
  hydrateConfig(config) {
    this.setConfig(config);
    this.save();
    this.emit();
  }

  get ready() {
    return this.config != null;
  }

  // ---- Derived ----------------------------------------------------------

  get products() {
    return this.config ? this.config.products : {};
  }

  get maxQty() {
    return this.config ? this.config.maxQty : Infinity;
  }

  get slotsPerBox() {
    return this.config ? this.config.slotsPerBox : 4;
  }

  get currency() {
    return this.config ? this.config.currency : 'USD';
  }

  get counts() {
    const out = {};
    for (const id of this.pouches) out[id] = (out[id] || 0) + 1;
    return out;
  }

  qty(id) {
    let n = 0;
    for (const p of this.pouches) if (p === id) n++;
    return n;
  }

  get totalQty() {
    return this.pouches.length;
  }

  get boxCount() {
    return Math.max(1, Math.ceil(this.pouches.length / this.slotsPerBox));
  }

  get subtotal() {
    return this.pouches.reduce((sum, id) => {
      const product = this.products[id];
      return product ? sum + product.price : sum;
    }, 0);
  }

  get tier() {
    return this.tiersDesc.find((t) => this.totalQty >= t.min) || null;
  }

  get nextTier() {
    return this.tiersAsc.find((t) => this.totalQty < t.min) || null;
  }

  get discount() {
    return this.tier ? Math.round(this.subtotal * this.tier.pct) : 0;
  }

  get total() {
    return this.subtotal - this.discount;
  }

  // Render-ready payload — see the event contract in the header comment.
  get snapshot() {
    const lines = [];
    const seen = new Set();
    // Flavour-grouped lines, ordered by first appearance in the pouch list.
    for (const id of this.pouches) {
      if (seen.has(id)) continue;
      seen.add(id);
      const product = this.products[id];
      if (!product) continue;
      lines.push({
        id,
        title: product.title,
        size: product.size || '',
        price: product.price,
        qty: this.qty(id)
      });
    }
    const tier = this.tier;
    return {
      lines,
      counts: this.counts,
      subtotal: this.subtotal,
      discount: this.discount,
      total: this.total,
      totalQty: this.totalQty,
      tierPct: tier ? tier.pct : 0,
      currency: this.currency
    };
  }

  // ---- Mutations --------------------------------------------------------

  add(id) {
    id = String(id);
    if (!this.products[id]) return;
    if (this.pouches.length >= this.maxQty) return;
    this.pouches.push(id);
    this.commit();
  }

  // Removes the LAST pouch of this flavour — drives the per-flavour stepper.
  remove(id) {
    id = String(id);
    for (let i = this.pouches.length - 1; i >= 0; i--) {
      if (this.pouches[i] === id) {
        this.pouches.splice(i, 1);
        break;
      }
    }
    this.commit();
  }

  // Removes EVERY pouch of this flavour — drives the cart-line × button.
  clear(id) {
    id = String(id);
    this.pouches = this.pouches.filter((p) => p !== id);
    this.commit();
  }

  commit() {
    this.save();
    this.emit();
  }

  emit() {
    document.dispatchEvent(
      new CustomEvent('bundle:updated', {
        detail: { pouches: [...this.pouches], snapshot: this.snapshot }
      })
    );
  }

  // ---- Checkout ---------------------------------------------------------

  // Collapses the ordered pouch list to per-variant quantities, POSTs them to
  // /cart/add.js in one request (shared `_bundle` line-item property), then
  // redirects to /checkout. Throws on failure so the calling view can show an
  // inline error. Resolves (no return) on the redirect path.
  async checkout() {
    if (this.totalQty === 0) return;

    const items = Object.entries(this.counts).map(([id, quantity]) => ({
      id: parseInt(id, 10),
      quantity,
      properties: { _bundle: this.bundleId }
    }));

    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ items })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const fallback = this.config && this.config.i18n && this.config.i18n.error;
      throw new Error(errorData.description || fallback || 'Could not add to cart');
    }

    // Items now live in the Shopify cart — drop the local draft so returning
    // to the site doesn't re-add them.
    this.pouches = [];
    this.save();

    window.location.href = '/checkout';
  }
}

export const bundleStore = new BundleStore();
