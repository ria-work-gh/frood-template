# Section Reference

Detailed descriptions of the custom Frood sections. **The implemented `.liquid` files are
the source of truth** — read them before changing anything here. This file exists so
`CLAUDE.md` can stay lean; load it when working on a specific section.

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

**No hover effects on cards.** Considered grounded shadow + per-vertex squeeze deformation (see conversation history) but reverted — packs render as plain GLBs with the white-cast fix only (tone-mapping neutral, neutral env-image, no shadow). Easy to revisit if/when designed properly.

### `text-image-split.liquid` (Text + image split)

Two-column section: section-lockup on the left, 50/50 media column on the right with up to 2 media items (image or video each), each with optional captions.

- **Layout:** mobile + tablet (<900px) stack vertically — media under text, both full width, gap `--spacing-m`. Desktop (≥900px) becomes a 2-column grid (`1fr 1fr`).
- **Text column:** Uses the `.section-lockup` pattern — same eyebrow (h1) + heading (h3) + primary button as featured-collection. Padded with `--spacing-m` and vertically centered within its column.
- **Media column:** Edge-to-edge, no padding (extends to viewport edge for a dramatic feel). Holds 1–2 media blocks side-by-side with `--spacing-xs` gap. Each media item supports image OR video (video wins if both set), with an optional caption (text-body) `--spacing-xs` below the media.
- **Video behavior:** autoplays muted + looped + no controls. Common pattern for ambient hero video.
- **Schema:** 2-block limit on media. Presets include 2 media blocks by default.

The previous starter `image-text.liquid` was removed — it referenced the deleted `.button.secondary` class and had a different schema. Don't try to use it.

### `feature-card.liquid` (Feature Card)

Left-aligned card (max-width **1134px**) that promotes a piece of content from a metaobject + a richtext heading. Sits at the end of the homepage, before the footer.

- **Section padding:** `--spacing-m`
- **Card:** max-width 1134px, padding `--spacing-m`, border-radius `--rad-s`, **horizontally centered** in the section via `margin-inline: auto`
- **Two stacked containers inside the card:**
  1. **Metaobject entry** — title (text-h1) + image + description (text-body) + link (text-ui). Each field is conditionally rendered AND toggleable via section checkboxes.
  2. **Richtext heading** — displayed with `.text-h2` styling. Semantically a div (not an h2 tag) because richtext outputs `<p>` which is invalid inside h2.
- **Card colours:** merchant picks `card_bg` AND `card_color` from a `select` setting locked to Frood's 6 brand tokens (off-white, beige, dark burgundy, warm grey, yellow, pale yellow). CSS uses modifier classes like `.card-bg-bg-dark` and `.card-color-text`.

**Wired to the existing `news` metaobject** (defined in Shopify admin, Settings → Custom data → Metaobjects → News). Expected field handles:

- `date` (date)
- `location` (single line text)
- `title` (single line text)
- `news_image` (file reference, image)
- `news_description` (rich text)
- `news_link` (URL)

If field handles differ in the admin (Shopify lowercases + snake_cases field names → handles), update the references in `sections/feature-card.liquid` accordingly.

**Why type-locked:** Shopify's `metaobject` schema picker requires a fixed `metaobject_type` — no way to let the merchant pick the type at section level. To feature a different metaobject type (e.g. recipes, press mentions), either duplicate the section file per type, or change the `metaobject_type` value in this one's schema and update the field references.

## Bundle Builder Section

`sections/bundle-builder.liquid` — an interactive "build your box" section ported from a Svelte demo
(v2, pouch-first). The atomic unit is a single POUCH, not a 4-pack box. A WebGL stage renders a grid
of boxes, each holding up to 4 pouches in named slot anchors (`Slot0`–`Slot3` in `box.glb`); product
cards add/remove pouches; a progress bar tracks box-based discount tiers; a cart summary shows
projected totals.

**State is an ordered list:** `<bundle-builder>` holds `pouches: [variantId, …]` — one entry per
pouch, order-sensitive. Pouch index i fills box `floor(i / 4)`, slot `i % 4`; removing a pouch
shifts later pouches up a slot. Per-flavour counts are derived for the cart lines + steppers.

**Files:**

- `sections/bundle-builder.liquid` — markup, co-located stylesheet, schema (collection + box-based
  quantity settings + `tier` blocks)
- `assets/bundle-builder.js` — `<bundle-builder>` web component: owns the ordered pouch list,
  localStorage persistence (`frood.bundle.v2.<sectionId>`), derived totals/tier/discount/boxCount,
  DOM hydration, add-to-cart. Header comment documents the full expected-markup contract.
- `assets/bundle-stage.js` — `<bundle-stage>` web component: the three.js scene
- `assets/three.module.js` + `three.core.js` + `gltf-loader.js` (+ `buffer-geometry-utils.js`,
  `skeleton-utils.js`) — vendored three.js r184
- `assets/box.glb` (box mesh + 4 slot anchors) + `assets/pouch.glb` (one pouch mesh) + `box.webp` —
  vendored models + shared box texture

**Two-component split:** `<bundle-builder>` (state) and `<bundle-stage>` (3D) are standalone per
theme convention — they communicate only via the `bundle:updated` event on `document`, detail
`{ pouches: [variantId, …] }` (the ordered pouch list). `<bundle-stage>` derives its own box/slot
grid from the order. Both also independently read the `.bundle-products` JSON blob in the section
markup.

**Import map (new theme pattern):** three.js is ESM-only, so `layout/theme.liquid` has a `<script
type="importmap">` in `<head>` mapping the bare `three` specifier to the vendored `three.module.js`.
This is the **only** import map in the theme — it must stay high in `<head>` (before any module
script loads) and there can only be one. Unlike Embla (vendored as a UMD global), three.js is
consumed as real ES modules. `gltf-loader.js` had its two `three/addons/...` util imports patched to
relative `./` paths.

**Pouch textures come from a metafield:** each product needs a `custom.pouch_texture` metafield (File
reference to an image) for its 3D pouch. Products without one fall back to a flat colour — no error.

**Discount tiers are box-based blocks:** each `tier` block sets a minimum in BOXES (1–4) and a %.
The section converts box minimums to pouch thresholds (`× 4`) before handing them to the JS. Display
-only — the tier % shown is a projection; the real discount must be a Shopify automatic discount
configured in admin, kept in sync with the tier blocks. The bundle is **not** a separate cart — it is
a local draft (localStorage). "Add to cart" collapses the ordered pouch list to per-variant quantities
and POSTs them to `/cart/add.js` in one request (shared `_bundle` line-item property so the automatic
discount can target the group), clears the local draft, and dispatches `cart:item-added` on `document`
— the native `<cart-drawer>` picks that up to refresh and open. From there the pouches live in the
regular Shopify cart like any other line item.
