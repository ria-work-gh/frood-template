/**
 * Quick Add Web Component
 *
 * Renders inside product cards for single-variant products.
 * Posts to /cart/add.js via AJAX and dispatches 'cart:item-added'
 * so the cart drawer (or cart icon) can react. On error, navigates
 * to the product page as a graceful fallback.
 *
 * Expected markup:
 *   <quick-add>
 *     <button type="button" class="button" data-variant-id="12345">
 *       Quick add
 *     </button>
 *   </quick-add>
 */
class QuickAdd extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    if (!this.button) return;
    this.button.addEventListener('click', () => this.handleAdd());
  }

  async handleAdd() {
    const variantId = parseInt(this.button.dataset.variantId);
    this.button.classList.add('is-loading');
    this.button.disabled = true;

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.description);
      }

      const data = await response.json();
      document.dispatchEvent(new CustomEvent('cart:item-added', {
        detail: { items: data.items || data }
      }));
    } catch (error) {
      window.location.href = this.closest('.product-card')?.querySelector('a')?.href;
    } finally {
      this.button.classList.remove('is-loading');
      this.button.disabled = false;
    }
  }
}

customElements.define('quick-add', QuickAdd);
