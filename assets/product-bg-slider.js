/**
 * Product Background Slider Web Component
 *
 * Embla slide-and-drag carousel that sits as the background of the
 * main-product section. Source media is product.media from index 2 onwards
 * (the first two media entries are reserved for the foreground gallery).
 *
 * Expected markup (rendered by sections/main-product.liquid):
 *   <product-bg-slider class="product-bg-slider" aria-hidden="true">
 *     <div class="product-bg-slider-viewport">
 *       <div class="product-bg-slider-container">
 *         <div class="product-bg-slider-slide">...</div>
 *       </div>
 *     </div>
 *   </product-bg-slider>
 */
class ProductBgSlider extends HTMLElement {
  connectedCallback() {
    this.viewport = this.querySelector('.product-bg-slider-viewport');
    this.slides = this.querySelectorAll('.product-bg-slider-slide');

    if (!this.viewport || this.slides.length < 2) return;

    if (typeof window.EmblaCarousel === 'undefined') {
      const script = document.querySelector('script[src*="embla-carousel"]');
      if (script) {
        script.addEventListener('load', () => this._init(), { once: true });
      }
      return;
    }

    this._init();
  }

  _init() {
    this.embla = window.EmblaCarousel(this.viewport, {
      loop: true,
      watchDrag: true,
      duration: 30,
    });
    this.classList.add('is-initialized');
  }

  disconnectedCallback() {
    if (this.embla) {
      this.embla.destroy();
    }
  }
}

customElements.define('product-bg-slider', ProductBgSlider);
