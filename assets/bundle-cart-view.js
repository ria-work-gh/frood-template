/*
  bundle-cart-view.js — shared renderer for the "Your Box" panel.

  Pure: takes the snippet root (snippets/bundle-cart.liquid) plus a store
  snapshot and hydrates the [data-cart-*] hooks. No state, no events, no
  store dependency — the calling view (<bundle-builder> or <cart-drawer>)
  owns click handling and passes bundleStore.snapshot in.

  Expected hooks inside `root` (the <section class="bundle-cart">):
    [data-cart-empty]                       empty-state message
    [data-cart-lines]                       <ul> — JS rebuilds <li>s here
    [data-cart-totals] > [data-subtotal] [data-price]
    [data-checkout]                         checkout button
  `root` also carries data-i18n-remove — the aria-label template for the
  per-line × buttons, with a literal {name} token JS substitutes.
*/

// Intl.NumberFormat is comparatively expensive to construct — cache per currency.
const _fmtCache = {};
function money(currency, minorUnits) {
  let fmt = _fmtCache[currency];
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency
      });
    } catch {
      fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    _fmtCache[currency] = fmt;
  }
  return fmt.format(minorUnits / 100);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildLine(line, currency, i18nRemove) {
  const li = el('li', 'bundle-cart-line');

  li.appendChild(el('span', 'bundle-cart-qty', line.qty));

  const meta = el('div', 'bundle-cart-meta');
  meta.appendChild(el('p', 'bundle-cart-name text-ui', line.title));
  if (line.size) meta.appendChild(el('p', 'bundle-cart-size', line.size));
  li.appendChild(meta);

  li.appendChild(el('span', 'bundle-cart-price', money(currency, line.price * line.qty)));

  const removeBtn = el('button', 'bundle-cart-remove');
  removeBtn.type = 'button';
  removeBtn.dataset.action = 'clear';
  removeBtn.dataset.variantId = line.id;
  removeBtn.setAttribute(
    'aria-label',
    (i18nRemove || 'Remove {name}').replace('{name}', line.title)
  );
  removeBtn.textContent = '×';
  li.appendChild(removeBtn);

  return li;
}

// Hydrates the [data-cart-*] hooks inside `root` from a store snapshot.
export function renderBundleCart(root, snapshot) {
  if (!root) return;

  const empty = root.querySelector('[data-cart-empty]');
  const linesEl = root.querySelector('[data-cart-lines]');
  const totalsEl = root.querySelector('[data-cart-totals]');
  const checkoutBtn = root.querySelector('[data-checkout]');
  const hasItems = snapshot.totalQty > 0;

  if (empty) empty.hidden = hasItems;
  if (linesEl) linesEl.hidden = !hasItems;
  if (totalsEl) totalsEl.hidden = !hasItems;
  if (checkoutBtn) checkoutBtn.hidden = !hasItems;

  if (linesEl) {
    linesEl.textContent = '';
    const i18nRemove = root.dataset.i18nRemove;
    for (const line of snapshot.lines) {
      linesEl.appendChild(buildLine(line, snapshot.currency, i18nRemove));
    }
  }

  if (totalsEl && hasItems) {
    const subtotalEl = totalsEl.querySelector('[data-subtotal]');
    if (subtotalEl) subtotalEl.textContent = money(snapshot.currency, snapshot.subtotal);

    const priceWrap = totalsEl.querySelector('[data-price]');
    if (priceWrap) {
      priceWrap.textContent = '';
      if (snapshot.discount > 0) {
        priceWrap.appendChild(
          el('span', 'bundle-cart-strike', money(snapshot.currency, snapshot.subtotal))
        );
        priceWrap.appendChild(el('span', '', money(snapshot.currency, snapshot.total)));
        priceWrap.appendChild(
          el('span', 'bundle-cart-saved', `−${Math.round(snapshot.tierPct * 100)}%`)
        );
      } else {
        priceWrap.appendChild(el('span', '', money(snapshot.currency, snapshot.total)));
      }
    }
  }
}
