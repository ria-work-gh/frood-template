# Architectural Decisions

> Rationale for key technical choices. Reference this when code seems unusual or when reconsidering approaches.

---

## JavaScript

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Component pattern** | Web Components | Native browser API, no framework dependency, works with any templating |
| **DOM approach** | Light DOM only | Easier to style with global CSS, better accessibility defaults |
| **Module strategy** | ES modules | Modern browser support sufficient, native import/export, automatic defer |
| **Base class** | None (standalone) | Simpler mental model, no inheritance complexity |

---

## CSS

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Preprocessor** | None (vanilla CSS) | No build step required, custom properties handle most needs |
| **Naming convention** | Simple semantic names | Readable, no BEM complexity, easy to understand |
| **Utility classes** | Minimal | Avoid Tailwind-style utilities; keep CSS in context |
| **Section styles** | Co-located in section files | Styles live with their markup, easy to find |
| **Color management** | Shopify native `color_scheme_group` | CSS generated in `theme.liquid` from merchant-defined schemes; applied via `color-{{ section.settings.color_scheme }}` |
| **Merchant controls** | Minimal (colors only) | Consistency across projects; devs control typography/spacing |

---

## Animation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Default approach** | CSS transitions only | No dependencies, no JS needed for standard animations |
| **Micro-interactions** | CSS transitions | Simpler, immediate feedback on hover/active states |
| **Drawer/modal transitions** | CSS only | CSS sufficient for show/hide |
| **Scroll animations** | Motion (optional, add when needed) | Only if parallax/scrubbing/timelines required; ~18kb vs ~60kb for GSAP |
| **Motion loading** | ES module in theme.liquid | One load, available to all sections; ESM-native |
| **Motion code location** | Inline in section files | Co-located with markup/styles; see full section behavior in one place |
| **Motion vs Web Components** | Separate concerns | Web Components = interactive UI; section scripts = visual polish |
| **Timing** | 0.2s micro, 0.3s drawers | Fast, snappy feel without being jarring |

---

## Commerce

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Cart UI** | Drawer + Page | Quick access via drawer; page as fallback and for accessibility |
| **Add to cart** | Opens drawer automatically | Immediate feedback, encourages checkout |
| **Error display** | Inline messages | Contextual, near the action; no toast notifications |
| **Variant strategy** | Native Shopify variants | Size + Color as variant options; well within 100-variant limit |
| **Sold out variants** | Dimmed but selectable | Users can still view details, sign up for notifications |
| **Quick view** | Not included | Keep simple; direct to PDP provides better experience |
| **Card content** | Minimal (image, title, price) | Clean look; projects add vendor/swatches as needed |

---

## Product Page

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Gallery (mobile)** | Horizontal carousel | Standard mobile pattern, thumb-friendly |
| **Gallery (desktop)** | Thumbnail navigation | Easy to browse multiple images |
| **Video support** | Shopify-hosted only | Simpler implementation; no YouTube/Vimeo complexity |
| **Variant images** | Metafield-based | Dev-managed, clean data model, per-variant galleries |
| **Gallery on variant change** | Filter to variant images | Show only relevant images, less clutter |

---

## Collection Page

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Filtering** | Native Shopify + basic UI | Structure ready; projects enhance UI as needed |
| **Pagination** | Traditional (numbered) | SEO-friendly, simple, accessible |
| **Infinite scroll** | Not included | Accessibility concerns, harder to bookmark |

---

## Header & Navigation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Header position** | Sticky (always visible) | Easy cart/nav access; scroll behavior per project |
| **Mobile menu** | Slides from left | Standard pattern; right is reserved for cart |
| **Cart drawer** | Slides from right | Convention; keeps cart feeling separate from nav |
| **Search** | Link to search page | No predictive search in base; projects add as needed |
| **Social icons** | Not included | Projects add as needed; keeps base minimal |

---

## Platform & Tooling

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Platform** | Online Store 2.0 | JSON templates, sections everywhere, modern standard |
| **Customer accounts** | New Customer Accounts | Shopify-hosted, minimal theme code needed |
| **Build tools** | Shopify CLI only | No webpack/vite complexity; simpler onboarding |
| **Carousel library** | Embla Carousel | Lightweight, accessible, touch-friendly |

---

## Accessibility

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Standard** | WCAG 2.1 AA | Legal baseline + good practice |
| **Focus outlines** | Custom styled | Better visual design than browser defaults |
| **Reduced motion** | Full support | Respect user preferences; CSS + JS checks |
| **Skip link** | Included | Essential for keyboard users |
| **Focus trapping** | In all modals/drawers | Required for accessible overlay patterns |

---

## Data Model

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Metafield namespace** | `custom` | Consistent, distinguishes from app metafields |
| **Product images** | Shopify product media | Standard media per product |

---

## Blog & Content

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Blog comments** | Skip for base theme | Low usage on most stores; add via app if needed |
| **Share mechanism** | Web Share API + clipboard fallback | Native mobile share sheet; clean desktop fallback with no third-party scripts |
| **Breadcrumbs** | Skip for now | Future enhancement; not essential for base theme navigation |

---

## Templates

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Gift card layout** | `layout/theme.liquid` | Gift cards are a storefront page; header/footer provide navigation context |
| **Password layout** | Separate `layout/password.liquid` | Pre-launch page shouldn't show store navigation or cart |

---

## Internationalization

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Default language** | English (`en.default.json`) | Shopify convention; English as fallback. Add secondary locales as needed |
| **Predictive search** | Not in base | Future extension point; link to /search page sufficient for launch |

---

## Revisiting Decisions

When reconsidering a decision:

1. **Check this document** for original rationale
2. **Consider the trade-offs** — what problem did the original choice solve?
3. **Document the new decision** if you change it, including why

Decisions aren't permanent, but changes should be deliberate.
