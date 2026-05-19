/*
  <product-card-hover-video>

  Pattern: <source data-src=...> ships zero MP4 bytes per card. First hover
  (after an 80ms intent debounce) promotes data-src → src and calls
  video.load() + play(). After that the file is cached for the session, so
  subsequent hovers are instant.

  Hover in  → 80ms intent debounce → play forward
  Hover out → pause + currentTime = 0 (snap to frame 0; the always-visible
              <img> underneath shows the still anyway, so the snap happens
              "under" the CSS opacity fade and is invisible to the user)

  We swallow the inevitable AbortError from pause()-while-play()-pending via
  .catch() on the stored playPromise.

  prefers-reduced-motion: reduce → skip play entirely. CSS also keeps the
  video element hidden on hover under reduced motion, so the user just sees
  the static <img>.
*/

const INTENT_DELAY_MS = 80;

class ProductCardHoverVideo extends HTMLElement {
  connectedCallback() {
    this.video = this.querySelector('video');
    this.source = this.video?.querySelector('source');
    this.card = this.closest('.product-card');
    if (!this.video || !this.source || !this.card) return;

    this.playPromise = null;
    this.intentTimeout = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.handleEnter = this.handleEnter.bind(this);
    this.handleLeave = this.handleLeave.bind(this);
    this.card.addEventListener('mouseenter', this.handleEnter);
    this.card.addEventListener('mouseleave', this.handleLeave);
  }

  disconnectedCallback() {
    this.card?.removeEventListener('mouseenter', this.handleEnter);
    this.card?.removeEventListener('mouseleave', this.handleLeave);
    if (this.intentTimeout) clearTimeout(this.intentTimeout);
  }

  handleEnter() {
    if (this.reducedMotion) return;

    if (this.intentTimeout) clearTimeout(this.intentTimeout);
    this.intentTimeout = setTimeout(() => {
      this.intentTimeout = null;
      this.startPlay();
    }, INTENT_DELAY_MS);
  }

  startPlay() {
    if (!this.source.src && this.source.dataset.src) {
      this.source.src = this.source.dataset.src;
      this.video.load();
    }

    const promise = this.video.play();
    if (promise !== undefined) {
      this.playPromise = promise;
      promise.catch(() => {});
    }
  }

  handleLeave() {
    if (!this.video) return;

    // Cursor moved out before the intent timer fired — never committed to
    // loading this video. Cancel and bail without any fetch or playback.
    if (this.intentTimeout) {
      clearTimeout(this.intentTimeout);
      this.intentTimeout = null;
      return;
    }

    if (this.playPromise) {
      this.playPromise.catch(() => {});
      this.playPromise = null;
    }

    this.video.pause();
    this.video.currentTime = 0;
  }
}

customElements.define('product-card-hover-video', ProductCardHoverVideo);
