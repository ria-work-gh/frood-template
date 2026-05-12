/**
 * Pack Squeeze — per-vertex deformation for <model-viewer> on product card hover.
 *
 * Approach: reach into model-viewer's internal Three.js Scene via Symbol lookup,
 * cache each mesh's original vertex positions, then on hover/un-hover lerp a
 * "squeezeAmount" 0↔1 and modify position attributes each frame, pinching vertices
 * toward the model's vertical center on the X and Z axes.
 *
 * Caveats (see CLAUDE.md → "Pack squeeze hover"):
 *   - Accessing model-viewer's internals via Symbol is unofficial API. If model-viewer
 *     updates and changes its internal Symbol layout, this script needs adjustment.
 *   - CPU-bound. Each visible card runs a per-vertex loop while animating. For grids
 *     with many cards on lower-end devices, this can drop frames.
 *   - Deformation is procedural (Gaussian falloff). Not an artist-designed crumple.
 *   - Local-space deformation: as the model auto-rotates around Y, the pinched middle
 *     stays aligned to local vertical, which still looks correct for upright packs.
 */
(function () {
  // Tunables
  const MAX_PINCH = 0.2;        // 20% horizontal compression at the center vertex
  const FALLOFF = 3;            // higher = pinch is more localized near vertical center
  const LERP = 0.18;            // animation speed per frame (0.05 = slow, 0.3 = snappy)
  const REST_THRESHOLD = 0.001; // stop animating when within this of target

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  function findScene(mv) {
    if (mv.scene) return mv.scene;
    const symbols = Object.getOwnPropertySymbols(mv);
    for (const sym of symbols) {
      const desc = (sym.description || sym.toString()).toLowerCase();
      if (desc.includes('scene')) return mv[sym];
    }
    return null;
  }

  class PackSqueeze {
    constructor(mv, card) {
      this.mv = mv;
      this.card = card;
      this.meshes = [];
      this.originals = [];
      this.center = { x: 0, y: 0, z: 0 };
      this.halfHeight = 1;
      this.target = 0;
      this.current = 0;
      this.animating = false;
      this.ready = false;

      this.mv.addEventListener('load', () => this.setup());
      this.card.addEventListener('mouseenter', () => this.setTarget(1));
      this.card.addEventListener('mouseleave', () => this.setTarget(0));
    }

    setup() {
      const scene = findScene(this.mv);
      if (!scene) {
        console.warn('[pack-squeeze] could not access model-viewer scene');
        return;
      }

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      scene.traverse((node) => {
        if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
        const pos = node.geometry.attributes.position;
        this.meshes.push(node);
        this.originals.push(new Float32Array(pos.array));
        for (let i = 0; i < pos.array.length; i += 3) {
          const x = pos.array[i];
          const y = pos.array[i + 1];
          const z = pos.array[i + 2];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      });

      if (this.meshes.length === 0) {
        console.warn('[pack-squeeze] no meshes found in model');
        return;
      }

      this.center.x = (minX + maxX) / 2;
      this.center.y = (minY + maxY) / 2;
      this.center.z = (minZ + maxZ) / 2;
      this.halfHeight = Math.max((maxY - minY) / 2, 0.0001);
      this.ready = true;
    }

    setTarget(amount) {
      if (!this.ready) return;
      this.target = amount;
      if (!this.animating) {
        this.animating = true;
        requestAnimationFrame(() => this.tick());
      }
    }

    tick() {
      this.current += (this.target - this.current) * LERP;

      const settled = Math.abs(this.target - this.current) < REST_THRESHOLD;
      if (settled) this.current = this.target;

      this.deform();

      if (settled) {
        this.animating = false;
      } else {
        requestAnimationFrame(() => this.tick());
      }
    }

    deform() {
      const cx = this.center.x;
      const cy = this.center.y;
      const cz = this.center.z;
      const halfH = this.halfHeight;
      const amount = this.current;

      for (let m = 0; m < this.meshes.length; m++) {
        const pos = this.meshes[m].geometry.attributes.position;
        const orig = this.originals[m];

        if (amount === 0) {
          // At rest — restore exactly
          pos.array.set(orig);
        } else {
          for (let i = 0; i < pos.array.length; i += 3) {
            const ox = orig[i];
            const oy = orig[i + 1];
            const oz = orig[i + 2];

            const dy = (oy - cy) / halfH;
            const intensity = Math.exp(-dy * dy * FALLOFF);
            const factor = 1 - intensity * MAX_PINCH * amount;

            pos.array[i] = cx + (ox - cx) * factor;
            pos.array[i + 1] = oy;
            pos.array[i + 2] = cz + (oz - cz) * factor;
          }
        }

        pos.needsUpdate = true;
      }
    }
  }

  function attach() {
    document.querySelectorAll('.product-card').forEach((card) => {
      if (card.dataset.squeezeAttached) return;
      const mv = card.querySelector('model-viewer.product-card-model');
      if (!mv) return;
      card.dataset.squeezeAttached = 'true';
      new PackSqueeze(mv, card);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

  // Re-attach when new cards are added (e.g. via section reload in theme editor or pagination)
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
})();
