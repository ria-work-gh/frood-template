/**
 * <cart-drawer> — floating "island" overlay over the Shopify-native cart.
 *
 * Listens for:
 *   - cart:item-added (from product-form.js, product-card-quick-add.js)
 *     → refreshes content from bundled section HTML, then opens.
 *   - cart:updated (from cart-items.js on quantity change / remove)
 *     → refreshes content silently (no open).
 *
 * If the event detail carries sections['cart-drawer'], the drawer swaps from
 * that. Otherwise it falls back to a Section Rendering API fetch.
 *
 * cart-items.js handles in-drawer quantity changes / removals; it detects it's
 * inside <cart-drawer> and skips its own re-render, letting this component
 * own the swap.
 */

class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.overlay = this.querySelector('[data-overlay]');
    this.closeBtn = this.querySelector('[data-close]');
    this.content = this.querySelector('[data-cart-content]');
    this.previouslyFocused = null;

    this.handleKeydown = this.handleKeydown.bind(this);

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());

    this._onItemAdded = (e) => this.handleItemAdded(e);
    document.addEventListener('cart:item-added', this._onItemAdded);

    this._onCartUpdated = (e) => this.handleCartUpdated(e);
    document.addEventListener('cart:updated', this._onCartUpdated);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:item-added', this._onItemAdded);
    document.removeEventListener('cart:updated', this._onCartUpdated);
    document.removeEventListener('keydown', this.handleKeydown);
  }

  get isOpen() {
    return this.classList.contains('is-open');
  }

  // ---- Cart events ------------------------------------------------------

  async handleItemAdded(e) {
    await this.refresh(e.detail?.sections);
    this.open();
  }

  async handleCartUpdated(e) {
    await this.refresh(e.detail?.sections);
  }

  /**
   * Replace this drawer's <cart-items> contents from the bundled section
   * HTML, or fall back to a Section Rendering API fetch if none was provided.
   * @param {Object} [sections] - { 'cart-drawer': '<html>…</html>' }
   */
  async refresh(sections) {
    const currentCartItems = this.querySelector('cart-items');
    if (!currentCartItems) return;

    currentCartItems.classList.add('is-loading');

    try {
      let html = sections?.['cart-drawer'];
      if (!html) {
        const response = await fetch(`${window.location.pathname}?section_id=cart-drawer`);
        if (!response.ok) return;
        html = await response.text();
      }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newCartItems = doc.querySelector('cart-items');
      if (newCartItems) {
        currentCartItems.innerHTML = newCartItems.innerHTML;
      }
    } finally {
      currentCartItems.classList.remove('is-loading');
    }
  }

  // ---- Open / close -----------------------------------------------------

  open() {
    this.previouslyFocused = document.activeElement;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');

    document.addEventListener('keydown', this.handleKeydown);
    this.trapFocus();
  }

  close() {
    this.classList.remove('is-open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');

    document.removeEventListener('keydown', this.handleKeydown);

    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  trapFocus() {
    const focusable = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }
}

customElements.define('cart-drawer', CartDrawer);
</content>
</invoke>