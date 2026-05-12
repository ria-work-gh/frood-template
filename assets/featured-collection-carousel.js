/**
 * Featured Collection Carousel Web Component
 *
 * Wraps Embla Carousel for a product carousel with arrow navigation,
 * drag/swipe, and infinite looping.
 *
 * Expected markup:
 *   <featured-collection-carousel aria-roledescription="carousel" aria-label="...">
 *     <div class="featured-collection-carousel-viewport">
 *       <div class="featured-collection-carousel-container">
 *         <div class="featured-collection-carousel-slide" role="group" aria-roledescription="slide">...</div>
 *       </div>
 *     </div>
 *     <div class="featured-collection-carousel-arrows">
 *       <button data-prev>...</button>
 *       <button data-next>...</button>
 *     </div>
 *   </featured-collection-carousel>
 */
class FeaturedCollectionCarousel extends HTMLElement {
  connectedCallback() {
    this.viewport = this.querySelector('.featured-collection-carousel-viewport');
    this.prevBtn = this.querySelector('[data-prev]');
    this.nextBtn = this.querySelector('[data-next]');

    if (!this.viewport) return;

    // Wait for EmblaCarousel to be available
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
      align: 'start',
      // slidesToScroll: 'auto',
    });

    this.classList.add('is-initialized');

    this._onPrevClick = () => this.embla.scrollPrev();
    this._onNextClick = () => this.embla.scrollNext();

    if (this.prevBtn) this.prevBtn.addEventListener('click', this._onPrevClick);
    if (this.nextBtn) this.nextBtn.addEventListener('click', this._onNextClick);
  }

  disconnectedCallback() {
    if (this.embla) {
      this.embla.destroy();
    }

    if (this.prevBtn) this.prevBtn.removeEventListener('click', this._onPrevClick);
    if (this.nextBtn) this.nextBtn.removeEventListener('click', this._onNextClick);
  }
}

customElements.define('featured-collection-carousel', FeaturedCollectionCarousel);
