import * as THREE from 'three';
import { GLTFLoader } from './gltf-loader.js';

/*
  <bundle-stage> — WebGL grid of boxes, each holding up to 4 pouches (v2).
  Port of the Svelte demo's BoxStageV2.svelte.

  ----------------------------------------------------------------------------
  V2 model — two GLBs, real box + real pouch.

  `box.glb` provides the box mesh (`BoxMaterial`) plus `Slot0`–`Slot3` anchor
  empties (a single row). `pouch.glb` provides one pouch mesh (`PouchMaterial`).
  Both are modelled in the same unit space, so on load the box is uniformly
  scaled so its footprint is TARGET_BOX_W units and the pouch gets the *same*
  scale factor. The box is recentered (footprint on origin, base on y=0); the
  pouch is recentered to its bottom-centre so it sits on a slot anchor.

  Filled slots show a textured pouch. Empty slots show the same pouch mesh with
  a flat, unlit, translucent fill — they overlap into a single combined
  silhouette with the box visible through it. Each empty pouch also renders a
  depth-only prepass so the translucent fill blends exactly one layer per pixel
  (no darkening where the bag's own faces/folds stack up).

  ----------------------------------------------------------------------------
  Event contract — consumes `bundle:updated` dispatched by <bundle-builder> on
  document:

    detail: { pouches: [variantId, …] }   (ordered, one entry per pouch)

  This element derives its own box/slot grid from the order: pouch index i fills
  box `floor(i / SLOTS_PER_BOX)`, slot `i % SLOTS_PER_BOX`; at least one (empty)
  box is always shown. On connect it dispatches `bundle:request-state` to pull
  the current bundle — this element upgrades later than <bundle-builder>
  (three.js is a heavy module graph), so it would otherwise miss the
  connect-time emit.

  Asset URLs + the slots-per-box count come from data attributes set by
  sections/bundle-builder.liquid (data-model, data-pouch-model, data-box-texture,
  data-slots-per-box). Per-product pouch textures come from the `.bundle-products`
  JSON blob in the parent <bundle-builder> (keyed by variant id → textureUrl).

  Three.js gotchas preserved from IMPLEMENTATION_NOTES.md:
  - texture flipY=false, SRGBColorSpace, anisotropy
  - discriminate meshes by material name (BoxMaterial / PouchMaterial)
  - clone(true) keeps geometry/material refs shared across instances
  - wrap each clone in a Group so grid positioning doesn't disturb re-centering
  - fake radial-gradient contact shadow instead of a real shadow pass
*/

// Box.glb is modelled at ~0.15 units; scale its footprint up to this so the
// GAP / camera-framing constants below stay in a sane range.
const TARGET_BOX_W = 2.2;
const GAP = 0.18;
// Camera pull-back multiplier — higher = more zoomed out / more breathing room.
const FRAME_MARGIN = 2;
// Empty-slot pouch fill — flat translucent. Empty pouches overlap into one
// combined silhouette; tune colour + opacity here.
const EMPTY_COLOR = 0xf2ede3;
const EMPTY_OPACITY = 0.45;
const AZIMUTH = Math.PI / 4;
const ELEVATION = Math.PI / 5;
const AZ_RANGE = 0.12;
const EL_RANGE = 0.08;
const CURSOR_LERP = 0.06;
// svelte/motion Spring configs from the demo, reused by the minimal Spring below.
const CAMERA_SPRING = { stiffness: 0.08, damping: 0.65 };
const FOCUS_SPRING = { stiffness: 0.08, damping: 0.7 };
const POS_SPRING = { stiffness: 0.1, damping: 0.7 };
const FALLBACK_POUCH_COLOR = 0xcfc6bd;

