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
| ~~`quick-add`~~ | removed | Product cards no longer have a quick-add button — users click through to the product page to add to cart. `assets/quick-add.js` deleted, related markup/CSS stripped from `product-card.liquid`. |
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
| `logo-frood` | `sections/hero.liquid` | Frood wordmark — inline SVG using `fill="currentColor"`; set `color` on the parent to recolor. Source SVG kept at `assets/icon.svg` for reference |

## Design Tokens (Quick Reference)

**Frood palette:**
- `--color-text` `#36262B` (warm dark burgundy)
- `--color-text-accent` `#979193` (muted warm grey)
- `--color-bg` `#FFFEF9` (warm off-white)
- `--color-bg-dark` `#DFDCD4` (warm beige/stone)
- `--color-accent` `#FFE74B` (bright yellow)
- `--color-accent-light` `#F7F0C1` (pale yellow)

**Semantic alias:** `--color-text-light` → `--color-text-accent` (kept so existing references keep working).

**Form input backgrounds** (brand-locked, same across all color schemes):
- `--color-input-bg` → `--color-bg-dark` (warm beige) — default state
- `--color-input-bg-hover` → `--color-accent-light` (pale yellow) — hover/focus state

These were previously derived per color scheme (text color @ 10% / 15% alpha) but are now brand-locked. Used by `.input`, `.checkbox`, `.textarea`, `.select`.

**Translucent overlays** (derived from `--color-text` via `color-mix`, so they adapt to color schemes):
- `--color-border` text @ 10% — borders, hairlines
- `--color-shadow-soft` text @ 5% — pressed-state shadows
- `--color-nav` `--color-bg-dark` @ 80% — nav backdrops
- `--color-overlay` text @ 10% — image scrims, modal backgrounds

**Spacing:** xxxs `4px`, xxs `8px`, xs `12px`, s `16px`, m `24px`, l `64px`, xl `128px`, xxl `192px`
(`--spacing-base` is an alias of `--spacing-s` — kept for ~99 legacy references.)

**Border radius:** `--rad-s: 2px`. Circles use `border-radius: 50%`, hard corners use `0` — don't tokenize those.

**Blur:** `--blur: 10px` — for `backdrop-filter: blur(var(--blur))` (frosted-glass effects).

**Transitions:** `--transition-fast: 0.2s ease`, `--transition-slow: 0.5s ease`

**Font:** **HW Left** (Trial license — must be replaced before launch). Weights: Regular 400, Medium 500. Single family for body and headings. `@font-face` lives in `layout/theme.liquid` and `layout/password.liquid`.

**Functional UI (not brand):** `--color-success` (= `--color-accent-light`), `--color-error-bg` (`#f8d7da`). Hardcoded `#dc2626` (error red) / `#16a34a` (success green) still appear in form-error/success inline styles — intentionally generic so users recognize them.

Authoritative values live in `assets/base.css` `:root` block.

## Frood Typography

Each style has both a **token group** (in `:root`) and a **utility class** (in `base.css` section 5). Apply the utility class directly in markup — the existing reset strips default `h1`/`h2` browser styles, so semantic tags don't auto-receive these.

| Class | Font | Weight | Size | Line height | Letter spacing | When to use |
|---|---|---|---|---|---|---|
| `.text-h1` | HW Left | 400 | 12px | 1.1em (110%) | 0.01em (1%) | H1 headings — the top-level heading on a page. **Always uppercase** (`text-transform: uppercase` baked in). Intentionally small — used as a tiny eyebrow/label, not as a visual page title. The `.button` (primary) inherits this style, so all primary button labels are also uppercase |
| `.text-h2` | HW Left | 500 | 36px | 1.1em (110%) | 0em (0%) | H2 headings — primary visible page heading (often the largest visible text on a section) |
| `.text-h3` | HW Left | 500 | 24px | 1.1em (110%) | 0em (0%) | H3 headings — sub-section headings within an H2 |
| `.text-body` | HW Left | 400 | 14px | 1.1em (110%) | 0em (0%) | Paragraph copy, product descriptions, article text — anywhere prose lives |
| `.text-ui` | HW Left | 500 | 14px | 1.2em (120%) | 0em (0%) | Interactive UI text — buttons, nav links, form labels, input placeholders, badges. Same size as body but medium weight + slightly more line-height for legibility in small interactive targets |

