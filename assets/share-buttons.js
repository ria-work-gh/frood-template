/**
 * Share Buttons Web Component
 *
 * Provides sharing functionality using the Web Share API with a clipboard
 * fallback. Shows a brief confirmation message after sharing or copying.
 *
 * Expected markup:
 *   <share-buttons>
 *     <button data-share aria-label="Share this page">Share</button>
 *     <input type="hidden" data-url value="https://example.com/products/foo">
 *     <input type="hidden" data-title value="Product Name">
 *     <span data-confirmation hidden>Link copied!</span>
 *   </share-buttons>
 */
class ShareButtons extends HTMLElement {
  connectedCallback() {
    // Reveal the component — hidden by default for progressive enhancement
    this.removeAttribute('hidden');

    this.shareButton = this.querySelector('[data-share]');
    this.urlInput = this.querySelector('[data-url]');
    this.titleInput = this.querySelector('[data-title]');
    this.confirmation = this.querySelector('[data-confirmation]');

    this.shareButton?.addEventListener('click', () => this.handleShare());
  }

  /**
   * Attempt to share via the Web Share API. If that's not available or fails,
   * fall back to copying the URL to the clipboard. Shows a confirmation
   * message for 2 seconds after either action succeeds.
   */
  async handleShare() {
    const url = this.urlInput?.value || window.location.href;
    const title = this.titleInput?.value || document.title;

    try {
      // Try the native Web Share API first
      if (navigator.share) {
        await navigator.share({ url, title });
      } else {
        // Fallback: copy URL to clipboard
        await navigator.clipboard.writeText(url);
        this.showConfirmation();
      }
    } catch (error) {
      // User cancelled the share dialog, or share/clipboard failed.
      // If navigator.share was cancelled (AbortError), do nothing.
      // Otherwise try clipboard as final fallback.
      if (error.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url);
          this.showConfirmation();
        } catch {
          // Clipboard also failed — nothing more we can do
        }
      }
    }
  }

  /**
   * Show the confirmation message for 2 seconds, then hide it.
   */
  showConfirmation() {
    if (!this.confirmation) return;

    this.confirmation.hidden = false;

    // Auto-hide after 2 seconds
    setTimeout(() => {
      this.confirmation.hidden = true;
    }, 2000);
  }
}

customElements.define('share-buttons', ShareButtons);
