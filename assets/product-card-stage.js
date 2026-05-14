import * as THREE from 'three';
import { GLTFLoader } from './gltf-loader.js';

/*
  <product-card-model> — a slow auto-rotating three.js render of a product's
  GLB, used on product cards in place of Shopify's <model-viewer>.

  ----------------------------------------------------------------------------
  Markup contract — emitted by snippets/product-card.liquid:

    <product-card-model class="product-card-model" data-model="<glb url>">
      <canvas class="product-card-model-canvas"></canvas>
      <img class="product-card-model-fallback" src="<poster>" ...>
    </product-card-model>

  - data-model  (required) absolute URL to a .glb file (Shopify model source).
  - <canvas>    (required) the visible 3D surface. Does NOT own a WebGL context.
  - <img class="product-card-model-fallback">  (optional but expected) a static
    poster. It starts VISIBLE and is hidden once the live render's first frame
    lands. See "Fallbacks" below.

  ----------------------------------------------------------------------------
  Shared-renderer architecture.

  Every <product-card-model> on the page is drawn by ONE module-level
  THREE.WebGLRenderer (the `stage` singleton). A collection grid can hold a
  dozen-plus cards; one WebGL context per card would blow past the browser's
  ~16-context cap and waste GPU. Instead:

    - The shared renderer has its own offscreen canvas, sized to the LARGEST
      registered card's pixel box. Each frame, for every visible card, it
      renders that card's scene into a setViewport/setScissor sub-rect, then
      copies the rect into the card's own 2D <canvas> via ctx.drawImage().
    - The per-card <canvas> is a plain in-flow block element — no fixed
      overlay, no z-index interplay with sections/badges/header, works inside
      the mobile carousel.
    - Each card keeps its own THREE.Scene (model + lights + camera). Scenes are
      cheap; the renderer (the expensive context) is the shared resource.
    - GLBs are cached by URL (`modelCache`) so repeated products load once.

  Gating + motion (keeps the RAF loop cheap):
    - An IntersectionObserver marks cards on/off screen. An off-screen card is
      fully frozen: the frame loop `continue`s past it before advancing its
      rotation AND before rendering — no GPU work, no rotation progress.
    - A ResizeObserver caches each card's CSS box, so the frame loop never
      calls getBoundingClientRect() (no per-frame layout reads).
    - Visible cards render at native rAF rate; the loop is skipped entirely
      while document.hidden (tab in background).
    - Auto-rotate spins the model around Y. Hovering the card pauses the spin
      and eases the model back to front-on (nearest 0-mod-2π); leaving the card
      resumes the spin. Under prefers-reduced-motion the model is framed and
      rendered once (on load / resize / re-entry) with no rotation or snap —
      driven by a per-entry `dirty` flag.
    - The RAF loop + renderer are created lazily on the first connected card
      and disposed when the last card disconnects.

  ----------------------------------------------------------------------------
  Fallbacks — the card always shows *something*.

  The static <img> poster is visible by default and only hidden after a
  successful first frame. It is (re-)revealed on every failure path:
    - WebGL unavailable           → `stage.failed`, card never registers.
    - GLB load failure            → load rejects (network, 404, or a
                                    Draco/meshopt-compressed GLB the vendored
                                    plain GLTFLoader can't decode).
    - WebGL context loss          → GPU reset / driver crash / context cap.
    - missing <canvas> or no 2D context → card never registers.
    - total JS failure (e.g. a broken `three` import map) → this module never
      runs, so the poster simply stays visible. Graceful by construction.

  Lighting/material intent: mirror the old model-viewer "neutral" tuning the
  card snippet used to force (toneMapping neutral, exposure 1, no env-map
  reflections). GLTFLoader already handles embedded-texture colour space and
  flipY, so no manual texture fixing is needed here.
*/

