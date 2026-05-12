# Shopify Starter Theme

Shopify Online Store 2.0 theme. Vanilla CSS, Web Components (light DOM), ES modules. No build step — Shopify CLI only.

## Repo Layout

```
assets/          CSS, JS, fonts (flat structure)
config/          settings_schema.json, settings_data.json
layout/          theme.liquid, password.liquid
locales/         en.default.json
sections/        Section files + group JSON configs
snippets/        Reusable partials
templates/       JSON templates + gift_card.liquid
.claude/
  CLAUDE.md                      (this file — always loaded)
  conventions/
    architecture.md              CSS, JS, Liquid, animation, layout, i18n
    commerce.md                  Cart events, flows, error handling
    accessibility.md             WCAG, keyboard, ARIA, focus
    decisions.md                 Rationale for architectural choices
```

## Before Building Anything

1. **Read the actual code** — the implemented section/template/snippet files are the source of truth
2. Read `conventions/architecture.md` for CSS, JS, and Liquid patterns
3. Read `conventions/commerce.md` for cart event protocol and add-to-cart flows
4. Read `conventions/accessibility.md` for WCAG requirements and ARIA patterns
5. Read `conventions/decisions.md` when code seems unusual — it explains the rationale

## Critical Code Patterns

### Liquid

**Always strip whitespace:**
```liquid
{%- if product.available -%}
  <button>{{ 'products.product.add_to_cart' | t }}</button>
{%- endif -%}
```

