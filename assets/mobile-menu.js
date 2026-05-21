/**
 * Mobile Menu Web Component
 *
 * Full-height slide-from-left navigation drawer for mobile devices.
 * Provides focus trapping, Escape key support, and overlay click to close.
 * The trigger button in the header should have aria-controls="mobile-menu"
 * to allow this component to find and wire it up automatically.
 *
 * Expected markup:
 *   <mobile-menu id="mobile-menu" class="mobile-menu" aria-hidden="true">
 *     <div class="mobile-menu-overlay" data-overlay></div>
 *     <div class="mobile-menu-panel">
 *       <button class="mobile-menu-close" data-close aria-label="Close menu">X</button>
 *       <nav aria-label="Mobile navigation">
 *         <a href="/collections">Shop</a>
 *         ...
 *       </nav>
 *     </div>
 *   </mobile-menu>
 */
class MobileMenu extends HTMLElement {
  connectedCallback() {
    this.trigger = document.querySelector('[aria-controls="mobile-menu"]');
    this.closeBtn = this.querySelector('[data-close]');
    this.overlay = this.querySelector('[data-overlay]');
    this.previouslyFocused = null;

    // Bind keydown handler for focus trap and Escape
    this.handleKeydown = this.handleKeydown.bind(this);

    // Wire up trigger button in the header (named for cleanup)
    this._onTriggerClick = () => this.open();
    this.trigger?.addEventListener('click', this._onTriggerClick);

    // Close button
    this.closeBtn?.addEventListener('click', () => this.close());

    // Overlay click
    this.overlay?.addEventListener('click', () => this.close());
  }

  disconnectedCallback() {
    this.trigger?.removeEventListener('click', this._onTriggerClick);
    document.removeEventListener('keydown', this.handleKeydown);
    document.body.classList.remove('menu-open');
  }

  /**
   * Whether the menu is currently open.
   * @returns {boolean}
   */
  get isOpen() {
    return this.classList.contains('is-open');
  }

  /**
   * Open the mobile menu. Adds is-open class, locks body scroll via
   * menu-open class, sets up focus trap, and focuses the close button.
   */
  open() {
    this.previouslyFocused = document.activeElement;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');

    // Update trigger aria-expanded
    this.trigger?.setAttribute('aria-expanded', 'true');

    // Set up keyboard listener for Escape and focus trapping
    document.addEventListener('keydown', this.handleKeydown);

    // Focus the close button as the first interactive element
    this.closeBtn?.focus();
  }

  /**
   * Close the mobile menu. Removes is-open class, unlocks body scroll,
   * releases focus trap, and returns focus to the trigger element.
   */
  close() {
    this.classList.remove('is-open');
    this.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');

    // Update trigger aria-expanded
    this.trigger?.setAttribute('aria-expanded', 'false');

    // Remove keyboard listener
    document.removeEventListener('keydown', this.handleKeydown);

    // Return focus to the element that opened the menu
    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
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

    // Get all focusable elements within the menu
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
}

customElements.define('mobile-menu', MobileMenu);
