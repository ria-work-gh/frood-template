class ProductRecommendations extends HTMLElement {
  connectedCallback() {
    this.observer = new IntersectionObserver(
      (entries, observer) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        this.loadRecommendations();
      },
      { rootMargin: '0px 0px 400px 0px' }
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  loadRecommendations() {
    const url = this.dataset.url;
    if (!url) return;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((html) => {
        const fragment = document.createElement('div');
        fragment.innerHTML = html;
        const recommendations = fragment.querySelector('product-recommendations');

        // Only swap if the fetched section has content. If Shopify's
        // recommendations engine returned nothing AND the section's Liquid
        // fallback also produced no products, leave the initial SSR render
        // (already populated from the fallback collection) in place.
        if (recommendations && recommendations.innerHTML.trim().length) {
          this.innerHTML = recommendations.innerHTML;
          // <script> tags inserted via innerHTML are inert. Re-create each one
          // so the browser executes it — needed to load product-card-hover-video,
          // product-card-stage (3D), and product-card-quick-add for any card in
          // the recommendations grid. Without this, recommended cards render
          // statically with no hover transition or 3D auto-rotate.
          this.querySelectorAll('script').forEach((oldScript) => {
            const newScript = document.createElement('script');
            for (const attr of oldScript.attributes) {
              newScript.setAttribute(attr.name, attr.value);
            }
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });
        }
      })
      .catch(() => {
        this.remove();
      });
  }
}

customElements.define('product-recommendations', ProductRecommendations);