**Rules:**
- Always apply the utility class explicitly — e.g. `<h1 class="text-h1">…</h1>`. Never assume native `h1` inherits these styles.
- The semantic tag (`h1`, `h2`, etc.) is for *meaning and accessibility*; the class is for *visual style*. They're decoupled — a `<div class="text-h1">` is wrong (use the semantic tag); a `<h2 class="text-h1">` is fine if a visual H1 is needed inside an H2 page-section.
- Sizes, line-heights, and letter-spacings come from Figma. Line-height and letter-spacing percentages are stored as `em` units in CSS (1.1em = 110%; 0.01em = 1%).

The older abstract scale (`.text-mini`, `.text-base`, `.text-medium`, `.text-large`, `.text-xl`) is still defined in `base.css` for backward compatibility with existing snippets/sections. Prefer Frood semantic classes (`.text-h1`, etc.) for new code.

## Buttons

**Frood has exactly one button: `.button`.** There is no `.button.secondary`, no ghost button, no tertiary. Low-emphasis actions become **underlined inline links** (`.inline-link`) instead — visually quiet, semantically still clickable.

**`.button` (primary):**
- Background: `--color-accent` (yellow)
- Text: `--color-text` (dark burgundy)
- Typography: based on `.text-h1` (HW Left, 12px / 1.1em / 0.01em / uppercase) — but **font-weight is overridden to 500 (Medium)**. So button labels are heavier than a plain h1 in body copy.
- Padding: `var(--spacing-xxs) var(--spacing-xs) 7px` — **asymmetric vertically** (8px top, 12px sides, 7px bottom) for optical balance with the H1 type. The 7px is intentional and not a token.
- Border radius: `--rad-s` (2px)
- Hover: colors invert (`bg → --color-text`, `text → --color-accent`)
- States: `:disabled` and `.is-loading` (with rotating spinner) are preserved
- No box-shadow, no transform-bounce, no active state — clean color-invert is the only interaction

**Usage:**
```html
<button class="button">Add to cart</button>
<a href="/checkout" class="button">Checkout</a>
```

**For low-emphasis actions, use `.inline-link` instead:**
```html
<a href="/cart" class="inline-link">View cart</a>
<button class="inline-link">Update</button>
```
`.inline-link` is just underlined text — the underline color animates from `--color-text-light` to `--color-text` on hover. Works on both `<a>` and `<button>` (the base CSS reset strips default button styles).

**What NOT to do:**
- Don't add a "secondary button" variant — if a designer asks for one, push back or use `.inline-link`.
- Don't override `.button` colors per-section — the brand button is locked to yellow/dark to keep the system tight.
- Don't add new sizes (`.button-large`, `.button-small`) without explicit design direction. One size only.
- Don't use `--color-button-*` tokens in CSS — they're remnants of the Shopify scheme system kept only for checkout role mapping (defined in `theme.liquid`, not `:root`).

## Section Lockup

**Reusable text composition for section headers.** Used heavily across Frood — when a section has an eyebrow + heading + (optional CTA), wrap them in `<div class="section-lockup">` and the gaps + alignment come for free.

```html
<div class="section-lockup">
  <h1 class="text-h1">Our collection</h1>
  <h3 class="text-h3">Real food, made simple.</h3>
  <a class="button" href="/collections/all">Our range</a>
</div>
```

**Defined in:** `assets/base.css` §22.

**Rules baked in:**
- `flex-direction: column`, `align-items: flex-start`, `text-align: left` — text always sits on the left
- Default vertical gap between children: `--spacing-xxs` (8px) — applies between heading elements
- Gap before a `.button` child: `--spacing-s` (16px) — buttons get more breathing room
- All children have `margin: 0` reset, so default heading/paragraph margins don't fight the lockup

**When NOT to use:**
- If a section needs centered text → don't use lockup (or override `align-items: center; text-align: center;` in the section's local CSS, but this defeats the lockup's purpose)
- If a section's heading composition is one-off (e.g. heading + price + button + image) → write a bespoke layout

**Where it's used:**
- `sections/featured-collection.liquid` — section header

(Add new locations here as more sections adopt it.)

## Frood Homepage Sections

The homepage (`templates/index.json`) uses a small set of custom Frood sections. The starter's `hero-banner`, `hero-slideshow`, `text-section`, and `rich-text` sections were deleted — don't try to use them. The featured-collection starter section IS kept and themed via tokens.

### `hero.liquid` (Frood Hero)

Full-bleed image background with the Frood wordmark centered in `--color-accent` (yellow).

- **Dimensions:** width 100% (effectively full viewport), height 100vh
- **Background image:** currently hardcoded to `assets/dummy.jpg` via `asset_url`. Swap for a merchant-editable `image_picker` setting once the real hero image is finalized.
- **Logo:** rendered via `{% render 'logo-frood' %}` — inline SVG with `fill="currentColor"`. Sized to **45vw width**. Color is set via the `--color-accent` token on the parent `.hero-frood-logo` div.
- **No content other than the image + logo.** No heading, no button, no scroll cue. Brand-locked layout.

