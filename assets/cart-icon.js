/**
 * Cart Icon Web Component
 *
 * Displays cart item count in the header. When cart type is 'drawer', intercepts
 * click to open the cart drawer instead of navigating to /cart. Listens for
 * 'cart:item-added' and 'cart:updated' events to keep the count in sync.
 *
 * Uses a data-aria-template attribute (populated via Liquid translation) to
 * keep the aria-label localized when the count updates dynamically.
 *
 * Expected markup:
 *   <cart-icon data-aria-template="{{ 'accessibility.cart_count' | t: count: '__COUNT__' }}">
 *     <a href="/cart" class="header-icon" aria-label="{{ 'accessibility.cart_count' | t: count: cart.item_count }}">
 *       <svg>...</svg>
 *       <span class="cart-count">3</span>
 *     </a>
 *   </cart-icon>
 */
class CartIcon extends HTMLElement {
  connectedCallback() {
    this.countElement = this.querySelector('.cart-count');
    this.clickTarget = this.querySelector('a') || this.querySelector('button');
    this.ariaTemplate = this.dataset.ariaTemplate;

    // If cart type is 'drawer', intercept clicks to open the drawer
    if (document.body.dataset.cartType === 'drawer' && this.clickTarget) {
      this.clickTarget.addEventListener('click', (e) => {
        e.preventDefault();
        const drawer = document.querySelector('cart-drawer');
        if (drawer) drawer.open();
      });
    }

    // Listen for cart events to keep count updated (named for cleanup)
    this._onItemAdded = () => this.fetchCartCount();
    this._onCartUpdated = (e) => {
      if (e.detail?.cart) {
        this.updateCount(e.detail.cart.item_count);
      }
    };

    document.addEventListener('cart:item-added', this._onItemAdded);
    document.addEventListener('cart:updated', this._onCartUpdated);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:item-added', this._onItemAdded);
    document.removeEventListener('cart:updated', this._onCartUpdated);
  }

  /**
   * Fetch the current cart state to get the accurate item count.
   * Used after 'cart:item-added' since that event may not include total count.
   */
  async fetchCartCount() {
    try {
      const response = await fetch('/cart.js', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (response.ok) {
        const cart = await response.json();
        this.updateCount(cart.item_count);
      }
    } catch {
      // Silently fail — count will update on next interaction
    }
  }

  /**
   * Update the displayed cart count and the aria-label for accessibility.
   * Uses the localized template from data-aria-template if available.
   * @param {number} count - The new cart item count.
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