// Auto-rotate speed, radians/sec (~23°/s — close to model-viewer's default).
const ROTATION_SPEED = 0.4;
// Per-frame ease factor for the hover snap-to-front (higher = snappier).
const SNAP_LERP = 0.2;
// Camera framing: higher = more pull-back / breathing room around the model.
const FRAME_MARGIN = 1.35;
// Camera elevation above the horizon (3/4 view).
const ELEVATION = 0.22;
const FOV = 30;
const TWO_PI = Math.PI * 2;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One loader, shared across every card.
const gltfLoader = new GLTFLoader();

// url -> Promise<THREE.Group> (a freshly-loaded scene root; consumers clone it).
const modelCache = new Map();
function loadModel(url) {
  let p = modelCache.get(url);
  if (!p) {
    p = gltfLoader
      .loadAsync(url)
      .then((gltf) => gltf.scene)
      .catch((err) => {
        // Drop the cache entry so a later card can retry, then rethrow so the
        // requesting card falls back to its poster.
        console.error('[product-card-stage] model load failed:', url, err);
        modelCache.delete(url);
        throw err;
      });
    modelCache.set(url, p);
  }
  return p;
}

// Disposes every GPU resource under a scene root (geometries, materials, and
// the textures those materials reference). Used on cached GLB templates at
// teardown — never on a per-card clone, since clones share these by reference.
function disposeObject3D(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key in m) {
        const value = m[key];
        if (value && value.isTexture) value.dispose();
      }
      m.dispose();
    }
  });
}

// Builds a self-contained scene for one card: framed camera + lights + a
// recentred clone of the GLB wrapped in a group we spin.
function buildScene(template) {
  const scene = new THREE.Scene();

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0xb6a99a, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 8, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55);
  fill.position.set(-5, 3, -2);
  scene.add(fill);

  // `spin` is what we rotate; the clone inside carries the recentre offset so
  // the model spins about its own centre, not the GLB origin.
  const spin = new THREE.Group();
  const model = template.clone(true);
  const bbox = new THREE.Box3().setFromObject(model);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  model.position.sub(center);
  spin.add(model);
  scene.add(spin);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = (maxDim / 2 / Math.tan((FOV * Math.PI) / 360)) * FRAME_MARGIN;
  camera.position.set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
  camera.lookAt(0, 0, 0);

  return { scene, camera, spin };
}

// (Re-)reveals a card's static poster image. Used on every failure path.
function showFallback(entry) {
  if (entry.fallback) entry.fallback.hidden = false;
  entry.posterHidden = false;
}

