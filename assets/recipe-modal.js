class RecipeModal extends HTMLElement {
  connectedCallback() {
    this.trigger = this.querySelector('.recipe-card-link');
    this.modal = this.querySelector('.recipe-modal');
    this.closeBtn = this.querySelector('.recipe-modal-close');
    this.video = this.querySelector('.recipe-modal-video video');

    if (!this.trigger || !this.modal) return;

    this.handleOpen = this.open.bind(this);
    this.handleClose = this.close.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleBackdropClick = this.handleBackdropClick.bind(this);

    this.trigger.addEventListener('click', this.handleOpen);
    this.closeBtn?.addEventListener('click', this.handleClose);
    this.modal.addEventListener('click', this.handleBackdropClick);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeydown);
    document.body.style.overflow = '';
  }

  open() {
    this.previouslyFocused = document.activeElement;
    this.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this.handleKeydown);
    this.closeBtn?.focus();
    this.video?.play().catch(() => {});
    this.dispatchEvent(new CustomEvent('recipe-modal:opened', { bubbles: true }));
  }

  close() {
    this.modal.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this.handleKeydown);
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
    }
    this.previouslyFocused?.focus?.();
    this.dispatchEvent(new CustomEvent('recipe-modal:closed', { bubbles: true }));
  }

  handleKeydown(e) {
    if (e.key === 'Escape') this.close();
  }

  handleBackdropClick(e) {
    if (e.target === this.modal) this.close();
  }
}

customElements.define('recipe-modal', RecipeModal);
