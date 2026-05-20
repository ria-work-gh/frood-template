class ProductRenderVideo extends HTMLElement {
  connectedCallback() {
    this.video = this.querySelector('video');
    if (!this.video) return;

    this.video.removeAttribute('loop');
    this.video.muted = true;
    this.video.playsInline = true;

    this.handleIntersect = this.handleIntersect.bind(this);
    this.observer = new IntersectionObserver(this.handleIntersect, {
      threshold: 0.25,
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    if (this.observer) this.observer.disconnect();
  }

  handleIntersect(entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        this.video.currentTime = 0;
        this.video.play().catch(() => {});
      } else {
        this.video.pause();
      }
    });
  }
}

customElements.define('product-render-video', ProductRenderVideo);