// Minimal spring — replaces svelte/motion's Spring (no framework at runtime).
// Handles a plain number or a flat {x,z}-style object. Fixed per-frame step;
// close enough to the demo's feel for camera distance/focus and grid re-tiling.
class Spring {
  constructor(value, { stiffness, damping }) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.isNumber = typeof value === 'number';
    if (this.isNumber) {
      this.current = value;
      this.target = value;
      this.vel = 0;
    } else {
      this.current = { ...value };
      this.target = { ...value };
      this.vel = {};
      for (const k of Object.keys(value)) this.vel[k] = 0;
    }
  }

  set(value, { instant = false } = {}) {
    if (this.isNumber) {
      this.target = value;
      if (instant) {
        this.current = value;
        this.vel = 0;
      }
    } else {
      this.target = { ...value };
      if (instant) {
        this.current = { ...value };
        for (const k of Object.keys(this.vel)) this.vel[k] = 0;
      }
    }
  }

  tick() {
    if (this.isNumber) {
      this.vel += (this.target - this.current) * this.stiffness;
      this.vel *= this.damping;
      this.current += this.vel;
    } else {
      for (const k of Object.keys(this.current)) {
        this.vel[k] += (this.target[k] - this.current[k]) * this.stiffness;
        this.vel[k] *= this.damping;
        this.current[k] += this.vel[k];
      }
    }
  }
}

// Odd cubic (3v - v³)/2 — see demo: peak slope at centre, flat at viewport edges.
function shapeCursor(v) {
  const c = Math.max(-1, Math.min(1, v));
  return (3 * c - c * c * c) / 2;
}

// Column count grows with box count: 1 → 1, 2–4 → 2, 5+ → 3.
function getCols(boxes) {
  if (boxes <= 1) return 1;
  if (boxes <= 4) return 2;
  return 3;
}

class BundleStage extends HTMLElement {
  connectedCallback() {
    this.slotsPerBox = parseInt(this.dataset.slotsPerBox, 10) || 4;
    this.currentPouches = [];

    this._onBundleUpdated = (e) => {
      this.currentPouches = (e.detail && Array.isArray(e.detail.pouches))
        ? e.detail.pouches
        : [];
      if (this.applyPouches) this.applyPouches(this.currentPouches);
    };
    document.addEventListener('bundle:updated', this._onBundleUpdated);

    this.setupScene();

    // Pull current state: <bundle-builder> connects and emits before this
    // element upgrades, so a one-shot `bundle:updated` would be missed.
    document.dispatchEvent(new CustomEvent('bundle:request-state'));
  }

  disconnectedCallback() {
    document.removeEventListener('bundle:updated', this._onBundleUpdated);
    if (this._cleanup) this._cleanup();
  }

  // Reads the products JSON blob from the parent <bundle-builder> and builds a
  // variantId → pouch texture URL map.
  readTextureMap() {
    const map = new Map();
    const host = this.closest('bundle-builder') || document;
    const blob = host.querySelector('.bundle-products');
    if (!blob) return map;
    try {
      const products = JSON.parse(blob.textContent);
      for (const p of products) {
        if (p && p.id != null && p.textureUrl) map.set(String(p.id), p.textureUrl);
      }
    } catch (err) {
      console.error('[bundle-stage] failed to parse products blob:', err);
    }
    return map;
  }

  // Ordered pouch list → { slots, boxCount }. Pouch i fills box floor(i/N),
  // slot i%N; at least one (empty) box is always present. Each slot carries
  // its variantId or null.
  deriveSlots(pouches) {
    const N = this.slotsPerBox;
    const boxCount = Math.max(1, Math.ceil(pouches.length / N));
    const slots = [];
    for (let i = 0; i < boxCount * N; i++) {
      slots.push({
        boxIndex: Math.floor(i / N),
        slotIndex: i % N,
        variantId: pouches[i] != null ? String(pouches[i]) : null
      });
    }
    return { slots, boxCount };
  }

