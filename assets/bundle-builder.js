/*
  <bundle-builder> — root component for the bundle builder section (v2).

  Port of the Svelte demo's bundle-v2.svelte.ts store + the v2 ProductCard /
  BundleProgress / BundleCart components.

  ----------------------------------------------------------------------------
  V2 model — pouch-first.

  The atomic unit is a single POUCH, not a 4-pack box. State is an ORDERED list
  of variant ids — one entry per pouch. Index i fills box `floor(i / 4)`, slot
  `i % 4`; filling past a box's last slot opens the next box. Order matters:
  removing a pouch shifts later pouches up a slot.

  Discount tiers are box-based. The section schema gives each tier a minimum in
  BOXES (1–4); this component converts that to a pouch threshold by multiplying
  by SLOTS_PER_BOX. Discount is display-only — the tier % shown is a projection.
  The real discount must be a Shopify automatic discount configured in admin and
  kept in sync with the section's tier blocks.

  ----------------------------------------------------------------------------
  Event contract — <bundle-builder> dispatches on `document`:

    'bundle:updated'  detail: { pouches: [variantId, …] }

  `pouches` is the ordered pouch list (one entry per pouch). Fired on every
  state change and on connect. <bundle-stage> consumes it and derives its own
  box/slot grid from the order.

  <bundle-builder> also LISTENS for 'bundle:request-state' (no detail) and
  replies by re-dispatching 'bundle:updated'. This is the handshake for
  late-upgrading consumers: <bundle-stage>'s module graph (three.js) loads
  slower than this element, so it can miss the connect-time emit — it requests
  state explicitly once its own listener is registered.

  ----------------------------------------------------------------------------
  Expected markup (produced by sections/bundle-builder.liquid). The component
  hydrates this in place — every hook below must exist or that piece silently
  no-ops:

    <bundle-builder
      data-section-id  data-currency  data-target-qty (pouches)  data-max-qty (pouches)
      data-slots-per-box
      data-tiers='[{"min":8,"pct":0.1}, …]'   (JSON, min in POUCHES, pct as fraction)
      data-i18n-progress-headline  data-i18n-progress-headline-max
      data-i18n-progress-detail    data-i18n-progress-detail-max
      data-i18n-pouch  data-i18n-pouches  data-i18n-box  data-i18n-boxes
      data-i18n-slots-per-box  data-i18n-remove  data-i18n-error>

      <script type="application/json" class="bundle-products">
        [{ id, handle, title, size, price (minor units), textureUrl }, …]
      </script>

      [data-product-list]
        [data-product-card][data-variant-id]      (one per product)
          [data-qty]                              (qty readout)
          [data-action="add"|"remove"][data-variant-id]
      [data-progress]
        [data-progress-headline] [data-progress-detail] [data-progress-count]
        [data-progress-bar] > [data-progress-fill]
        [data-progress-boxes]                     (box/slot summary line)
      [data-cart-empty]
      [data-cart-lines]                           (JS rebuilds <li>s here)
      [data-cart-totals] > [data-subtotal] [data-price]
      [data-checkout]                             (button)
      [data-error][role="alert"]

  Cart-line remove buttons are built by JS with data-action="clear" — clearing
  removes EVERY pouch of that flavour. i18n placeholders are literal
  {count}/{pouch}/{pct}/{name} tokens that JS substitutes — NOT Shopify's
  {{ }} interpolation.
*/
class BundleBuilder extends HTMLElement {
  connectedCallback() {
    this.sectionId = this.dataset.sectionId || 'default';
    this.storageKey = `frood.bundle.v2.${this.sectionId}`;
    this.bundleId = `${this.sectionId}-${Date.now().toString(36)}`;

    this.slotsPerBox = parseInt(this.dataset.slotsPerBox, 10) || 4;
    // data-target-qty / data-max-qty arrive already converted to pouches.
    this.targetQty = parseInt(this.dataset.targetQty, 10) || this.slotsPerBox;
    this.maxQty = parseInt(this.dataset.maxQty, 10) || this.slotsPerBox * 4;

    // Tiers ordered high → low so getTier()'s find() returns the best match.
    // `min` is a pouch threshold (the section converts box minimums for us).
    try {
      this.tiers = (JSON.parse(this.dataset.tiers || '[]') || [])
        .filter((t) => t && t.min > 0 && t.pct > 0)
        .sort((a, b) => b.min - a.min);
    } catch {
      this.tiers = [];
    }
    // Same tiers low → high, for the "next tier still to unlock" lookup.
    this.tiersAsc = [...this.tiers].reverse();

    // Currency formatter for computed amounts (prices arrive in minor units).
    this.currency = this.dataset.currency || 'USD';
    try {
      this.money = new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: this.currency
      });
    } catch {
      this.money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }

    // Products: { id, handle, title, size, price (minor units), textureUrl }
    this.products = new Map();
    const blob = this.querySelector('.bundle-products');
    if (blob) {
      try {
        for (const p of JSON.parse(blob.textContent)) {
          if (p && p.id != null) this.products.set(String(p.id), p);
        }
      } catch (err) {
        console.error('[bundle-builder] failed to parse products blob:', err);
      }
    }

    // Ordered list of variant ids — one entry per pouch.
    this.pouches = this.loadInitial();

    // DOM refs
    this.productList = this.querySelector('[data-product-list]');
    this.checkoutButton = this.querySelector('[data-checkout]');
    this.errorContainer = this.querySelector('[data-error]');

    this._onClick = (e) => this.handleClick(e);
    this.addEventListener('click', this._onClick);

    // <bundle-stage> upgrades later than this element (its three.js module graph
    // loads slower), so it can miss a one-shot connect-time emit. Cover both
    // cases: emit now for any listener already present, and answer
    // `bundle:request-state` for consumers that connect later and pull state.
    this._onRequestState = () => this.emit();
    document.addEventListener('bundle:request-state', this._onRequestState);

    this.render();
    this.emit();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
    document.removeEventListener('bundle:request-state', this._onRequestState);
  }

  // ---- State ------------------------------------------------------------

  loadInitial() {
    let raw;
    try {
      raw = window.localStorage.getItem(this.storageKey);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id) => typeof id === 'string' && this.products.has(id));
    } catch {
      return [];
    }
  }

  save() {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.pouches));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  // Per-flavour counts, for the cart lines + steppers.
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

  // At least one box is always shown, even when empty.
  get boxCount() {
    return Math.max(1, Math.ceil(this.pouches.length / this.slotsPerBox));
  }

  get subtotal() {
    return this.pouches.reduce((sum, id) => {
      const product = this.products.get(id);
      return product ? sum + product.price : sum;
    }, 0);
  }

  get tier() {
    return this.tiers.find((t) => this.totalQty >= t.min) || null;
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

  add(id) {
    if (!this.products.has(id)) return;
    if (this.pouches.length >= this.maxQty) return;
    this.pouches.push(id);
    this.commit();
  }

  // Removes the LAST pouch of this flavour — drives the per-flavour stepper.
  remove(id) {
    for (let i = this.pouches.length - 1; i >= 0; i--) {
      if (this.pouches[i] === id) {
        this.pouches.splice(i, 1);
        break;
      }
    }
    this.commit();
  }

  clear(id) {
    this.pouches = this.pouches.filter((p) => p !== id);
    this.commit();
  }

  commit() {
    this.save();
    this.render();
    this.emit();
  }

  emit() {
    document.dispatchEvent(
      new CustomEvent('bundle:updated', { detail: { pouches: [...this.pouches] } })
    );
  }

  // ---- Events -----------------------------------------------------------

  handleClick(e) {
    const trigger = e.target.closest('[data-action]');
    if (trigger && this.contains(trigger)) {
      const { action, variantId } = trigger.dataset;
      if (action === 'add') this.add(variantId);
      else if (action === 'remove') this.remove(variantId);
      else if (action === 'clear') this.clear(variantId);
      return;
    }
    if (e.target.closest('[data-checkout]')) {
      this.checkout();
    }
  }

  async checkout() {
    if (this.totalQty === 0 || !this.checkoutButton) return;
    this.clearError();
    this.checkoutButton.classList.add('is-loading');
    this.checkoutButton.disabled = true;

    try {
      // Pouches are sold individually — collapse the ordered list to per-variant
      // quantities for the cart payload.
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
        throw new Error(errorData.description || this.dataset.i18nError || 'Could not add to cart');
      }

      // Items now live in the Shopify cart — drop the local draft so returning
      // to this page doesn't re-add them.
      this.pouches = [];
      this.save();

      window.location.href = '/checkout';
    } catch (error) {
      this.showError(error.message);
      this.checkoutButton.classList.remove('is-loading');
      this.checkoutButton.disabled = false;
    }
  }

  showError(message) {
    if (!this.errorContainer) return;
    this.errorContainer.textContent = message;
    this.errorContainer.hidden = false;
  }

  clearError() {
    if (!this.errorContainer) return;
    this.errorContainer.textContent = '';
    this.errorContainer.hidden = true;
  }

  // ---- Rendering --------------------------------------------------------

  render() {
    this.renderCards();
    this.renderProgress();
    this.renderCart();
  }

  renderCards() {
    const atCap = this.totalQty >= this.maxQty;
    const counts = this.counts;
    this.querySelectorAll('[data-product-card]').forEach((card) => {
      const id = card.dataset.variantId;
      const qty = counts[id] || 0;
      const qtyEl = card.querySelector('[data-qty]');
      if (qtyEl) qtyEl.textContent = qty;
      card.classList.toggle('is-active', qty > 0);
      const addBtn = card.querySelector('[data-action="add"]');
      const removeBtn = card.querySelector('[data-action="remove"]');
      if (addBtn) addBtn.disabled = atCap;
      if (removeBtn) removeBtn.disabled = qty === 0;
    });
  }

  renderProgress() {
    const progress = this.querySelector('[data-progress]');
    if (!progress) return;

    const totalQty = this.totalQty;
    const nextTier = this.nextTier;
    const tier = this.tier;
    const target = nextTier ? nextTier.min : this.targetQty;
    const pct = target > 0 ? Math.min(100, (totalQty / target) * 100) : 0;

    let headline;
    let detail;
    if (!nextTier) {
      headline = this.dataset.i18nProgressHeadlineMax || 'Max discount unlocked!';
      detail = (this.dataset.i18nProgressDetailMax || "You're saving {pct}%").replace(
        '{pct}',
        Math.round((tier ? tier.pct : 0) * 100)
      );
    } else {
      headline = this.dataset.i18nProgressHeadline || 'You are almost there:';
      const togo = nextTier.min - totalQty;
      const pouch =
        togo === 1
          ? this.dataset.i18nPouch || 'pouch'
          : this.dataset.i18nPouches || 'pouches';
      detail = (this.dataset.i18nProgressDetail || 'Add {count} more {pouch} and save {pct}%')
        .replace('{count}', togo)
        .replace('{pouch}', pouch)
        .replace('{pct}', Math.round(nextTier.pct * 100));
    }

    this.setText(progress, '[data-progress-headline]', headline);
    this.setText(progress, '[data-progress-detail]', detail);
    this.setText(progress, '[data-progress-count]', `${totalQty}/${target}`);

    const fill = progress.querySelector('[data-progress-fill]');
    if (fill) fill.style.width = `${pct}%`;

    const bar = progress.querySelector('[data-progress-bar]');
    if (bar) {
      bar.setAttribute('aria-valuenow', totalQty);
      bar.setAttribute('aria-valuemax', target);
    }

    this.setText(progress, '[data-progress-boxes]', this.boxLabel());
  }

  // "3 pouches · 1 box · 4 slots per box"
  boxLabel() {
    const totalQty = this.totalQty;
    const boxCount = this.boxCount;
    const pouchWord =
      totalQty === 1
        ? this.dataset.i18nPouch || 'pouch'
        : this.dataset.i18nPouches || 'pouches';
    const boxWord =
      boxCount === 1 ? this.dataset.i18nBox || 'box' : this.dataset.i18nBoxes || 'boxes';
    const slots = (this.dataset.i18nSlotsPerBox || '{count} slots per box').replace(
      '{count}',
      this.slotsPerBox
    );
    return `${totalQty} ${pouchWord} · ${boxCount} ${boxWord} · ${slots}`;
  }

  renderCart() {
    const empty = this.querySelector('[data-cart-empty]');
    const linesEl = this.querySelector('[data-cart-lines]');
    const totalsEl = this.querySelector('[data-cart-totals]');
    const hasItems = this.totalQty > 0;

    if (empty) empty.hidden = hasItems;
    if (linesEl) linesEl.hidden = !hasItems;
    if (totalsEl) totalsEl.hidden = !hasItems;
    if (this.checkoutButton) this.checkoutButton.hidden = !hasItems;

    if (linesEl) {
      linesEl.textContent = '';
      // Flavour-grouped lines, ordered by first appearance in the pouch list.
      const seen = new Set();
      for (const id of this.pouches) {
        if (seen.has(id)) continue;
        seen.add(id);
        const product = this.products.get(id);
        if (!product) continue;
        linesEl.appendChild(this.buildLine(id, this.qty(id), product));
      }
    }

    if (totalsEl && hasItems) {
      const subtotal = this.subtotal;
      const total = this.total;
      const discount = this.discount;
      const tier = this.tier;
      this.setText(totalsEl, '[data-subtotal]', this.money.format(subtotal / 100));

      const priceWrap = totalsEl.querySelector('[data-price]');
      if (priceWrap) {
        priceWrap.textContent = '';
        if (discount > 0) {
          priceWrap.appendChild(
            this.span('bundle-cart-strike', this.money.format(subtotal / 100))
          );
          priceWrap.appendChild(this.span('', this.money.format(total / 100)));
          priceWrap.appendChild(
            this.span('bundle-cart-saved', `−${Math.round((tier ? tier.pct : 0) * 100)}%`)
          );
        } else {
          priceWrap.appendChild(this.span('', this.money.format(total / 100)));
        }
      }
    }
  }

  buildLine(id, qty, product) {
    const li = document.createElement('li');
    li.className = 'bundle-cart-line';

    li.appendChild(this.span('bundle-cart-qty', qty));

    const meta = document.createElement('div');
    meta.className = 'bundle-cart-meta';
    meta.appendChild(this.el('p', 'bundle-cart-name text-ui', product.title));
    if (product.size) meta.appendChild(this.el('p', 'bundle-cart-size', product.size));
    li.appendChild(meta);

    li.appendChild(this.span('bundle-cart-price', this.money.format((product.price * qty) / 100)));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'bundle-cart-remove';
    removeBtn.dataset.action = 'clear';
    removeBtn.dataset.variantId = id;
    removeBtn.setAttribute(
      'aria-label',
      (this.dataset.i18nRemove || 'Remove {name}').replace('{name}', product.title)
    );
    removeBtn.textContent = '×';
    li.appendChild(removeBtn);

    return li;
  }

  // ---- Tiny DOM helpers -------------------------------------------------

  setText(root, selector, text) {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  }

  span(className, text) {
    return this.el('span', className, text);
  }

  el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
}

customElements.define('bundle-builder', BundleBuilder);
