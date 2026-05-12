# Shopify Starter Theme

A minimal, opinionated Shopify Online Store 2.0 starter theme. No build tools, no frameworks — just Liquid, vanilla CSS, and Web Components.

Designed to be forked and reshaped into something entirely your own.

## What's Included

**Templates:** index, product, collection, cart, blog, article, page, search, 404, password, gift card

**Sections:** hero banner, hero slideshow, featured collection, collection list, image + text, rich text, FAQ accordion, announcement bar, product recommendations, header, footer, cart drawer, search drawer

**Commerce:** add-to-cart with Section Rendering API, cart drawer, quantity selectors, product variant selection, upsells, collection filtering

**Infrastructure:** color scheme system, SEO meta tags, JSON-LD structured data, skip links, focus traps, ARIA patterns

## Architecture

- **Liquid** — whitespace-stripped, `render` only (no `include`), all strings via `locales/en.default.json`
- **CSS** — vanilla with custom properties, mobile-first, simple semantic class names (no BEM, no utility classes)
- **JavaScript** — light DOM Web Components, ES modules, loaded per-section. No build step
- **Animations** — Shopify Motion library, respects `prefers-reduced-motion`

## Getting Started

### Use this template

Click **"Use this template"** on GitHub, or:

```bash
gh repo create my-store-theme --template YOUR_USERNAME/shopify-starter-theme --clone
cd my-store-theme
```

### Connect to your Shopify store

```bash
shopify theme dev --store your-store.myshopify.com
```

This starts a local dev server with hot reload. You'll need the [Shopify CLI](https://shopify.dev/docs/themes/tools/cli) installed.

### Push to your store

```bash
# Push as an unpublished theme
shopify theme push --unpublished

# Or push to a specific theme
shopify theme push --theme THEME_ID
```

## Customization Guide

### Color schemes

Three built-in schemes defined in **Theme Settings > Colors** in the Shopify admin:

| Scheme | Background | Text |
|--------|-----------|------|
| `scheme-1` | White | Black |
| `scheme-2` | Black | White |
| `scheme-3` | Light gray | Black |

Every section can pick a color scheme. Add more schemes in the admin — they just work.

### Design tokens

All spacing, typography, and color values live in `assets/base.css` under `:root`. Change these to reshape the entire theme:

```css
:root {
  --color-black: black;
  --color-white: white;
  --color-green: #34dc0e;

  --type-base-size: 14px;
  --type-large-size: 28px;

  --spacing-base: 16px;
  --spacing-m: 32px;
  --spacing-l: 64px;
}
```

### Font

The theme ships with Antarctica Beta (variable font). To swap it:

1. Add your font file(s) to `assets/`
2. Update the `@font-face` declaration in `layout/theme.liquid`
3. Update `font-family` in `assets/base.css`

### Adding a new section

1. Create `sections/your-section.liquid`
2. Add the HTML, Liquid, schema, and co-located styles (`{% stylesheet %}`)
3. It's automatically available in the theme editor under **Add section**

### Adding JavaScript behavior

1. Create `assets/your-component.js` with a Web Component class
2. Load it in the section: `<script type="module" src="{{ 'your-component.js' | asset_url }}"></script>`
3. Use `connectedCallback`/`disconnectedCallback` for setup/teardown

## File Structure

```
assets/           CSS, JS, fonts (flat — no subdirectories)
config/           settings_schema.json, settings_data.json
layout/           theme.liquid, password.liquid
locales/          en.default.json (all user-facing strings)
sections/         Section Liquid files + section group JSON
snippets/         Reusable Liquid partials
templates/        JSON templates (+ gift_card.liquid)
```

## AI-Assisted Development

This theme includes a `.claude/` directory with detailed conventions for CSS, JS, Liquid, commerce flows, and accessibility. If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), these conventions are automatically loaded — giving the AI full context on the theme's patterns and decisions.

## License

MIT
