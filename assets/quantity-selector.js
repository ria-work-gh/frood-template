/**
 * Quantity Selector Web Component
 *
 * Provides +/- buttons flanking a number input for quantity control.
 * Clamps values between min and max. Dispatches native change events
 * on the input so parent components (cart-items, product-form) can react.
 *
 * Expected markup:
 *   <quantity-selector>
 *     <button type="button" data-action="decrease" aria-label="Decrease quantity">-</button>
 *     <input type="number" name="quantity" value="1" min="1" max="99" aria-label="Quantity">
 *     <button type="button" data-action="increase" aria-label="Increase quantity">+</button>
 *   </quantity-selector>
 */
class QuantitySelector extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input[type="number"]');
    this.min = parseInt(this.input.min) || 0;
    this.max = parseInt(this.input.max) || 99;

    this.querySelector('[data-action="decrease"]')?.addEventListener('click', () => this.update(-1));
    this.querySelector('[data-action="increase"]')?.addEventListener('click', () => this.update(1));
    this.input.addEventListener('change', () => this.clamp());
  }

  /**
   * Adjust the current value by a delta (+1 or -1), clamped to min/max.
   * Dispatches a bubbling change event so parent elements are notified.
   * @param {number} delta - Amount to add to the current value.
   */
  update(delta) {
    this.input.value = Math.min(this.max, Math.max(this.min, parseInt(this.input.value) + delta));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Ensure the current input value is within min/max bounds.
   * Called on manual user edits of the number input.
   */
  clamp() {
    let val = parseInt(this.input.value);
    if (isNaN(val)) val = this.min;
    this.input.value = Math.min(this.max, Math.max(this.min, val));
  }
}

customElements.define('quantity-selector', QuantitySelector);
