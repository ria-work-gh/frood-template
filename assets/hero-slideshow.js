/**
 * Hero Slideshow Web Component
 *
 * Wraps Embla Carousel for a hero slideshow with autoplay, dot navigation,
 * pause/play control, and full ARIA carousel pattern support.
 *
 * Expected markup:
 *   <hero-slideshow data-autoplay="5" data-pause-label="..." data-play-label="...">
 *     <div class="hero-slideshow__viewport">
 *       <div class="hero-slideshow__container">
 *         <div class="hero-slideshow__slide" role="group" aria-roledescription="slide">...</div>
 *       </div>
 *     </div>
 *     <div class="hero-slideshow__controls">
 *       <div class="hero-slideshow__dots" role="tablist">
 *         <button class="hero-slideshow__dot" role="tab" data-index="0">...</button>
 *       </div>
 *       <button class="hero-slideshow__pause">...</button>
 *     </div>
 *     <div class="hero-slideshow__live-region" aria-live="polite"></div>
 *   </hero-slideshow>
 */
class HeroSlideshow extends HTMLElement {
  connectedCallback() {
    this.slides = this.querySelectorAll('.hero-slideshow__slide');
    this.dots = this.querySelectorAll('.hero-slideshow__dot');
    this.pauseBtn = this.querySelector('.hero-slideshow__pause');
    this.liveRegion = this.querySelector('.hero-slideshow__live-region');
    this.viewport = this.querySelector('.hero-slideshow__viewport');

    // Single slide — no carousel needed
    if (this.slides.length < 2) return;

    // Wait for EmblaCarousel to be available
    if (typeof window.EmblaCarousel === 'undefined') {
      // Embla script has defer — wait for it
      const script = document.querySelector('script[src*="embla-carousel"]');
      if (script) {
        script.addEventListener('load', () => this._init(), { once: true });
      }
      return;
    }

    this._init();
  }

  _init() {
    this.embla = window.EmblaCarousel(this.viewport, { loop: true });
    this.classList.add('is-initialized');

    // Autoplay setup
    this._autoplayInterval = null;
    this._manuallyPaused = false;
    this._autoplaySeconds = parseInt(this.dataset.autoplay, 10);
    this._prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Bind methods for cleanup
    this._onSelect = this._onSlideChange.bind(this);
    this._onDotClick = this._handleDotClick.bind(this);
    this._onDotKeydown = this._handleDotKeydown.bind(this);
    this._onPauseClick = this._togglePause.bind(this);
    this._onMouseEnter = () => this._pauseAutoplay();
    this._onMouseLeave = () => { if (!this._manuallyPaused) this._startAutoplay(); };
    this._onFocusIn = () => this._pauseAutoplay();
    this._onFocusOut = (e) => {
      if (!this.contains(e.relatedTarget) && !this._manuallyPaused) {
        this._startAutoplay();
      }
    };

    // Embla slide change event
    this.embla.on('select', this._onSelect);

    // Dot navigation
    this.dots.forEach((dot) => {
      dot.addEventListener('click', this._onDotClick);
      dot.addEventListener('keydown', this._onDotKeydown);
    });

    // Pause/play button
    if (this.pauseBtn) {
      this.pauseBtn.addEventListener('click', this._onPauseClick);
    }

    // Hover/focus pausing
    this.addEventListener('mouseenter', this._onMouseEnter);
    this.addEventListener('mouseleave', this._onMouseLeave);
    this.addEventListener('focusin', this._onFocusIn);
    this.addEventListener('focusout', this._onFocusOut);

    // Start autoplay if enabled and reduced motion not preferred
    if (this._autoplaySeconds && !this._prefersReducedMotion) {
      this._startAutoplay();
    }

    // Sync initial state
    this._onSlideChange();
  }

  disconnectedCallback() {
    if (this.embla) {
      this.embla.off('select', this._onSelect);
      this.embla.destroy();
    }

    this._pauseAutoplay();

    this.dots.forEach((dot) => {
      dot.removeEventListener('click', this._onDotClick);
      dot.removeEventListener('keydown', this._onDotKeydown);
    });

    if (this.pauseBtn) {
      this.pauseBtn.removeEventListener('click', this._onPauseClick);
    }

    this.removeEventListener('mouseenter', this._onMouseEnter);
    this.removeEventListener('mouseleave', this._onMouseLeave);
    this.removeEventListener('focusin', this._onFocusIn);
    this.removeEventListener('focusout', this._onFocusOut);
  }

  _onSlideChange() {
    const index = this.embla.selectedScrollSnap();
    const total = this.slides.length;

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

    // Announce to screen readers
    if (this.liveRegion) {
      this.liveRegion.textContent = this.dots[index]?.getAttribute('aria-label') || '';
    }
  }

  _handleDotClick(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    this.embla.scrollTo(index);
    // If user clicks a dot, treat as manual interaction — stop autoplay
    this._manuallyPaused = false;
  }

  _handleDotKeydown(e) {
    const currentIndex = parseInt(e.currentTarget.dataset.index, 10);
    let targetIndex = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (currentIndex + 1) % this.dots.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (currentIndex - 1 + this.dots.length) % this.dots.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = this.dots.length - 1;
    }

    if (targetIndex !== null) {
      this.embla.scrollTo(targetIndex);
      this.dots[targetIndex].focus();
    }
  }

  _togglePause() {
    if (this._manuallyPaused) {
      this._manuallyPaused = false;
      this.classList.remove('is-paused');
      this.pauseBtn.setAttribute('aria-label', this.dataset.pauseLabel);
      this._startAutoplay();
    } else {
      this._manuallyPaused = true;
      this.classList.add('is-paused');
      this.pauseBtn.setAttribute('aria-label', this.dataset.playLabel);
      this._pauseAutoplay();
    }
  }

  _startAutoplay() {
    if (!this._autoplaySeconds || this._prefersReducedMotion || this._manuallyPaused) return;
    this._pauseAutoplay();
    this._autoplayInterval = setInterval(() => {
      this.embla.scrollNext();
    }, this._autoplaySeconds * 1000);
  }

  _pauseAutoplay() {
    if (this._autoplayInterval) {
      clearInterval(this._autoplayInterval);
      this._autoplayInterval = null;
    }
  }
}

customElements.define('hero-slideshow', HeroSlideshow);