// The one shared renderer + RAF loop. Created lazily on the first card.
const stage = {
  renderer: null,
  // Set once WebGL is unavailable or the context is lost — re-mounting cards
  // then go straight to their poster instead of retrying a doomed renderer.
  failed: false,
  entries: new Set(),
  raf: 0,
  lastDraw: 0,
  lastDpr: 1,
  observer: null,
  resizeObserver: null,
  // Shared renderer is sized to the largest registered card (CSS px).
  maxW: 1,
  maxH: 1,

  ensure() {
    if (this.renderer || this.failed) return;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error('[product-card-stage] WebGL unavailable — using poster images:', err);
      this.failed = true;
      return;
    }
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setScissorTest(true);

    // Context loss (GPU reset, driver crash, hitting the context cap): stop the
    // loop and fall every card back to its poster. preventDefault() is required
    // or the browser won't even consider restoring; we don't auto-restore
    // (rebuilding every scene) — a page reload is the recovery path.
    this._onContextLost = (e) => {
      e.preventDefault();
      console.warn('[product-card-stage] WebGL context lost — falling back to poster images');
      this.handleContextLost();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);

    this.observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          const entry = r.target._cardEntry;
          if (!entry) continue;
          entry.visible = r.isIntersecting;
          if (r.isIntersecting) entry.dirty = true;
        }
      },
      { rootMargin: '100px' }
    );

    // Caches each card's CSS box so the frame loop never reads layout.
    this.resizeObserver = new ResizeObserver((records) => {
      for (const r of records) {
        const entry = r.target._cardEntry;
        if (!entry) continue;
        entry.cssW = r.contentRect.width;
        entry.cssH = r.contentRect.height;
        entry.dirty = true;
      }
    });

    // Returning from a background tab: reset the clock so rotation doesn't jump.
    this._onVisibility = () => {
      if (!document.hidden) this.lastDraw = performance.now();
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    this.resizeRenderer();
    this.lastDraw = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  },

  resizeRenderer() {
    if (!this.renderer) return;
    this.lastDpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.lastDpr);
    this.renderer.setSize(this.maxW, this.maxH, false);
  },

  add(entry) {
    this.ensure();
    if (this.failed) {
      showFallback(entry);
      return;
    }
    this.entries.add(entry);
    this.observer.observe(entry.el);
    this.resizeObserver.observe(entry.el);
  },

  remove(entry) {
    this.entries.delete(entry);
    if (this.observer) this.observer.unobserve(entry.el);
    if (this.resizeObserver) this.resizeObserver.unobserve(entry.el);
    if (this.entries.size === 0) this.teardown();
  },

  handleContextLost() {
    for (const entry of this.entries) showFallback(entry);
    this.failed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    // Entries + observers are left registered but inert (raf is stopped); they
    // get cleaned up normally as cards disconnect → remove() → teardown().
  },

  teardown() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.observer) this.observer.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.observer = null;
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
      this.renderer.dispose();
    }
    this.renderer = null;
    this.maxW = 1;
    this.maxH = 1;
    // `failed` is intentionally NOT reset: if WebGL/the context died, a later
    // re-mount should keep using posters rather than re-crash. A full page
    // reload clears module state and starts fresh.

    // The cached GLB templates own every shared geometry/material/texture.
    // Nothing references them once the last card is gone — dispose + clear so
    // a later re-mount starts clean (re-fetches the GLBs).
    for (const promise of modelCache.values()) {
      promise.then(disposeObject3D).catch(() => {});
    }
    modelCache.clear();
  },

  frame: function frame(now) {
    stage.raf = requestAnimationFrame(stage.frame);
    if (document.hidden) return;

    const dt = Math.min((now - stage.lastDraw) / 1000, 0.1);
    stage.lastDraw = now;

    const renderer = stage.renderer;
    const dpr = window.devicePixelRatio || 1;
    // Browser zoom / moving the window to another monitor changes devicePixelRatio.
    if (dpr !== stage.lastDpr) stage.resizeRenderer();

    for (const entry of stage.entries) {
      if (!entry.scene || !entry.visible) continue;

      const w = Math.round(entry.cssW);
      const h = Math.round(entry.cssH);
      if (w < 1 || h < 1) continue; // ResizeObserver hasn't reported a box yet

      try {
        // Keep the card canvas backing-store in sync with its CSS box.
        const pw = w * dpr;
        const ph = h * dpr;
        if (entry.canvas.width !== pw || entry.canvas.height !== ph) {
          entry.canvas.width = pw;
          entry.canvas.height = ph;
          entry.dirty = true;
        }

        // Grow the shared renderer if this card is bigger than any seen so far.
        if (w > stage.maxW || h > stage.maxH) {
          stage.maxW = Math.max(stage.maxW, w);
          stage.maxH = Math.max(stage.maxH, h);
          stage.resizeRenderer();
          entry.dirty = true;
        }

        if (!reducedMotion) {
          if (entry.hovered) {
            // Ease to the nearest front-on facing (0 mod 2π) — short way round.
            const target = Math.round(entry.spin.rotation.y / TWO_PI) * TWO_PI;
            entry.spin.rotation.y += (target - entry.spin.rotation.y) * SNAP_LERP;
          } else {
            entry.spin.rotation.y += ROTATION_SPEED * dt;
          }
        } else if (!entry.dirty) {
          continue;
        }
        entry.dirty = false;

        if (entry.aspect !== w / h) {
          entry.aspect = w / h;
          entry.camera.aspect = entry.aspect;
          entry.camera.updateProjectionMatrix();
        }

        // Render into a top-aligned sub-rect of the shared canvas. WebGL's
        // viewport origin is bottom-left, so y = maxH - h puts it at the top —
        // which then maps to (0, 0) in drawImage's top-left image space.
        renderer.setViewport(0, stage.maxH - h, w, h);
        renderer.setScissor(0, stage.maxH - h, w, h);
        renderer.render(entry.scene, entry.camera);

        entry.ctx.clearRect(0, 0, pw, ph);
        entry.ctx.drawImage(renderer.domElement, 0, 0, pw, ph, 0, 0, pw, ph);

        // First successful frame — drop the poster so the live render shows.
        if (!entry.posterHidden && entry.fallback) {
          entry.fallback.hidden = true;
          entry.posterHidden = true;
        }
      } catch (err) {
        // One bad card must not break the batch or spam the console every
        // frame — log once, show its poster, and drop it from the loop.
        console.error('[product-card-stage] render error — using poster for this card:', err);
        showFallback(entry);
        stage.entries.delete(entry);
      }
    }
  }
};