  setupScene() {
    const container = this;
    const N = this.slotsPerBox;
    const texByVariant = this.readTextureMap();
    const emptyEl = this.querySelector('[data-bundle-empty]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    scene.add(new THREE.HemisphereLight(0xfff6e0, 0xb6a99a, 0.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55);
    fill.position.set(-5, 3, -2);
    scene.add(fill);

    // ---- Textures (loaded once, shared across all clones) ----
    const texLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    function loadTex(path, onError) {
      const t = texLoader.load(
        path,
        () => {
          t.needsUpdate = true;
        },
        undefined,
        (err) => {
          console.error('[bundle-stage] texture failed to load:', path, err);
          if (onError) onError(err);
        }
      );
      // glTF UVs are top-left origin; vanilla TextureLoader assumes bottom-left.
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }

    const boxTexUrl = this.dataset.boxTexture;
    const boxTexture = boxTexUrl ? loadTex(boxTexUrl) : null;

    // ---- Shared materials ----
    const boxMaterial = new THREE.MeshStandardMaterial({
      map: boxTexture,
      color: boxTexture ? 0xffffff : FALLBACK_POUCH_COLOR,
      roughness: 0.85,
      metalness: 0
    });
    // Empty-slot pouch: a flat, unlit, translucent fill. Empty pouches overlap
    // into a single combined silhouette with the box visible through it.
    //
    // Single-layer transparency: a closed bag's faces (front, back, gusset
    // folds) would each blend again, darkening wherever geometry stacks up. So
    // every empty pouch also renders a depth-only prepass that records the
    // nearest empty-pouch surface; `EqualDepth` here then only blends fragments
    // at exactly that depth — one layer per pixel, no build-up.
    const emptyMaterial = new THREE.MeshBasicMaterial({
      color: EMPTY_COLOR,
      transparent: true,
      opacity: EMPTY_OPACITY,
      depthWrite: false,
      depthFunc: THREE.EqualDepth
    });
    // Depth-only prepass material for empty pouches. `transparent: true` puts it
    // in the transparent queue (after the opaque box + shadow planes, so neither
    // gets clipped); `colorWrite: false` writes nothing but depth; `depthWrite:
    // true` records it. renderOrder (set in buildBoxEntry) keeps every prepass
    // ahead of every visible empty pouch.
    const depthPrepassMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      transparent: true
    });

    // Pouch materials are created lazily per variant id and cached/shared —
    // every instance of the same product reuses one material + texture.
    // Colour endpoints for the texture load-in crossfade below.
    const FALLBACK_COLOR_OBJ = new THREE.Color(FALLBACK_POUCH_COLOR);
    const WHITE_COLOR_OBJ = new THREE.Color(0xffffff);
    const pouchTextures = new Map();
    const pouchMaterials = new Map();
    // Materials mid-crossfade from the flat fallback colour to their loaded
    // texture — ticked in the RAF loop. See getPouchMaterial.
    const fadingMaterials = new Set();
    function getPouchMaterial(variantId) {
      if (pouchMaterials.has(variantId)) return pouchMaterials.get(variantId);
      const url = texByVariant.get(variantId);
      // Always start on the flat fallback colour with NO map bound. Binding a
      // map before its image has loaded makes the shader sample an empty
      // (black) texture — that's the flash of black before the pouch art
      // appears. The map is only attached in the load callback below.
      const material = new THREE.MeshStandardMaterial({
        color: FALLBACK_POUCH_COLOR,
        roughness: 0.55,
        metalness: 0
      });
      if (url) {
        const tex = texLoader.load(
          url,
          () => {
            tex.needsUpdate = true;
            material.map = tex;
            // Crossfade the tint fallback → white so the texture reveals
            // smoothly instead of popping in.
            if (reduced) {
              material.color.copy(WHITE_COLOR_OBJ);
            } else {
              material.userData.fade = 0;
              fadingMaterials.add(material);
            }
            material.needsUpdate = true;
          },
          undefined,
          (err) => {
            // Missing/blocked texture — stay on the flat fallback colour,
            // don't break the scene.
            console.error('[bundle-stage] texture failed to load:', url, err);
          }
        );
        // glTF UVs are top-left origin; vanilla TextureLoader assumes bottom-left.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        pouchTextures.set(variantId, tex);
      }
      pouchMaterials.set(variantId, material);
      return material;
    }

