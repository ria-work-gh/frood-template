/**
 * Product Gallery Web Component
 *
 * Wraps Embla Carousel for product media with dot navigation (mobile),
 * thumbnail navigation (desktop), variant-driven slide changes,
 * and video pause on slide leave.
 *
 * Expected markup:
 *   <product-gallery aria-roledescription="carousel" aria-label="...">
 *     <div class="product-gallery-viewport">
 *       <div class="product-gallery-container">
 *         <div class="product-gallery-slide" data-media-id="..." data-media-type="...">...</div>
 *       </div>
 *     </div>
 *     <div class="product-gallery-dots" role="tablist">
 *       <button class="product-gallery-dot" role="tab" data-index="0">...</button>
 *     </div>
 *     <div class="product-gallery-thumbs">
 *       <div class="product-gallery-thumbs-viewport">
 *         <div class="product-gallery-thumbs-container">
 *           <button class="product-gallery-thumb" data-index="0">...</button>
 *         </div>
 *       </div>
 *     </div>
 *     <div class="product-gallery-live-region" aria-live="polite"></div>
 *   </product-gallery>
 */
class ProductGallery extends HTMLElement {
  connectedCallback() {
    this.slides = this.querySelectorAll('.product-gallery-slide');
    this.dots = this.querySelectorAll('.product-gallery-dot');
    this.thumbs = this.querySelectorAll('.product-gallery-thumb');
    this.liveRegion = this.querySelector('.product-gallery-live-region');
    this.viewport = this.querySelector('.product-gallery-viewport');

    if (this.slides.length < 2) return;

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
    this.embla = window.EmblaCarousel(this.viewport, { loop: false, watchDrag: true });

    this.thumbsViewport = this.querySelector('.product-gallery-thumbs-viewport');
    if (this.thumbsViewport) {
      this.thumbsEmbla = window.EmblaCarousel(this.thumbsViewport, {
        loop: false,
        dragFree: true,
        containScroll: 'keepSnaps',
        watchDrag: true
      });
    }

    this.classList.add('is-initialized');

    this._onSelect = this._onSlideChange.bind(this);
    this._onDotClick = this._handleDotClick.bind(this);
    this._onDotKeydown = this._handleDotKeydown.bind(this);
    this._onThumbClick = this._handleThumbClick.bind(this);
    this._onVariantChanged = (e) => this._handleVariantChange(e.detail.variant);

    this.embla.on('select', this._onSelect);

    this.dots.forEach((dot) => {
      dot.addEventListener('click', this._onDotClick);
      dot.addEventListener('keydown', this._onDotKeydown);
    });

    this.thumbs.forEach((thumb) => {
      thumb.addEventListener('click', this._onThumbClick);
    });

    document.addEventListener('product:variant-changed', this._onVariantChanged);

    this._onSlideChange();
  }

  disconnectedCallback() {
    if (this.embla) {
      this.embla.off('select', this._onSelect);
      this.embla.destroy();
    }

    if (this.thumbsEmbla) {
      this.thumbsEmbla.destroy();
    }

    this.dots.forEach((dot) => {
      dot.removeEventListener('click', this._onDotClick);
      dot.removeEventListener('keydown', this._onDotKeydown);
    });

    this.thumbs.forEach((thumb) => {
      thumb.removeEventListener('click', this._onThumbClick);
    });

    document.removeEventListener('product:variant-changed', this._onVariantChanged);
  }

  _onSlideChange() {
    const index = this.embla.selectedScrollSnap();
    const previousIndex = this.embla.previousScrollSnap();

    // Pause media on previous slide
    if (index !== previousIndex) {
      this._pauseSlideMedia(previousIndex);
    }

    // Update slides aria-hidden
    this.slides.forEach((slide, i) => {
      if (i === index) {
        slide.removeAttribute('aria-hidden');
      } else {
        slide.setAttribute('aria-hidden', 'true');
      }
    });

    // Update dots
    this.dots.forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('is-active');
        dot.setAttribute('aria-selected', 'true');
        dot.setAttribute('tabindex', '0');
      } else {
        dot.classList.remove('is-active');
        dot.setAttribute('aria-selected', 'false');
        dot.setAttribute('tabindex', '-1');
      }
    });

    // Update thumbnails
    this.thumbs.forEach((thumb, i) => {
      if (i === index) {
        thumb.classList.add('is-active');
        thumb.setAttribute('aria-current', 'true');
        if (this.thumbsEmbla) this.thumbsEmbla.scrollTo(i);
      } else {
        thumb.classList.remove('is-active');
        thumb.setAttribute('aria-current', 'false');
      }
    });

    // Announce to screen readers
    if (this.liveRegion) {
      this.liveRegion.textContent = this.dots[index]?.getAttribute('aria-label') || '';
    }
  }

  _handleDotClick(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    this.embla.scrollTo(index);
  }

  _handleDotKeydown(e) {
    const currentIndex = parseInt(e.currentTarget.dataset.index, 10);
    const lastIndex = this.dots.length - 1;
    let targetIndex = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = Math.min(currentIndex + 1, lastIndex);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = Math.max(currentIndex - 1, 0);
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = lastIndex;
    }

    if (targetIndex !== null) {
      this.embla.scrollTo(targetIndex);
      this.dots[targetIndex].focus();
    }
  }

  _handleThumbClick(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    this.embla.scrollTo(index);
  }

  _handleVariantChange(variant) {
    if (!variant || !variant.featured_media) return;

    const mediaId = String(variant.featured_media.id);
    const slideIndex = Array.from(this.slides).findIndex(
      (slide) => slide.dataset.mediaId === mediaId
    );

    if (slideIndex !== -1) {
      this.embla.scrollTo(slideIndex);
    }
  }

  _pauseSlideMedia(index) {
    const slide = this.slides[index];
    if (!slide) return;

    const mediaType = slide.dataset.mediaType;

    if (mediaType === 'video') {
      const video = slide.querySelector('video');
      if (video) video.pause();
    }

    if (mediaType === 'external_video') {
      const iframe = slide.querySelector('iframe');
      if (!iframe) return;

      const src = iframe.src || '';
      if (src.includes('youtube.com')) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          '*'
        );
      } else if (src.includes('vimeo.com')) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ method: 'pause' }),
          '*'
        );
      }
    }
  }
}

customElements.define('product-gallery', ProductGallery);
