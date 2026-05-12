# Commerce Conventions

> Cart behavior, event protocol, add-to-cart patterns, and error handling.

---

## Cart Architecture

Both cart page (`/cart`) and cart drawer coexist, sharing UI snippets:

| Snippet | Used In | Purpose |
|---------|---------|---------|
| `cart-items.liquid` | main-cart + cart-drawer | Renders list of cart line items |
| `cart-item.liquid` | cart-items | Single line item (image, title, quantity, price) |
| `cart-totals.liquid` | main-cart + cart-drawer | Subtotal, discounts, checkout button |
| `cart-empty.liquid` | main-cart + cart-drawer | Empty cart state with continue shopping link |

Cart drawer: quick access, impulse-friendly. Cart page: accessible fallback, works without JS, bookmarkable.

---

## Cart Event Protocol

All cart state changes broadcast via custom events on `document`:

| Event | Fired When | `detail` payload |
|-------|-----------|-----------------|
| `cart:item-added` | After successful `/cart/add.js` | `{ item }` — the added line item |
| `cart:item-removed` | After item removed | `{ key }` — the line item key |
| `cart:updated` | After any cart change (quantity, remove) | `{ cart, sections }` — full cart object + pre-rendered section HTML |

### Event Flow

```
product-form → POST /cart/add.js → dispatches cart:item-added
  → cart-drawer listens → refresh() via section fetch + open()
  → cart-icon listens → updateCount()

cart-items → quantity change or remove → POST /cart/change.js
  → dispatches cart:updated (with bundled section HTML)
    → cart-drawer listens → refresh() using pre-rendered HTML
    → cart-icon listens → updateCount()
```

**Bundled section rendering:** Cart change requests include `sections` param so the response includes pre-rendered HTML. The `cart:updated` event carries this HTML in `detail.sections`, avoiding a second fetch. The `cart:item-added` event from the product form does NOT include section data, so cart-drawer falls back to a standalone section fetch.

---

## Add-to-Cart Pattern

1. User clicks "Add to cart" button
2. Button gets `is-loading` class + `disabled` attribute
3. `product-form` component POSTs to `/cart/add.js` via fetch
4. On success: dispatches `cart:item-added`, cart drawer opens
5. On failure: inline error message appears below button
6. Finally: loading state cleared

The `product-form` Web Component handles the form submission, prevents default, and manages the async flow. The form uses native `<form>` with `action="/cart/add"` as a no-JS fallback.

---

## Cart Drawer Refresh

The cart drawer uses Shopify's Section Rendering API to update its contents:

- On `cart:updated`: reads pre-rendered HTML from `event.detail.sections`
- On `cart:item-added`: fetches `/cart?section_id=cart-drawer` (standalone fetch)
- Swaps `innerHTML` of the drawer body with the new server-rendered content
- Dispatches `content:loaded` after swap for any re-initialization

---

## Quantity Selector

`<quantity-selector>` Web Component wrapping a native `<input type="number">`:

- +/- buttons flank the input
- Min: 1, Max: inventory quantity or 99
- Changes dispatch native `change` event (bubbles)
- Cart page/drawer listen for change events and POST to `/cart/change.js`
- Debounced to prevent rapid requests

---

## Cart Page (No-JS Fallback)

The cart page works without JavaScript via native form submission:

```liquid
<form action="/cart" method="post">
  {% render 'cart-items', cart: cart %}
  {% render 'cart-totals', cart: cart %}
</form>
```

Quantity inputs and remove buttons submit the form traditionally when JS is unavailable.

---

## Error Handling

**Principle:** Inline errors near the triggering action. No toast notifications.

### Pattern

```liquid
<product-form>
  <button type="submit">{{ 'products.product.add_to_cart' | t }}</button>
  <div data-error class="form-error" role="alert" hidden></div>
</product-form>
```

- Error element uses `role="alert"` for screen reader announcement
- `hidden` attribute toggled to show/hide
- Error text set via `textContent` (not `innerHTML`)
- Clear error before each new action attempt

### Common Errors

| Error | Message | Location |
|-------|---------|----------|
| Out of stock | "This item is sold out" | Below add-to-cart button |
| Quantity exceeds inventory | "Only X available" | Near quantity selector |
| Network failure | "Something went wrong. Please try again." | Below triggering button |
| Cart limit reached | "Cart limit reached" | Below add-to-cart button |

---

## Loading States

- Buttons: `is-loading` class (reduces opacity, disables pointer-events, shows spinner via `::after`)
- Cart drawer: `is-loading` class (reduces opacity, disables pointer-events)
- Preserve layout during loading — never collapse content

---

## Cart Icon

`<cart-icon>` Web Component in the header:

- Displays current `cart.item_count` in a `[data-count]` span
- Listens for `cart:updated` and `cart:item-added` to update count
- Updates `aria-label` on its link to reflect new count
- Click opens cart drawer (when `settings.cart_type == 'drawer'`) or navigates to `/cart`

---

## Checkout

- Checkout button links directly to `/checkout`
- `data-cart-type` attribute on `<body>` tells JS whether to use drawer or page redirect
- Set in `theme.liquid`: `<body data-cart-type="{{ settings.cart_type }}">`