    // Pre-warm every pouch texture as soon as the stage is idle, so adding a
    // pouch reuses an already-loaded material instead of waiting on a network
    // fetch. On a cold cache / very slow connection the flat-colour fallback +
    // crossfade still cover the wait — but for most adds the texture is ready
    // before the pouch is even placed.
    const prewarmTextures = () => {
      for (const variantId of texByVariant.keys()) getPouchMaterial(variantId);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(prewarmTextures);
    else setTimeout(prewarmTextures, 0);

    // ---- Fake contact-shadow resources (shared) ----
    const shadowTexture = (() => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const c = size / 2;
      const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.16)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false
    });

    const instancesGroup = new THREE.Group();
    scene.add(instancesGroup);
    // Scratch lookup driven by the RAF loop, keyed by box index.
    const boxes = new Map();

    // Filled in after the GLBs load.
    let modelTemplate = null;
    let pouchTemplate = null;
    // Slot anchor positions, local to a box wrapper group.
    let slotPositions = [];
    // World footprint of one box — drives grid stepping + camera framing.
    let BOX_W = 1;
    let BOX_D = 1;
    let BOX_HEIGHT = 1;
    // Combined visible height (box vs. a pouch standing in it). The camera aims
    // at half this so the box+pouch mass is vertically centred.
    let CONTENT_HEIGHT = 1;

    const distanceSpring = new Spring(0, CAMERA_SPRING);
    const focusSpring = new Spring({ x: 0, z: 0 }, FOCUS_SPRING);
    const cursorTarget = { x: 0, y: 0 };
    const cursor = { x: 0, y: 0 };
    const lookTarget = new THREE.Vector3();

    function gridSlot(index, boxCount) {
      const cols = getCols(boxCount);
      const stepX = BOX_W + GAP;
      const stepZ = BOX_D + GAP;
      return { x: (index % cols) * stepX, z: Math.floor(index / cols) * stepZ };
    }

    function computeFocus(boxCount) {
      const cols = getCols(boxCount);
      const rows = Math.max(1, Math.ceil(boxCount / cols));
      const filledCols = Math.min(cols, boxCount);
      const stepX = BOX_W + GAP;
      const stepZ = BOX_D + GAP;
      return { x: ((filledCols - 1) * stepX) / 2, z: ((rows - 1) * stepZ) / 2 };
    }

    function computeDistance(boxCount) {
      const fov = (camera.fov * Math.PI) / 180;
      const cols = getCols(boxCount);
      const rows = Math.max(1, Math.ceil(boxCount / cols));
      const filledCols = Math.min(cols, boxCount);
      const stepX = BOX_W + GAP;
      const stepZ = BOX_D + GAP;
      const width = (filledCols - 1) * stepX + BOX_W;
      const depth = (rows - 1) * stepZ + BOX_D;
      const size = Math.max(width, depth, BOX_W);
      return (size / (2 * Math.tan(fov / 2))) * FRAME_MARGIN + 0.6;
    }

    // Pulls the PouchMaterial-bearing mesh out of a pouch clone.
    function findPouchMesh(root) {
      let mesh = null;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (!mesh || (obj.material && obj.material.name === 'PouchMaterial')) mesh = obj;
      });
      if (!mesh) throw new Error('pouch.glb has no mesh');
      return mesh;
    }

    // Builds one box instance: a clone of the box model + N pouch clones, each
    // wrapped at a slot anchor (start empty / translucent).
    function buildBoxEntry() {
      const group = new THREE.Group();

      // clone(true) deep-copies the node tree but keeps geometry refs shared.
      const boxClone = modelTemplate.clone(true);
      group.add(boxClone);

      const pouches = [];
      for (let i = 0; i < N; i++) {
        // Wrap the clone so the slot anchor positions it without disturbing the
        // template's internal bottom-centre recenter offset.
        const wrapper = new THREE.Group();
        const pouchClone = pouchTemplate.clone(true);
        wrapper.add(pouchClone);
        const slot = slotPositions[i] || new THREE.Vector3();
        wrapper.position.set(slot.x, slot.y, slot.z);
        group.add(wrapper);

        const mesh = findPouchMesh(pouchClone);
        mesh.material = emptyMaterial;
        mesh.renderOrder = 2;
        // Depth-only prepass — child of the mesh so it shares the exact
        // transform + (shared) geometry. renderOrder 1 keeps every prepass ahead
        // of every visible empty pouch (renderOrder 2) in the transparent queue.
        // Toggled off for filled slots in apply().
        const depthPrepass = new THREE.Mesh(mesh.geometry, depthPrepassMaterial);
        depthPrepass.renderOrder = 1;
        mesh.add(depthPrepass);
        pouches.push({ mesh, depthPrepass });
      }

      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      const shadowSize = Math.max(BOX_W, BOX_D) * 1.25;
      shadow.scale.set(shadowSize, shadowSize, 1);
      shadow.position.y = 0.001;
      shadow.renderOrder = -1;
      group.add(shadow);

      return { group, pos: new Spring({ x: 0, z: 0 }, POS_SPRING), pouches };
    }

    function apply(slots, boxCount) {
      if (!modelTemplate || !pouchTemplate) return;
      distanceSpring.target = computeDistance(boxCount);
      focusSpring.target = computeFocus(boxCount);

      // Ensure a box entry per index, positioned in the grid.
      for (let b = 0; b < boxCount; b++) {
        let entry = boxes.get(b);
        if (!entry) {
          entry = buildBoxEntry();
          const slot = gridSlot(b, boxCount);
          entry.group.position.set(slot.x, 0, slot.z);
          entry.pos.set(slot, { instant: true });
          instancesGroup.add(entry.group);
          boxes.set(b, entry);
        } else {
          entry.pos.target = gridSlot(b, boxCount);
        }
      }

      // Drop boxes beyond the current count.
      for (const [index, entry] of boxes) {
        if (index < boxCount) continue;
        instancesGroup.remove(entry.group);
        boxes.delete(index);
      }

      // Filled slot → textured pouch mesh (prepass off); empty slot →
      // translucent fill backed by its depth prepass.
      for (const slot of slots) {
        const entry = boxes.get(slot.boxIndex);
        if (!entry) continue;
        const pouch = entry.pouches[slot.slotIndex];
        if (!pouch) continue;
        if (slot.variantId) {
          pouch.mesh.material = getPouchMaterial(slot.variantId);
          pouch.depthPrepass.visible = false;
        } else {
          pouch.mesh.material = emptyMaterial;
          pouch.depthPrepass.visible = true;
        }
      }

      if (emptyEl) emptyEl.hidden = slots.some((s) => s.variantId);
    }

    // Exposed so the `bundle:updated` handler can re-tile once the GLBs are in.
    this.applyPouches = (pouches) => {
      const { slots, boxCount } = this.deriveSlots(pouches);
      apply(slots, boxCount);
    };

    const gltfLoader = new GLTFLoader();
    Promise.all([
      gltfLoader.loadAsync(this.dataset.model),
      gltfLoader.loadAsync(this.dataset.pouchModel)
    ])
      .then(([boxGltf, pouchGltf]) => {
        const root = boxGltf.scene;

        // Find the box mesh + the Slot* anchor empties.
        let boxMesh = null;
        const slotNodes = [];
        root.traverse((obj) => {
          if (obj.isMesh && !boxMesh) boxMesh = obj;
          if (/^Slot\d+$/.test(obj.name)) slotNodes.push(obj);
        });
        if (!boxMesh) {
          console.error('[bundle-stage] box.glb has no mesh');
          return;
        }
        slotNodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        // Swap in the textured box material.
        root.traverse((obj) => {
          if (obj.isMesh && obj.material && obj.material.name === 'BoxMaterial') {
            obj.material = boxMaterial;
          }
        });

        // Normalise scale so the box footprint is TARGET_BOX_W units. The pouch
        // is modelled in the same unit space, so it gets the same factor.
        const rawBox = new THREE.Box3().setFromObject(boxMesh);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const scale = TARGET_BOX_W / (rawSize.x || 1);
        root.scale.setScalar(scale);
        root.updateMatrixWorld(true);

        // Recenter the box: footprint centred on origin, base sitting on y=0.
        const bbox = new THREE.Box3().setFromObject(boxMesh);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        root.position.set(-center.x, -bbox.min.y, -center.z);
        root.updateMatrixWorld(true);

        BOX_W = size.x;
        BOX_D = size.z;
        BOX_HEIGHT = size.y;

        // Slot anchors in box-wrapper-local space (root carries the recenter
        // offset, so a slot's world position == its position inside a wrapper).
        slotPositions = slotNodes.map((n) => n.getWorldPosition(new THREE.Vector3()));

        // Pouch: same scale as the box, then recentered to its bottom-centre so
        // placing it at a slot anchor sits it on the box floor.
        const pouchRoot = pouchGltf.scene;
        pouchRoot.scale.setScalar(scale);
        pouchRoot.updateMatrixWorld(true);
        const pBox = new THREE.Box3().setFromObject(pouchRoot);
        const pCenter = pBox.getCenter(new THREE.Vector3());
        const pouchHeight = pBox.getSize(new THREE.Vector3()).y;
        pouchRoot.position.set(-pCenter.x, -pBox.min.y, -pCenter.z);
        pouchRoot.updateMatrixWorld(true);

        // Box and pouch both sit on y=0; the taller is the visible mass the
        // camera should centre on.
        CONTENT_HEIGHT = Math.max(BOX_HEIGHT, pouchHeight);

        modelTemplate = root;
        pouchTemplate = pouchRoot;

        // Re-snap framing now that the real footprint is known.
        const { slots, boxCount } = this.deriveSlots(this.currentPouches);
        focusSpring.set(computeFocus(boxCount), { instant: true });
        distanceSpring.set(computeDistance(boxCount), { instant: true });

        apply(slots, boxCount);
      })
      .catch((err) => console.error('[bundle-stage] model load failed:', err));

    function onResize() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      distanceSpring.target = computeDistance(boxes.size || 1);
    }

    function onPointerMove(e) {
      cursorTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursorTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    function onPointerLeave() {
      cursorTarget.x = 0;
      cursorTarget.y = 0;
    }

    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    window.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerleave', onPointerLeave);

    onResize();

    // Snap the camera to its starting framing so the first frame doesn't whoosh in.
    {
      const d0 = distanceSpring.current;
      const f0 = focusSpring.current;
      camera.position.set(
        f0.x + Math.cos(ELEVATION) * Math.sin(AZIMUTH) * d0,
        Math.sin(ELEVATION) * d0 + CONTENT_HEIGHT / 2,
        f0.z + Math.cos(ELEVATION) * Math.cos(AZIMUTH) * d0
      );
    }

    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);

      // prefers-reduced-motion: snap the camera framing and skip the cursor orbit.
      if (reduced) {
        distanceSpring.current = distanceSpring.target;
        focusSpring.current = { ...focusSpring.target };
      } else {
        distanceSpring.tick();
        focusSpring.tick();
        cursor.x += (cursorTarget.x - cursor.x) * CURSOR_LERP;
        cursor.y += (cursorTarget.y - cursor.y) * CURSOR_LERP;
      }
      const dist = distanceSpring.current;
      const focus = focusSpring.current;

      const cx = shapeCursor(cursor.x);
      const cy = shapeCursor(cursor.y);
      const az = AZIMUTH + cx * AZ_RANGE;
      // Cursor y is +1 at the bottom of the viewport; flip so moving up raises the camera.
      const el = ELEVATION + -cy * EL_RANGE;

      camera.position.set(
        focus.x + Math.cos(el) * Math.sin(az) * dist,
        Math.sin(el) * dist + CONTENT_HEIGHT / 2,
        focus.z + Math.cos(el) * Math.cos(az) * dist
      );
      lookTarget.set(focus.x, CONTENT_HEIGHT / 2, focus.z);
      camera.lookAt(lookTarget);

      for (const entry of boxes.values()) {
        if (reduced) entry.pos.current = { ...entry.pos.target };
        else entry.pos.tick();
        entry.group.position.x = entry.pos.current.x;
        entry.group.position.z = entry.pos.current.z;
      }

      // Advance any pouch texture crossfades (fallback tint → white).
      for (const m of fadingMaterials) {
        m.userData.fade = Math.min(1, m.userData.fade + 0.08);
        m.color.lerpColors(FALLBACK_COLOR_OBJ, WHITE_COLOR_OBJ, m.userData.fade);
        if (m.userData.fade >= 1) fadingMaterials.delete(m);
      }

      renderer.render(scene, camera);
    }
    frame();

    this._cleanup = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      this.applyPouches = null;

      if (boxTexture) boxTexture.dispose();
      for (const t of pouchTextures.values()) t.dispose();
      boxMaterial.dispose();
      emptyMaterial.dispose();
      depthPrepassMaterial.dispose();
      for (const m of pouchMaterials.values()) m.dispose();
      shadowTexture.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();

      // Templates own the BufferGeometry all clones share.
      for (const template of [modelTemplate, pouchTemplate]) {
        if (!template) continue;
        template.traverse((obj) => {
          if (obj.isMesh && obj.geometry) obj.geometry.dispose();
        });
      }

      boxes.clear();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }
}

customElements.define('bundle-stage', BundleStage);
