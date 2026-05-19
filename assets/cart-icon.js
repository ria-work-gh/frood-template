/**
 * <cart-icon> — header cart link.
 *
 * The "cart" is the bundle draft, so the count comes from the shared bundle
 * store (assets/bundle-store.js), not the native Shopify cart. Clicking the
 * link opens the <cart-drawer> instead of navigating to /cart. Listens for
 * 'bundle:updated' to keep the count in sync.
 *
 * Uses a data-aria-template attribute (populated via Liquid translation) to
 * keep the aria-label localized when the count updates dynamically.
 *
 * Expected markup:
 *   <cart-icon data-aria-template="{{ 'accessibility.cart_count' | t: count: '__COUNT__' }}">
 *     <a href="{{ routes.cart_url }}" class="header-cart" aria-label="…">
 *       Cart (<span class="cart-count">0</span>)
 *     </a>
 *   </cart-icon>
 */
import { bundleStore } from './bundle-store.js';

class CartIcon extends HTMLElement {
  connectedCallback() {
    this.countElement = this.querySelector('.cart-count');
    this.clickTarget = this.querySelector('a') || this.querySelector('button');
    this.ariaTemplate = this.dataset.ariaTemplate;

    // The cart is always the bundle drawer — intercept clicks to open it.
    if (this.clickTarget) {
      this.clickTarget.addEventListener('click', (e) => {
        e.preventDefault();
        const drawer = document.querySelector('cart-drawer');
        if (drawer) drawer.open();
      });
    }

    this._onBundleUpdated = (e) => {
      const snapshot = e.detail?.snapshot;
      this.updateCount(snapshot ? snapshot.totalQty : bundleStore.totalQty);
    };
    document.addEventListener('bundle:updated', this._onBundleUpdated);

    this.updateCount(bundleStore.totalQty);
  }

  disconnectedCallback() {
    document.removeEventListener('bundle:updated', this._onBundleUpdated);
  }

  /**
   * Update the displayed count and the localized aria-label.
   * @param {number} count
   */
  updateCount(count) {
    if (this.countElement) {
      this.countElement.textContent = count;
    }

    if (this.clickTarget && this.ariaTemplate) {
      this.clickTarget.setAttribute(
        'aria-label',
        this.ariaTemplate.replace('__COUNT__', count)
      );
    }
  }
}

customElements.define('cart-icon', CartIcon);
