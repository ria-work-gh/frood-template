/**
 * Filter Drawer Web Component
 *
 * Slide-from-left drawer for collection filtering. Intercepts the filter form
 * submit and active-filter pill clicks, fetches updated HTML via Shopify's
 * Section Rendering API, and swaps the product grid + filter UI without a full
 * page reload. Falls back to normal form submission when JS is unavailable.
 *
 * Expected markup:
 *   <filter-drawer id="filter-drawer" class="filter-drawer" aria-hidden="true"
 *     role="dialog" aria-modal="true" aria-label="Filters">
 *     <div class="filter-drawer-overlay" data-overlay></div>
 *     <div class="filter-drawer-panel">
 *       <div class="filter-drawer-header">
 *         <h2 class="filter-drawer-title">Filters</h2>
 *         <button class="filter-drawer-close" data-close aria-label="Close filters">X</button>
 *       </div>
 *       <div class="filter-drawer-body">
 *         <form data-filters class="filter-form" action="/collections/foo" method="get">
 *           ...filter inputs...
 *           <button type="submit">Apply</button>
 *         </form>
 *       </div>
 *     </div>
 *   </filter-drawer>
 */
class FilterDrawer extends HTMLElement {
  connectedCallback() {
    this.overlay = this.querySelector('[data-overlay]');
    this.closeBtn = this.querySelector('[data-close]');
    this.previouslyFocused = null;

    this.section = this.closest('[data-section-id]');
    this.sectionId = this.section?.dataset.sectionId;
    this.trigger = document.querySelector('[aria-controls="filter-drawer"]');

    this.handleKeydown = this.handleKeydown.bind(this);
    this._onPopState = () => this.applyFilters(location.href);

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());
    this.trigger?.addEventListener('click', () => this.open());

    this.bindForm();
    this.bindPills();
    this.bindSort();

    window.addEventListener('popstate', this._onPopState);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this._onPopState);
  }

  get isOpen() {
    return this.classList.contains('is-open');
  }

  open() {
    this.previouslyFocused = document.activeElement;

    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    this.trigger?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('filter-drawer-open');

    document.addEventListener('keydown', this.handleKeydown);
    this.trapFocus();
  }

  close() {
    this.classList.remove('is-open');
    this.setAttribute('aria-hidden', 'true');
    this.trigger?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('filter-drawer-open');

    document.removeEventListener('keydown', this.handleKeydown);

    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  trapFocus() {
    const focusable = this.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  bindForm() {
    const form = this.querySelector('[data-filters]');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      const sortBy = new URL(location.href).searchParams.get('sort_by');
      if (sortBy) params.set('sort_by', sortBy);
      const url = `${form.action}?${params}`;
      this.applyFilters(url);
    });

    const clearLink = this.querySelector('[data-clear-filters]');
    clearLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyFilters(clearLink.href);
    });
  }

  bindPills() {
    this.section?.addEventListener('click', (e) => {
      const pill = e.target.closest('.active-filter');
      if (!pill) return;
      e.preventDefault();
      this.applyFilters(pill.href);
    });
  }

  bindSort() {
    this.section?.addEventListener('change', (e) => {
      const select = e.target.closest('[data-sort-select]');
      if (!select) return;
      const currentUrl = new URL(location.href);
      const sortUrl = new URL(select.value, location.origin);
      currentUrl.searchParams.set('sort_by', sortUrl.searchParams.get('sort_by'));
      this.applyFilters(currentUrl.href);
    });
  }

  async applyFilters(url) {
    if (!this.sectionId) return;

    this.section.classList.add('is-loading');

    try {
      const fetchUrl = new URL(url, location.origin);
      fetchUrl.searchParams.set('section_id', this.sectionId);

      const response = await fetch(fetchUrl, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      this.swap('[data-products]', doc);
      this.swap('[data-active-filters]', doc);
      this.swap('[data-sorting]', doc);
      this.swap('.filter-count', doc);
      this.swapForm(doc);

      const cleanUrl = new URL(url, location.origin);
      cleanUrl.searchParams.delete('section_id');

      if (cleanUrl.href !== location.href) {
        history.pushState({}, '', cleanUrl);
      }

      if (this.isOpen) this.close();

      const products = this.section.querySelector('[data-products]');
      if (products) {
        products.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } finally {
      this.section.classList.remove('is-loading');
    }
  }

  swap(selector, doc) {
    const current = this.section.querySelector(selector);
    const next = doc.querySelector(selector);
    if (current && next) {
      current.innerHTML = next.innerHTML;
    }
  }

  swapForm(doc) {
    const currentBody = this.querySelector('.filter-drawer-body');
    const newBody = doc.querySelector('.filter-drawer-body');
    if (currentBody && newBody) {
      currentBody.innerHTML = newBody.innerHTML;
      this.bindForm();
    }
  }
}

customElements.define('filter-drawer', FilterDrawer);
