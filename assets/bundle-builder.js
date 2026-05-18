/*
  <bundle-builder> — view component for the bundle builder section (v2).

  State, persistence, derived totals/tiers/discount and add-to-cart all live
  in the shared store (assets/bundle-store.js). This element is a thin view:
  it parses the section markup into a config object and hands it to the store
  (hydrateConfig), then renders three pieces of bundle-page-only UI on every
  'bundle:updated' — the product-card steppers, the discount progress bar,
  and the "Your Box" draft panel. The panel itself is the snippet
  (snippets/bundle-cart.liquid), rendered by the shared renderer
  (assets/bundle-cart-view.js).

  Clicks on add/remove/clear controls and the [data-add-to-cart] button are
  delegated to the store. On successful add the store dispatches
  `cart:item-added`, which the native <cart-drawer> picks up to refresh and
  open over the page.

  ----------------------------------------------------------------------------
  Expected markup (produced by sections/bundle-builder.liquid):

    <bundle-builder
      data-section-id  data-currency  data-slots-per-box
      data-target-qty (pouches)  data-max-qty (pouches)
      data-tiers='[{"min":8,"pct":0.1}, …]'   (JSON, min in POUCHES, pct fraction)
      data-i18n-progress-headline  data-i18n-progress-headline-max
      data-i18n-progress-detail    data-i18n-progress-detail-max
      data-i18n-pouch  data-i18n-pouches  data-i18n-box  data-i18n-boxes
      data-i18n-slots-per-box  data-i18n-error>

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
        [data-progress-boxes]
      [data-cart]                                 ({% render 'bundle-cart' %})
*/
import { bundleStore } from './bundle-store.js';
import { renderBundleCart } from './bundle-cart-view.js';

class BundleBuilder extends HTMLElement {
  connectedCallback() {
    this.slotsPerBox = parseInt(this.dataset.slotsPerBox, 10) || 4;
    // data-target-qty / data-max-qty arrive already converted to pouches.
    this.targetQty = parseInt(this.dataset.targetQty, 10) || this.slotsPerBox;
    this.maxQty = parseInt(this.dataset.maxQty, 10) || this.slotsPerBox * 4;

    // DOM refs
    this.cartPanel = this.querySelector('[data-cart]');
    this.addButton = this.querySelector('[data-add-to-cart]');
    this.errorContainer = this.querySelector('[data-error]');

    this._onClick = (e) => this.handleClick(e);
    this.addEventListener('click', this._onClick);

    this._onBundleUpdated = () => this.render();
    document.addEventListener('bundle:updated', this._onBundleUpdated);

    // Hand the store everything it needs to run anywhere — including pages
    // without this section, since the store persists the config. This emits
    // 'bundle:updated', which our listener above turns into the first render.
    bundleStore.hydrateConfig(this.parseConfig());
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
    document.removeEventListener('bundle:updated', this._onBundleUpdated);
  }

  // ---- Config -----------------------------------------------------------

  parseConfig() {
    let tiers = [];
    try {
      tiers = JSON.parse(this.dataset.tiers || '[]') || [];
    } catch {
      tiers = [];
    }

    const products = {};
    const blob = this.querySelector('.bundle-products');
    if (blob) {
      try {
        for (const p of JSON.parse(blob.textContent)) {
          if (p && p.id != null) products[String(p.id)] = p;
        }
      } catch (err) {
        console.error('[bundle-builder] failed to parse products blob:', err);
      }
    }

    return {
      products,
      tiers,
      currency: this.dataset.currency || 'USD',
      slotsPerBox: this.slotsPerBox,
      maxQty: this.maxQty,
      i18n: { error: this.dataset.i18nError || 'Could not add to cart' }
    };
  }

  // ---- Events -----------------------------------------------------------

  handleClick(e) {
    const trigger = e.target.closest('[data-action]');
    if (trigger && this.contains(trigger)) {
      const { action, variantId } = trigger.dataset;
      if (action === 'add') bundleStore.add(variantId);
      else if (action === 'remove') bundleStore.remove(variantId);
      else if (action === 'clear') bundleStore.clear(variantId);
      return;
    }
    const add = e.target.closest('[data-add-to-cart]');
    if (add && this.contains(add)) this.addToCart();
  }

  async addToCart() {
    if (bundleStore.totalQty === 0 || !this.addButton) return;
    this.clearError();
    this.addButton.classList.add('is-loading');
    this.addButton.disabled = true;

    try {
      await bundleStore.addToCart();
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.addButton.classList.remove('is-loading');
      this.addButton.disabled = false;
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
    if (this.cartPanel) renderBundleCart(this.cartPanel, bundleStore.snapshot);
  }

  renderCards() {
    const atCap = bundleStore.totalQty >= this.maxQty;
    const counts = bundleStore.counts;
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

    const totalQty = bundleStore.totalQty;
    const nextTier = bundleStore.nextTier;
    const tier = bundleStore.tier;
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
    const totalQty = bundleStore.totalQty;
    const boxCount = bundleStore.boxCount;
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

  setText(root, selector, text) {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  }
}

customElements.define('bundle-builder', BundleBuilder);