class ProductCardModel extends HTMLElement {
  connectedCallback() {
    const url = this.dataset.model;
    const canvas = this.querySelector('canvas');
    const fallback = this.querySelector('.product-card-model-fallback');

    // Without a canvas or a 2D context there's nothing to draw into — leave the
    // poster (already visible) and bail. A missing data-model is the snippet's
    // job to avoid, but guard anyway.
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!url || !ctx) {
      if (!canvas) console.error('[product-card-stage] <product-card-model> has no <canvas>');
      else if (!ctx) console.error('[product-card-stage] could not get a 2D context');
      if (fallback) fallback.hidden = false;
      return;
    }

    const entry = {
      el: this,
      canvas,
      ctx,
      fallback,
      scene: null,
      camera: null,
      spin: null,
      cssW: 0,
      cssH: 0,
      aspect: 0,
      visible: false,
      hovered: false,
      dirty: true,
      posterHidden: false
    };
    // Stored on the element so the shared Intersection/Resize observers (which
    // only have the DOM node) can reach the entry.
    this._cardEntry = entry;
    stage.add(entry);

    // Hovering anywhere on the card pauses the spin and snaps to front-on.
    // pointerenter/leave don't bubble, so child elements don't re-fire them.
    this._hoverTarget = this.closest('.product-card') || this;
    this._onEnter = () => { entry.hovered = true; };
    this._onLeave = () => { entry.hovered = false; };
    this._hoverTarget.addEventListener('pointerenter', this._onEnter);
    this._hoverTarget.addEventListener('pointerleave', this._onLeave);

    loadModel(url)
      .then((template) => {
        // Element may have disconnected while the GLB was loading.
        if (this._cardEntry !== entry) return;
        const built = buildScene(template);
        entry.scene = built.scene;
        entry.camera = built.camera;
        entry.spin = built.spin;
        entry.dirty = true;
      })
      .catch(() => {
        // loadModel already logged. Keep the poster visible for this card.
        if (this._cardEntry === entry) showFallback(entry);
      });
  }

  disconnectedCallback() {
    const entry = this._cardEntry;
    if (!entry) return;
    this._cardEntry = null;

    if (this._hoverTarget) {
      this._hoverTarget.removeEventListener('pointerenter', this._onEnter);
      this._hoverTarget.removeEventListener('pointerleave', this._onLeave);
      this._hoverTarget = null;
    }

    stage.remove(entry);
    // No GPU disposal here: this card's scene holds only clones, which share
    // geometry/materials/textures with the cached GLB template by reference.
    // Those are disposed once, on stage.teardown(). The scene's own JS objects
    // (Scene, lights, groups) are released by GC when `entry` is dropped.
  }
}

if (!customElements.get('product-card-model')) {
  customElements.define('product-card-model', ProductCardModel);
}
