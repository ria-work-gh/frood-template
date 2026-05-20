/**
 * <toast-region> — global transient feedback.
 *
 * A single live region rendered once in layout/theme.liquid (via
 * snippets/toast-region.liquid), the same singleton pattern as <cart-drawer>
 * and <search-drawer>. Anything on the page can show a toast by dispatching a
 * `toast:show` CustomEvent on `document`, or by importing the showToast()
 * helper below — no reference to this element is needed.
 *
 * Use toasts for action-level / global feedback ("Added to bag", a network
 * failure, checkout error). Field-level validation stays inline near the field
 * (see conventions/commerce.md) — don't toast a "Only 3 available" message.
 *
 * Event contract (the public API):
 *   document.dispatchEvent(new CustomEvent('toast:show', {
 *     detail: {
 *       message,                  // string, required — set via textContent
 *       variant = 'info',         // 'success' | 'error' | 'info'
 *       duration = 4000,          // ms; 0 = sticky (no auto-dismiss)
 *     }
 *   }));
 *   // or: import { showToast } from './toast.js';
 *   //     showToast('Added to bag', { variant: 'success' });
 *
 * Accessibility: the region is aria-live="polite" so success/info announce
 * politely; error toasts get role="alert" (assertive) on the toast itself.
 * Toasts never steal focus. Auto-dismiss pauses on hover/focus.
 *
 * Expected markup (toast-region.liquid owns it, incl. the clone <template>):
 *   <toast-region class="toast-region" aria-live="polite">
 *     <template data-toast-template>
 *       <div class="toast" role="status">
 *         <span class="toast-message"></span>
 *         <button type="button" class="toast-close" data-dismiss aria-label="…">
 *           {% render 'icon-close' %}
 *         </button>
 *       </div>
 *     </template>
 *   </toast-region>
 */

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 3;
const LEAVE_FALLBACK = 350; // ms — remove even if transitionend never fires
const VARIANTS = ['success', 'error', 'info'];

/**
 * Show a toast from anywhere. Thin wrapper over the `toast:show` event so
 * callers don't need a handle on <toast-region>.
 * @param {string} message
 * @param {{ variant?: 'success'|'error'|'info', duration?: number }} [options]
 */
export function showToast(message, options = {}) {
  document.dispatchEvent(
    new CustomEvent('toast:show', { detail: { message, ...options } })
  );
}

class ToastRegion extends HTMLElement {
  connectedCallback() {
    this.template = this.querySelector('[data-toast-template]');
    this.timers = new WeakMap(); // toast element -> { remaining, startedAt, timer }

    this._onToastShow = (e) => this.show(e.detail || {});
    document.addEventListener('toast:show', this._onToastShow);
  }

  disconnectedCallback() {
    document.removeEventListener('toast:show', this._onToastShow);
  }

  /**
   * Build, mount, and schedule a toast.
   * @param {{ message?: string, variant?: string, duration?: number }} detail
   */
  show({ message, variant = 'info', duration = DEFAULT_DURATION }) {
    if (!message || !this.template) return;
    if (!VARIANTS.includes(variant)) variant = 'info';

    const fragment = this.template.content.cloneNode(true);
    const toast = fragment.querySelector('.toast');
    const messageEl = toast.querySelector('.toast-message');
    const closeBtn = toast.querySelector('[data-dismiss]');

    toast.classList.add(`toast-${variant}`);
    // Errors announce assertively; success/info inherit the region's polite live setting.
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    messageEl.textContent = message;

    closeBtn?.addEventListener('click', () => this.dismiss(toast));

    if (duration > 0) {
      this.timers.set(toast, { remaining: duration, startedAt: 0, timer: null });
      toast.addEventListener('mouseenter', () => this.pause(toast));
      toast.addEventListener('mouseleave', () => this.resume(toast));
      toast.addEventListener('focusin', () => this.pause(toast));
      toast.addEventListener('focusout', () => this.resume(toast));
    }

    this.appendChild(toast);
    this.enforceLimit();
    this.resume(toast);

    // Next frame: flip to the visible state so the enter transition runs.
    requestAnimationFrame(() => toast.classList.add('is-visible'));
  }

  /** Pause a toast's auto-dismiss timer, banking the remaining time. */
  pause(toast) {
    const state = this.timers.get(toast);
    if (!state || !state.timer) return;
    clearTimeout(state.timer);
    state.timer = null;
    state.remaining -= Date.now() - state.startedAt;
  }

  /** (Re)start a toast's auto-dismiss timer with its banked remaining time. */
  resume(toast) {
    const state = this.timers.get(toast);
    if (!state || state.timer) return;
    state.startedAt = Date.now();
    state.timer = setTimeout(() => this.dismiss(toast), Math.max(0, state.remaining));
  }

  /** Animate a toast out, then remove it. */
  dismiss(toast) {
    const state = this.timers.get(toast);
    if (state?.timer) clearTimeout(state.timer);
    this.timers.delete(toast);

    if (toast.dataset.leaving) return; // already dismissing
    toast.dataset.leaving = 'true';

    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');

    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Fallback if transitionend never fires (reduced motion zeroes transitions).
    setTimeout(() => toast.remove(), LEAVE_FALLBACK);
  }

  /** Drop the oldest toasts once more than MAX_VISIBLE are on screen. */
  enforceLimit() {
    const toasts = [...this.querySelectorAll('.toast:not([data-leaving])')];
    for (let i = 0; i < toasts.length - MAX_VISIBLE; i++) {
      this.dismiss(toasts[i]);
    }
  }
}

customElements.define('toast-region', ToastRegion);
