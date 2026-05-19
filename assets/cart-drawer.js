/**
 * <cart-drawer> — floating "island" overlay that mirrors the bundle draft.
 *
 * A second view over the shared bundle store (assets/bundle-store.js): it
 * renders the same "Your Box" panel the bundle builder shows
 * (snippets/bundle-cart.liquid via assets/bundle-cart-view.js), including
 * working remove (×) buttons. Opening it never fetches — it reads
 * bundleStore.snapshot. Mutations (remove a line) go straight to the store,
 * which persists and re-emits 'bundle:updated'; both this overlay and the
 * bundle builder (if present) re-render off that event.
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
 *       <div class="cart-drawer-content">{% render 'bundle-cart' %}</div>
 *     </div>
 *   </cart-drawer>
 */
import { bundleStore } from './bundle-store.js';
import { renderBundleCart } from './bundle-cart-view.js';

class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.overlay = this.querySelector('[data-overlay]');
    this.closeBtn = this.querySelector('[data-close]');
    this.panel = this.querySelector('[data-cart]');
    this.checkoutButton = this.querySelector('[data-checkout]');
    this.errorContainer = this.querySelector('[data-error]');
    this.previouslyFocused = null;

    this.handleKeydown = this.handleKeydown.bind(this);

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());

    this._onClick = (e) => this.handleClick(e);
    this.addEventListener('click', this._onClick);

    this._onBundleUpdated = () => this.render();
    document.addEventListener('bundle:updated', this._onBundleUpdated);

    this.render();
  }

  disconnectedCallback() {
    document.removeEventListener('bundle:updated', this._onBundleUpdated);
    this.removeEventListener('click', this._onClick);
    document.removeEventListener('keydown', this.handleKeydown);
  }

  get isOpen() {
    return this.classList.contains('is-open');
  }

  // ---- Rendering --------------------------------------------------------

  render() {
    if (this.panel) renderBundleCart(this.panel, bundleStore.snapshot);
  }

  // ---- Events -----------------------------------------------------------

  handleClick(e) {
    const trigger = e.target.closest('[data-action]');
    if (trigger && this.contains(trigger)) {
      const { action, variantId } = trigger.dataset;
      if (action === 'clear') bundleStore.clear(variantId);
      else if (action === 'remove') bundleStore.remove(variantId);
      else if (action === 'add') bundleStore.add(variantId);
      return;
    }
    const checkout = e.target.closest('[data-checkout]');
    if (checkout && this.contains(checkout)) this.checkout();
  }

  async checkout() {
    if (bundleStore.totalQty === 0 || !this.checkoutButton) return;
    this.clearError();
    this.checkoutButton.classList.add('is-loading');
    this.checkoutButton.disabled = true;

    try {
      await bundleStore.checkout();
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

  // ---- Open / close -----------------------------------------------------

  /**
   * Open the cart drawer. Re-renders from the current snapshot (in case the
   * bundle changed while the drawer was closed), locks body scroll, traps
   * focus, and listens for Escape.
   */
  open() {
    this.render();

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
