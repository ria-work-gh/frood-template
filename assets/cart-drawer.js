/**
 * <cart-drawer> — floating "island" overlay that mirrors the native Shopify cart.
 *
 * Body markup is server-rendered by sections/cart-drawer.liquid; this component
 * keeps it in sync via Shopify's Section Rendering API. Listens on `document`:
 *
 *   'cart:updated'      detail.sections['cart-drawer'] → swap body
 *   'cart:item-added'   detail.sections['cart-drawer'] → swap body, then open();
 *                       if no sections payload, fetch /cart?section_id=cart-drawer
 *
 * Quantity/remove inside the drawer go through the embedded <cart-items>
 * (assets/cart-items.js), which POSTs /cart/change.js with `sections:
 * ['cart-drawer']` and re-dispatches 'cart:updated' with the bundled HTML.
 *
 * Accessibility (focus trap, ARIA): .claude/conventions/accessibility.md
 *
 * Expected markup:
 *   <cart-drawer id="cart-drawer" class="cart-drawer" aria-hidden="true"
 *     role="dialog" aria-modal="true" aria-label="Cart">
 *     <div class="cart-drawer-overlay" data-overlay></div>
 *     <div class="cart-drawer-panel">
 *       <div class="cart-drawer-bar">
 *         <button class="cart-drawer-close" data-close>X</button>
 *       </div>
 *       <div class="cart-drawer-content" data-drawer-body>
 *         <cart-items>…native cart markup…</cart-items>
 *       </div>
 *     </div>
 *   </cart-drawer>
 */

class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.overlay = this.querySelector('[data-overlay]');
    this.closeBtn = this.querySelector('[data-close]');
    this.body = this.querySelector('[data-drawer-body]');
    this.previouslyFocused = null;

    this.handleKeydown = this.handleKeydown.bind(this);

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());

    this._onCartUpdated = (e) => this.refresh(e.detail?.sections?.['cart-drawer']);
    this._onItemAdded = (e) => this.handleItemAdded(e);

    document.addEventListener('cart:updated', this._onCartUpdated);
    document.addEventListener('cart:item-added', this._onItemAdded);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:updated', this._onCartUpdated);
    document.removeEventListener('cart:item-added', this._onItemAdded);
    document.removeEventListener('keydown', this.handleKeydown);
  }

  get isOpen() {
    return this.classList.contains('is-open');
  }

  // ---- Refresh ----------------------------------------------------------

  // Swap the drawer body with the [data-drawer-body] content from a fresh
  // server-rendered cart-drawer section. `html` is the raw section string
  // from Shopify's Section Rendering API.
  refresh(html) {
    if (!html || !this.body) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fresh = doc.querySelector('[data-drawer-body]');
    if (fresh) this.body.innerHTML = fresh.innerHTML;
    this.dispatchEvent(new CustomEvent('content:loaded', { bubbles: true }));
  }

  async handleItemAdded(e) {
    const html = e.detail?.sections?.['cart-drawer'];
    if (html) {
      this.refresh(html);
    } else {
      // Sender didn't bundle sections — fetch the section ourselves.
      try {
        const response = await fetch('/?section_id=cart-drawer');
        if (response.ok) this.refresh(await response.text());
      } catch {
        /* network blip — skip refresh, open with stale body */
      }
    }
    this.open();
  }

  // ---- Open / close -----------------------------------------------------

  /**
   * Open the cart drawer. Locks body scroll, traps focus, listens for Escape.
   */
  open() {
    this.previouslyFocused = document.activeElement;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');

    document.addEventListener('keydown', this.handleKeydown);
    this.trapFocus();
  }

  /**
   * Close the cart drawer. Releases the focus trap and returns focus to the
   * element that opened it.
   */
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

  /**
   * Handle keydown for Escape to close and Tab to trap focus.
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusableElements = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }

  /**
   * Move focus to the first focusable element inside the drawer
   * (typically the close button).
   */
  trapFocus() {
    const focusableElements = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }
}

customElements.define('cart-drawer', CartDrawer);
