/**
 * Cart Items Web Component
 *
 * Manages cart line item interactions: quantity changes and item removal.
 * Uses event delegation for change/click events on quantity inputs and
 * remove buttons. After updating via /cart/change.js, dispatches
 * 'cart:updated' with both cart data and pre-rendered section HTML
 * (Shopify bundled section rendering). Self-renders only on the cart
 * page; inside the cart drawer, the drawer handles the section swap.
 *
 * Expected markup:
 *   <cart-items data-section-id="main-cart">   (cart page)
 *   <cart-items>                                (inside cart-drawer)
 *     <div class="cart-items">
 *       <div class="cart-item" data-key="variant_key:hash">
 *         <quantity-selector>
 *           <input type="number" data-key="variant_key:hash" ...>
 *         </quantity-selector>
 *         <button data-remove="variant_key:hash" aria-label="Remove item">
 *           <svg>...</svg>
 *         </button>
 *       </div>
 *     </div>
 *   </cart-items>
 */
class CartItems extends HTMLElement {
  connectedCallback() {
    this.debounceTimer = null;
    this.sectionId = this.dataset.sectionId || 'cart-drawer';
    this.insideDrawer = !!this.closest('cart-drawer');

    // Delegate change events from quantity inputs (inside quantity-selector)
    this.addEventListener('change', (e) => {
      const input = e.target.closest('input[type="number"]');
      if (input && input.dataset.key) {
        this.debouncedUpdate(input.dataset.key, parseInt(input.value));
      }
    });

    // Delegate click events for remove buttons
    this.addEventListener('click', (e) => {
      const removeButton = e.target.closest('[data-remove]');
      if (removeButton) {
        e.preventDefault();
        this.updateItem(removeButton.dataset.remove, 0);
      }
    });
  }

  /**
   * Debounce quantity updates to prevent rapid-fire requests when the user
   * clicks +/- quickly. Waits 300ms after the last change before sending.
   * @param {string} key - The cart line item key.
   * @param {number} quantity - The new quantity.
   */
  debouncedUpdate(key, quantity) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateItem(key, quantity);
    }, 300);
  }

  /**
   * Update a cart line item quantity via POST to /cart/change.js.
   * A quantity of 0 removes the item. Uses Shopify's bundled section
   * rendering to get pre-rendered HTML in the same response — no
   * additional section fetch needed.
   * @param {string} key - The cart line item key.
   * @param {number} quantity - The new desired quantity (0 to remove).
   */
  async updateItem(key, quantity) {
    this.classList.add('is-loading');

    try {
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          id: key,
          quantity,
          sections: [this.sectionId]
        })
      });

      if (!response.ok) throw new Error('Failed to update cart');

      const data = await response.json();

      // Notify other components — includes pre-rendered section HTML
      document.dispatchEvent(new CustomEvent('cart:updated', {
        detail: { cart: data, sections: data.sections }
      }));

      // Self-render only on the cart page. Inside the drawer, cart-drawer's
      // synchronous event handler has already replaced this element.
      if (!this.insideDrawer) {
        this.renderFromSections(data.sections);
      }
    } catch (error) {
      const errorEl = this.querySelector('[data-error]');
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      }
      this.classList.remove('is-loading');
    }
  }

  /**
   * Replace this element's content using pre-rendered section HTML
   * from the bundled sections response.
   * @param {Object} sections - Map of section IDs to rendered HTML strings.
   */
  renderFromSections(sections) {
    const html = sections?.[this.sectionId];
    if (!html) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newCartItems = doc.querySelector('cart-items');

    if (newCartItems) {
      this.innerHTML = newCartItems.innerHTML;
    }
    this.classList.remove('is-loading');
  }
}

customElements.define('cart-items', CartItems);
