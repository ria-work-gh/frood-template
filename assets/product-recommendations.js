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

        if (recommendations && recommendations.innerHTML.trim().length) {
          this.innerHTML = recommendations.innerHTML;
        } else {
          this.remove();
        }
      })
      .catch(() => {
        this.remove();
      });
  }
}

customElements.define('product-recommendations', ProductRecommendations);
