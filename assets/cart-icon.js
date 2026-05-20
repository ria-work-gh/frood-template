/**
 * <cart-icon> — header cart link.
 *
 * Shows the Shopify cart item count. Clicking opens the <cart-drawer>.
 * Listens for cart:item-added and cart:updated to update the count, reading
 * it from event.detail.cart.item_count when present; falls back to a /cart.js
 * fetch if the event lacks a cart payload.
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

class CartIcon extends HTMLElement {
  connectedCallback() {
    this.countElement = this.querySelector('.cart-count');
    this.clickTarget = this.querySelector('a') || this.querySelector('button');
    this.ariaTemplate = this.dataset.ariaTemplate;

    if (this.clickTarget) {
      this.clickTarget.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('cart-drawer')?.open();
      });
    }

    this._onCartChanged = (e) => this.updateFromEvent(e);
    document.addEventListener('cart:item-added', this._onCartChanged);
    document.addEventListener('cart:updated', this._onCartChanged);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:item-added', this._onCartChanged);
    document.removeEventListener('cart:updated', this._onCartChanged);
  }

  async updateFromEvent(e) {
    const count = e.detail?.cart?.item_count;
    if (typeof count === 'number') {
      this.updateCount(count);
      return;
    }
    try {
      const cart = await fetch('/cart.js').then((r) => r.json());
      this.updateCount(cart.item_count);
    } catch (err) {
      console.error('[cart-icon] failed to fetch /cart.js', err);
    }
  }

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
</content>
</invoke>