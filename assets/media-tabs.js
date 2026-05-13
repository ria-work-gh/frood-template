class MediaTabs extends HTMLElement {
  connectedCallback() {
    this.tabs = Array.from(this.querySelectorAll('.media-tab-button'));
    this.videoContainers = Array.from(this.querySelectorAll('.media-tabs-video'));
    this.videos = this.videoContainers.map((c) => c.querySelector('video'));
    this.activeIndex = 0;

    if (this.tabs.length === 0) return;

    this.tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => this.setActive(i));
    });

    this.videos.forEach((video, i) => {
      if (!video) return;
      video.addEventListener('ended', () => {
        if (i === this.activeIndex) {
          this.setActive((i + 1) % this.tabs.length);
        }
      });
    });

    this.setActive(0);
  }

  setActive(index) {
    this.activeIndex = index;

    this.tabs.forEach((tab, i) => {
      const isActive = i === index;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    this.videoContainers.forEach((container, i) => {
      const isActive = i === index;
      container.classList.toggle('is-active', isActive);

      const video = this.videos[i];
      if (!video) return;

      if (isActive) {
        try {
          video.currentTime = 0;
        } catch (_) {
          // Some browsers throw before metadata loads — safe to ignore.
        }
        video.play().catch(() => {
          // Autoplay blocked; user interaction will resume it.
        });
      } else {
        video.pause();
      }
    });
  }
}

customElements.define('media-tabs', MediaTabs);
