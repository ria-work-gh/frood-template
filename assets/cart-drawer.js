/**
 * Cart Drawer Web Component
 * Cart event protocol: .claude/conventions/commerce.md
 * Accessibility (focus trap, ARIA): .claude/conventions/accessibility.md
 *
 * Slide-from-right drawer that displays the cart contents. Opens automatically
 * on add-to-cart and via the cart icon. On 'cart:updated', uses the pre-rendered
 * section HTML from the event (bundled section rendering, zero extra fetches).
 * On 'cart:item-added', falls back to a standalone section fetch since the
 * product form doesn't include section data. Implements focus trapping and
 * keyboard navigation.
 *
 * Expected markup:
 *   <cart-drawer id="cart-drawer" class="cart-drawer" aria-hidden="true" role="dialog"
 *     aria-modal="true" aria-label="Cart">
 *     <div class="cart-drawer-overlay" data-overlay></div>
 *     <div class="cart-drawer-panel">
 *       <div class="cart-drawer-header">
 *         <h2 class="cart-drawer-title">Cart <span class="cart-drawer-count">(0)</span></h2>
 *         <button class="cart-drawer-close" data-close aria-label="Close cart">X</button>
 *       </div>
 *       <div class="cart-drawer-body">...</div>
 *       <div class="cart-drawer-footer">...</div>
 *     </div>
 *   </cart-drawer>
 */
class CartDrawer extends HTMLElement {
  connectedCallback() {
    this.overlay = this.querySelector('[data-overlay]');
    this.closeBtn = this.querySelector('[data-close]');
    this.previouslyFocused = null;
    this.stale = false;

    this.handleKeydown = this.handleKeydown.bind(this);

    // Close button and overlay clicks
    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());

    // Listen for cart events (named functions for disconnectedCallback)
    this._onItemAdded = () => this.refresh().then(() => this.open());
    this._onCartUpdated = (e) => {
      const html = e.detail?.sections?.['cart-drawer'];
      if (html) {
        this.renderFromHTML(html);
      } else if (this.isOpen) {
        this.refresh();
      } else {
        this.stale = true;
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
   * Whether the drawer is currently open.
   * @returns {boolean}
   */
  get isOpen() {
    return this.classList.contains('is-open');
  }

  /**
   * Open the cart drawer. Adds the is-open class, locks body scroll,
   * traps focus inside the drawer, and listens for Escape key.
   */
  open() {
    if (this.stale) {
      this.refresh();
      this.stale = false;
    }

    this.previouslyFocused = document.activeElement;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');

    // Set up focus trap and keyboard listener
    document.addEventListener('keydown', this.handleKeydown);
    this.trapFocus();
  }

  /**
   * Close the cart drawer. Removes is-open class, unlocks body scroll,
   * releases focus trap, and returns focus to the previously focused element.
   */
  close() {
    this.classList.remove('is-open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');

    // Remove keyboard listener
    document.removeEventListener('keydown', this.handleKeydown);

    // Return focus to the element that triggered the drawer
    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }

  /**
   * Swap drawer DOM from a rendered section HTML string.
   * Replaces body, footer, and count. Handles the empty-cart transition
   * (footer is absent when cart has no items).
   * @param {string} html - Full rendered section HTML.
   */
  renderFromHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newDrawer = doc.querySelector('cart-drawer');
    if (!newDrawer) return;

    // Replace body content (items + upsells, or empty state)
    const currentBody = this.querySelector('.cart-drawer-body');
    const newBody = newDrawer.querySelector('.cart-drawer-body');
    if (currentBody && newBody) {
      currentBody.innerHTML = newBody.innerHTML;
    }

    // Replace or toggle footer (absent when cart is empty)
    const panel = this.querySelector('.cart-drawer-panel');
    const currentFooter = this.querySelector('.cart-drawer-footer');
    const newFooter = newDrawer.querySelector('.cart-drawer-footer');

    if (newFooter) {
      if (currentFooter) {
        currentFooter.innerHTML = newFooter.innerHTML;
        currentFooter.hidden = false;
      } else if (panel) {
        panel.insertAdjacentHTML('beforeend', newFooter.outerHTML);
      }
    } else if (currentFooter) {
      currentFooter.hidden = true;
    }

    // Update the item count display
    const currentCount = this.querySelector('.cart-drawer-count');
    const newCount = newDrawer.querySelector('.cart-drawer-count');
    if (currentCount && newCount) {
      currentCount.textContent = newCount.textContent;
    }
  }

  /**
   * Fetch fresh section HTML via AJAX section rendering and swap the DOM.
   * Used for 'cart:item-added' events where no bundled section data is
   * available, and as a fallback when the drawer is open but the event
   * doesn't include cart-drawer section HTML.
   */
  async refresh() {
    this.classList.add('is-loading');

    try {
      const sectionId = this.id || 'cart-drawer';
      const response = await fetch(`${window.location.pathname}?section_id=${sectionId}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (!response.ok) return;

      this.renderFromHTML(await response.text());
    } finally {
      this.classList.remove('is-loading');
    }
  }

  /**
   * Handle keydown events for Escape to close and Tab to trap focus.
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key !== 'Tab') return;

    // Get all currently focusable elements within the drawer
    const focusableElements = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Wrap focus when tabbing past the last or before the first element
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