When the hero image needs to be merchant-editable, add an `image_picker` setting to the schema and replace the hardcoded `<img>` src.

### `featured-collection.liquid` (rebuilt)

Editorial product grid with stacked heading + CTA.

- **Padding:** `--spacing-m` (24px all sides)
- **Header** (centered, vertical stack): h1 eyebrow ("Our collection") → h3 heading ("Real food, made simple. Made for modern home cooks.") → primary `.button` ("Our range"). All three are schema-editable.
- **Product grid breakpoints:**
  - **Mobile (<600px):** merchant-selectable via schema `mobile_layout` — either `carousel` (horizontal scroll-snap, native CSS, each card 75% width so the next one peeks) or `grid` (single column stacked)
  - **Tablet (≥600px):** 2 columns
  - **Desktop (≥900px):** 4 columns
- **Carousel implementation:** native CSS `scroll-snap-type: x mandatory` + hidden scrollbars. No JS, no embla dependency. The previous `assets/featured-collection-carousel.js` and embla wiring were removed.
- **Product cards** still rendered via `{% render 'product-card' %}` — the snippet owner is unchanged.
- **Grid gap:** `--spacing-xs` (12px) — tighter than `--spacing-s` to let pack visuals breathe without dead space.

### Product cards with 3D pack renders

`snippets/product-card.liquid` looks at `product.media` for a 3D model (`media_type == 'model'`). If one's there, it renders with Shopify's `model_viewer_tag` filter (loads Google's `<model-viewer>` web component automatically — no manual script include needed). Falls back to `product.featured_image` for products without a GLB.

- **GLB upload location:** Shopify admin → Products → [product] → Media → "Add 3D model"
- **Shopify auto-generates a poster image** from the GLB and serves it before the model loads
- **Browser support:** `<model-viewer>` works in all modern browsers (Chrome/Safari/Firefox/Edge). Older browsers see the poster image only — graceful fallback
- **Performance note:** Each card with a 3D model is a WebGL context. Grids with many models can be GPU-heavy. If perf becomes an issue: use intersection observer to defer model loading for off-screen cards, or switch to "poster-only until hover" pattern

### Pack squeeze hover (per-vertex deformation)

**File:** `assets/pack-squeeze.js`. Loaded by `snippets/product-card.liquid`.

On hover over a product card, the GLB's mesh vertices deform — pinching inward at the vertical center to mimic a hand squeezing the pack. Reverts on un-hover. Pure JS, no GLB modifications required.

**How it works:**
1. Reaches into `<model-viewer>`'s internal Three.js scene via Symbol lookup (since model-viewer doesn't expose it publicly)
2. Caches each mesh's original `position` attribute as a `Float32Array`
3. On hover, lerps a `squeezeAmount` from 0→1; on un-hover lerps back to 0
4. Each frame, modifies `position.array` values per vertex using a Gaussian falloff centered on the vertical midpoint (max pinch at center, zero at top/bottom)
5. Sets `position.needsUpdate = true` so Three.js re-uploads the modified geometry to the GPU

**Tunable constants** at the top of `pack-squeeze.js`:
- `MAX_PINCH` (0.2) — how aggressive the pinch is (0.2 = 20% horizontal compression at center)
- `FALLOFF` (3) — how localized the pinch is to the center (higher = tighter pinch)
- `LERP` (0.18) — animation speed per frame

**Known limitations / fragility:**
- **Internal API dependency:** uses `Object.getOwnPropertySymbols(modelViewer)` to find the Three.js scene. If model-viewer updates and changes its internal Symbol layout, the script logs a warning to console and degrades gracefully (no squeeze, but cards still render normally).
- **CPU-bound:** loops every vertex every frame while animating. With many cards visible on lower-end devices, can drop frames. For perf wins later: gate by IntersectionObserver so only visible cards animate.
- **Procedural, not artistic:** the pinch is a math function, not a designer's crumple. For artistic deformation, the path is morph targets baked into the GLB in Blender (~15 min per pack) + ~25 lines of JS to drive `morphTargetInfluences`. See conversation history for context on why we chose JS deformation instead.
- **Disabled for `prefers-reduced-motion`:** entire script no-ops if the user has reduced motion preference.

**Grounded shadow:** Set via the `tune()` function in `product-card.liquid` (`shadowIntensity: 1`, `shadowSoftness: 0.5`) — uses model-viewer's built-in 3D ground shadow, which projects onto an invisible ground plane and rotates correctly with the model.

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
