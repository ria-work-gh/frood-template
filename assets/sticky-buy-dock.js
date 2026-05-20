class StickyBuyDock extends HTMLElement {
  connectedCallback() {
    this.dock = this.querySelector('.product-buy-dock');
    if (!this.dock) return;

    this.endBoundary = document.querySelector('.product-recommendations');
    if (!this.endBoundary) return;

    this.isFixed = false;

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    this.update();
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  handleScroll() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => this.update());
  }

  handleResize() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => this.update());
  }

  update() {
    if (!this.endBoundary || !this.dock) return;

    if (!window.matchMedia('(min-width: 900px)').matches) {
      this.unfix();
      return;
    }

    const headerHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--spacing-xxs')
      ) || 8;

    const wrapperRect = this.getBoundingClientRect();
    const endRect = this.endBoundary.getBoundingClientRect();
    const dockHeight = this.isFixed ? this.dock.offsetHeight : this.offsetHeight;

    const wrapperTop = wrapperRect.top;
    const endBottom = endRect.bottom;

    if (wrapperTop > headerHeight) {
      this.unfix();
    } else if (endBottom > headerHeight + dockHeight) {
      this.fix(headerHeight);
    } else if (endBottom > 0) {
      this.fix(endBottom - dockHeight);
    } else {
      this.unfix();
    }
  }

  fix(topPx) {
    if (!this.isFixed) {
      this.isFixed = true;
      this.style.height = `${this.dock.offsetHeight}px`;
    }

    const rect = this.getBoundingClientRect();
    this.dock.style.position = 'fixed';
    this.dock.style.top = `${topPx}px`;
    this.dock.style.left = `${rect.left}px`;
    this.dock.style.width = `${rect.width}px`;
    this.dock.style.zIndex = '2';
  }

  unfix() {
    if (!this.isFixed) return;
    this.isFixed = false;
    this.style.height = '';
    this.dock.style.position = '';
    this.dock.style.top = '';
    this.dock.style.left = '';
    this.dock.style.width = '';
    this.dock.style.zIndex = '';
  }
}

customElements.define('sticky-buy-dock', StickyBuyDock);
