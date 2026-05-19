/*
  <product-card-quick-add>

  Lightweight quick-add for product cards. Intercepts the wrapped <form>'s
  submission, POSTs to /cart/add.js for the default variant, and dispatches
  'cart:item-added' so the cart drawer opens and the cart icon updates.

  Why a separate component (not <product-form>): the PDP form handles variant
  selectors, quantity input, server-rendered region swaps, and product JSON
  parsing. None of that applies on a card — there's no variant picker, no
  quantity, just one button → first available variant.

  Expected markup (emitted by snippets/product-card.liquid):

    <product-card-quick-add>
      <form action="/cart/add" method="post">
        <input type="hidden" name="id" value="{{ variant.id }}">
        <button type="submit" class="button">Shop now</button>
      </form>
    </product-card-quick-add>

  No-JS fallback: the <form action="/cart/add"> POSTs normally and the
  browser navigates to /cart after submit. Works without the component.
*/

class ProductCardQuickAdd extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    if (!this.form) return;

    this.button = this.form.querySelector('button[type="submit"]');
    this.handleSubmit = this.handleSubmit.bind(this);
    this.form.addEventListener('submit', this.handleSubmit);
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.handleSubmit);
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.button || this.button.disabled) return;

    this.button.classList.add('is-loading');
    this.button.disabled = true;

    try {
      const variantId = this.form.querySelector('input[name="id"]')?.value;
      if (!variantId) throw new Error('Missing variant id');

      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ items: [{ id: parseInt(variantId, 10), quantity: 1 }] })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.description || 'Failed to add to cart');
      }

      const data = await response.json();

      document.dispatchEvent(new CustomEvent('cart:item-added', {
        detail: { items: data.items || data }
      }));

      // If cart type is 'page' (not drawer), redirect — matches product-form.js
      if (document.body.dataset.cartType === 'page') {
        window.location.href = '/cart';
      }
    } catch (err) {
      console.error('[product-card-quick-add]', err);
      // Cards are too small for inline error UI. Failures are rare in practice
      // (default variant is always available unless product is sold out, in
      // which case the button is disabled at render time).
    } finally {
      this.button.classList.remove('is-loading');
      this.button.disabled = false;
    }
  }
}

customElements.define('product-card-quick-add', ProductCardQuickAdd);