**Inline settings directly** (don't declare variables at top):
```liquid
<h2>{{ section.settings.heading }}</h2>
```

Variables only for complex filter chains, repeated calculations, or multi-use conditionals.

**Always `render`, never `include`:**
```liquid
{% render 'product-card', product: product, lazy_load: true %}
```

**All user-facing text via translations:**
```liquid
{{ 'products.product.add_to_cart' | t }}
```
Keys defined in `locales/en.default.json`.

**Blocks must include `shopify_attributes`:**
```liquid
{%- for block in section.blocks -%}
  <div {{ block.shopify_attributes }}>
    {{ block.settings.title }}
  </div>
{%- endfor -%}
```

**Use Liquid comments, not HTML:**
```liquid
{%- comment -%} This won't render to browser {%- endcomment -%}
```

### Color Schemes

Shopify native `color_scheme_group` system. Every section with color support:

Schema:
```json
{ "type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1" }
```

HTML — always use the `color-` prefix:
```liquid
<section class="section-name color-{{ section.settings.color_scheme }}">
```

Three default schemes: scheme-1 (white/black), scheme-2 (black/white), scheme-3 (light gray/black).

### Section Styles

Co-located in section files using `{% stylesheet %}` (not `<style>`):
```liquid
{% stylesheet %}
  .hero-banner {
    min-height: 60vh;
    padding: var(--spacing-xl) var(--spacing-base);
  }
  @media (min-width: 600px) {
    .hero-banner { min-height: 80vh; }
  }
{% endstylesheet %}
```

### CSS

- Vanilla CSS with custom properties, mobile-first
- Simple semantic class names — no BEM, no utility classes
- Modifier classes: `.product-card.sold-out` (not `product-card--sold-out`)
- Breakpoints: 600px (tablet), 900px (desktop), 1200px (large), 1500px (XL)
- Z-index: header `9`, footer `10`, mobile menu `99`, lightbox `999`

### Web Components (JavaScript)

Light DOM only, ES modules, one file per component:
```js
class CartDrawer extends HTMLElement {
  connectedCallback() { this.setupEventListeners(); }
  disconnectedCallback() { this.cleanup(); }

  open() {
    this.classList.add('is-open');
    this.setAttribute('aria-hidden', 'false');
    this.dispatchEvent(new CustomEvent('drawer:opened', { bubbles: true }));
  }
}
customElements.define('cart-drawer', CartDrawer);
```

Loaded per-section:
```liquid
<script type="module" src="{{ 'cart-drawer.js' | asset_url }}"></script>
```

**State:** CSS classes (`is-open`, `is-loading`) — not data attributes.
**Events:** `namespace:action` format (`cart:updated`, `drawer:opened`).
**Errors:** Inline near the action, `role="alert"` — no toast notifications.

### Cart Event Flow

```
product-form → dispatches cart:item-added
  → cart-drawer listens → refresh() + open()
  → cart-icon listens → updateCount()

cart-items → quantity change or remove → POST /cart/change.js
  → dispatches cart:updated
    → cart-drawer listens → refresh()
    → cart-icon listens → updateCount()
```

### Images

Always include dimensions to prevent layout shift:
```liquid
{{ image | image_url: width: 600 | image_tag:
    loading: 'lazy',
    width: image.width,
    height: image.height
}}
```

### Section Schema Template

```liquid
{% schema %}
{
  "name": "Section Name",
  "tag": "section",
  "class": "section-name",
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1" }
  ],
  "blocks": [],
  "presets": [{ "name": "Section Name" }]
}
{% endschema %}
```

## Snippet Ownership

Each snippet is owned by ONE section/area. When modifying a snippet, read its owning code:

| Snippet | Owner | Used By |
|---------|-------|---------|
| `product-card` | `sections/main-collection.liquid` | featured-collection, collection, search |
| `product-price` | `sections/main-product.liquid` | product-card, main-product |
| `product-variant-selector` | `sections/main-product.liquid` | main-product |
| `product-buy-buttons` | `sections/main-product.liquid` | main-product |
| `product-gallery` | `sections/main-product.liquid` | main-product |
| `product-upsells` | `sections/main-product.liquid` | main-product, cart-drawer |
| `quantity-selector` | `assets/quantity-selector.js` | main-product, cart-item |
| `cart-items` | `sections/main-cart.liquid` | main-cart, cart-drawer |
| `cart-item` | `sections/main-cart.liquid` | cart-items |
| `cart-totals` | `sections/main-cart.liquid` | main-cart, cart-drawer |
| `cart-empty` | `sections/main-cart.liquid` | main-cart, cart-drawer |
| `collection-filters` | `sections/main-collection.liquid` | main-collection |
| `pagination` | `sections/main-collection.liquid` | collection, blog, search |
| `article-card` | `sections/main-blog.liquid` | main-blog, search |
| `share-buttons` | `sections/main-article.liquid` | main-article |
| `newsletter-form` | `sections/footer.liquid` | footer, main-password |
| `meta-tags` | `layout/theme.liquid` | theme.liquid |
| `json-ld-organization` | `layout/theme.liquid` | theme.liquid |
| `json-ld-product` | `sections/main-product.liquid` | main-product |
| `icon-*` | `sections/header.liquid` | header, cart-drawer, mobile-menu |

## Design Tokens (Quick Reference)

**Palette:** `--color-black: black`, `--color-white: white`, `--color-green: #34DC0E`

**Spacing:** xxs `2px`, xs `4px`, s `8px`, base `16px`, m `32px`, l `64px`, xl `128px`, xxl `256px`

**Type scale:** mini `12/14`, base `14/16`, medium `18/20`, large `28/30`, xl `32/34` (responsive bumps at 900px and 1600px)

**Transitions:** fast `0.2s ease`, slow `0.5s ease`

**Font:** Antarctica Beta variable font — single family for body and headings

Authoritative values live in `assets/base.css` `:root` block.

## What NOT to Do

- No Shadow DOM — light DOM only
- No BEM notation — use `.product-card-title` not `.product-card__title`
- No utility classes — no `.mt-4`, `.flex`, `.text-center`
- No `include` tag — always `render`
- No HTML comments — use `{%- comment -%}`
- No toast notifications — errors inline near the action
- No build tools — Shopify CLI only
- No per-section padding/margin merchant controls
- No `@font-face` in base.css — font faces go in theme.liquid via Liquid `asset_url`
- No hardcoded user-facing strings — always `{{ 'key' | t }}`
- No bare `{{ section.settings.color_scheme }}` — always prefix with `color-`

## Accessibility Checklist

- Skip link in theme.liquid targeting `#main-content`
- All `<nav>` elements have `aria-label`
- Cart drawer: `role="dialog"`, `aria-modal="true"`, focus trap
- Mobile menu: focus trap, ARIA, Escape to close, return focus to trigger
- Icon-only buttons: `aria-label` on button, `aria-hidden="true" focusable="false"` on SVG
- Form inputs: associated `<label>` elements
- Error messages: `role="alert"`
- `prefers-reduced-motion`: all animations/transitions disabled
- Custom `:focus-visible` outline with `2px solid currentColor`

## For Deeper Context

| Topic | Read | Contains |
|-------|------|----------|
| CSS patterns, JS components, Liquid conventions, animation, layout, i18n | `conventions/architecture.md` | Class naming, breakpoints, color schemes, Web Component pattern, event naming, fetch patterns, Section Rendering API, inline settings, whitespace control, Motion library, theme.liquid structure |
| Cart behavior, add-to-cart, event protocol | `conventions/commerce.md` | Cart event flow, bundled section rendering, quantity selector, error handling, loading states, no-JS fallback |
| WCAG, keyboard, ARIA, focus management | `conventions/accessibility.md` | Focus trapping pattern, ARIA attributes, heading hierarchy, form accessibility, color contrast, reduced motion, testing checklist |
| Why we chose X over Y | `conventions/decisions.md` | Rationale for light DOM, no BEM, vanilla CSS, Embla, no Shadow DOM, no build tools, etc. |
