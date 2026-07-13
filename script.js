(() => {
  "use strict";

  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;

  root.classList.add("motion-ready");

  function setupNavigation() {
    const header = document.querySelector("[data-header]");
    const toggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-nav]");
    const links = [...nav.querySelectorAll("a[href^='#']")];
    let lastY = window.scrollY;
    let headerFrame = 0;

    const closeNav = () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      document.body.classList.remove("nav-open");
    };

    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
      document.body.classList.toggle("nav-open", !open);
    });

    links.forEach((link) => link.addEventListener("click", closeNav));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNav();
    });

    const syncHeader = () => {
      headerFrame = 0;
      const y = window.scrollY;
      header.classList.toggle("is-scrolled", y > 20);
      const hiding = y > lastY && y > 160 && !document.body.classList.contains("nav-open");
      header.classList.toggle("is-hidden", hiding);
      lastY = y;
    };

    window.addEventListener("scroll", () => {
      if (headerFrame) return;
      headerFrame = requestAnimationFrame(syncHeader);
    }, { passive: true });
    syncHeader();

    const sections = links
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-35% 0px -60%", threshold: 0 });

    sections.forEach((section) => sectionObserver.observe(section));
  }

  function setupReveals() {
    const reveals = [...document.querySelectorAll(".reveal")];
    const heroReveals = [...document.querySelectorAll(".hero .reveal")];

    heroReveals.forEach((element, index) => {
      element.style.transitionDelay = `${90 + index * 90}ms`;
    });

    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries, activeObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        activeObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -7%", threshold: 0.08 });

    reveals.forEach((element) => observer.observe(element));
  }

  class CanvasSurface {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.maxDpr = Number(canvas.dataset.maxDpr) || 2;
      this.frameInterval = Number(canvas.dataset.frameRate) ? 1000 / Number(canvas.dataset.frameRate) : 0;
      this.visible = true;
      this.running = false;
      this.frameRequest = 0;
      this.lastFrame = 0;
      this.frame = this.frame.bind(this);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);

      this.visibilityObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible && !this.running) this.start();
      }, { rootMargin: "180px" });
      this.visibilityObserver.observe(canvas);
      this.handleDocumentVisibility = () => {
        if (!document.hidden && this.visible) {
          this.resize();
          this.start();
        }
      };
      document.addEventListener("visibilitychange", this.handleDocumentVisibility);
      requestAnimationFrame(() => this.resize());
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const nextDpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
      if (nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) return;

      this.width = nextWidth;
      this.height = nextHeight;
      this.dpr = nextDpr;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.onResize();
      this.draw(0, 0);
    }

    onResize() {}

    start() {
      if (this.running) return;
      if (reducedMotion.matches) {
        this.resize();
        this.draw(16, 0);
        return;
      }
      this.running = true;
      this.lastFrame = performance.now();
      this.frameRequest = requestAnimationFrame(this.frame);
    }

    stop() {
      this.running = false;
      if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
    }

    invalidate() {
      this.resize();
      this.draw(performance.now() / 1000, 0);
      if (this.visible && !document.hidden && !reducedMotion.matches) this.start();
    }

    frame(now) {
      this.frameRequest = 0;
      if (!this.running) return;
      const elapsed = now - this.lastFrame;
      if (this.frameInterval && elapsed < this.frameInterval) {
        this.frameRequest = requestAnimationFrame(this.frame);
        return;
      }
      const delta = Math.min(elapsed / 1000, 0.05);
      this.lastFrame = this.frameInterval ? now - (elapsed % this.frameInterval) : now;
      this.draw(now / 1000, delta);

      if (this.visible && !document.hidden && !reducedMotion.matches) {
        this.frameRequest = requestAnimationFrame(this.frame);
      } else {
        this.running = false;
      }
    }

    draw() {}
  }

  // ── Fluid smoke engine ─────────────────────────────────────────────────
  // A coarse stable-fluids solver (semi-Lagrangian advection + pressure
  // projection + vorticity confinement) drives the hero and contact plumes.
  // Two scalar channels ride the velocity field: smoke density and "warmth"
  // (fresh brown-carbon → aged blue-grey). A guide flow holds the plume to
  // its editorial silhouette when idle; the pointer is a soft moving
  // obstacle inside the pressure solve, so smoke splits at its leading
  // edge, curls around the flanks, and recombines in the wake.
  const SMOKE_RAMP = {
    warmThin: [216, 144, 97],
    warmDense: [102, 59, 41],
    coolThin: [156, 175, 187],
    coolDense: [78, 99, 118]
  };

  const heroSpine = (width, height) => (width < 720
    ? {
        start: { x: width * 0.9, y: height * 0.8 },
        controlA: { x: width * 0.9, y: height * 0.56 },
        controlB: { x: width * 0.76, y: height * 0.26 },
        end: { x: width * 0.19, y: height * 0.2 },
        widthScale: 0.72
      }
    : {
        start: { x: width * 0.94, y: height * 0.84 },
        controlA: { x: width * 0.92, y: height * 0.57 },
        controlB: { x: width * 0.84, y: height * 0.25 },
        end: { x: width * 0.47, y: height * 0.15 },
        widthScale: 1
      });

  const contactSpine = (width, height) => (width < 720
    ? {
        start: { x: width * 0.92, y: height * 1.04 },
        controlA: { x: width * 0.9, y: height * 0.7 },
        controlB: { x: width * 0.62, y: height * 0.36 },
        end: { x: width * 0.14, y: height * 0.22 },
        widthScale: 0.66
      }
    : {
        start: { x: width * 0.88, y: height * 1.04 },
        controlA: { x: width * 0.86, y: height * 0.68 },
        controlB: { x: width * 0.6, y: height * 0.34 },
        end: { x: width * 0.22, y: height * 0.16 },
        widthScale: 0.78
      });

  class SmokePlumeSurface extends CanvasSurface {
    constructor(canvas, options = {}) {
      super(canvas);
      this.opts = {
        interactive: options.interactive ?? false,
        emission: options.emission ?? 1,
        alpha: options.alpha ?? 1,
        coolBias: options.coolBias ?? 0,
        showSource: options.showSource ?? true,
        particleScale: options.particleScale ?? 1,
        maxCells: options.maxCells ?? 16500,
        smallMaxCells: options.smallMaxCells ?? 8600,
        frameRate: options.frameRate ?? 30,
        smallFrameRate: options.smallFrameRate ?? 24,
        envelopeAlpha: options.envelopeAlpha ?? 1,
        geometry: options.geometry ?? heroSpine
      };
      this.dt = 1 / 30;
      this.simTime = 0;
      this.acc = 0;
      this.warmupRemaining = 0;
      this.ageProgress = 0;
      this.gw = 0;
      this.gh = 0;
      this.stepMs = 0;
      this.calmFrames = 0;
      this.tier = 0;
      this.pendingRebuild = false;
      this.pointer = {
        tx: 0.5, ty: 0.5, x: 0.5, y: 0.5,
        gx: 0, gy: 0, vx: 0, vy: 0,
        strength: 0, target: 0, seeded: false
      };

      let seed = (options.seed ?? 0x51f3a9b7) >>> 0;
      this.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    }

    setPointer(x, y, active = true) {
      if (!this.opts.interactive) return;
      this.pointer.tx = clamp(x, 0, 1);
      this.pointer.ty = clamp(y, 0, 1);
      this.pointer.target = active && !reducedMotion.matches ? 1 : 0;
      if (!this.running && this.visible) this.start();
    }

    setAgeProgress(progress) {
      const next = clamp(progress, 0, 1);
      if (Math.abs(next - this.ageProgress) < 0.002) return;
      this.ageProgress = next;
      if (!this.running) this.invalidate();
    }

    spinePoint(t) {
      const s = this.spine;
      const inv = 1 - t;
      return {
        x: inv ** 3 * s.start.x + 3 * inv ** 2 * t * s.controlA.x + 3 * inv * t ** 2 * s.controlB.x + t ** 3 * s.end.x,
        y: inv ** 3 * s.start.y + 3 * inv ** 2 * t * s.controlA.y + 3 * inv * t ** 2 * s.controlB.y + t ** 3 * s.end.y
      };
    }

    spineTangent(t) {
      const s = this.spine;
      const inv = 1 - t;
      const x = 3 * inv ** 2 * (s.controlA.x - s.start.x) + 6 * inv * t * (s.controlB.x - s.controlA.x) + 3 * t ** 2 * (s.end.x - s.controlB.x);
      const y = 3 * inv ** 2 * (s.controlA.y - s.start.y) + 6 * inv * t * (s.controlB.y - s.controlA.y) + 3 * t ** 2 * (s.end.y - s.controlB.y);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    }

    onResize() {
      if (!this.width || !this.height) return;
      const small = Math.min(this.width, this.height) < 620 || this.width < 768;
      const budget = (small ? this.opts.smallMaxCells : this.opts.maxCells) * (this.tier ? 0.62 : 1);
      this.frameInterval = 1000 / (small || this.tier ? this.opts.smallFrameRate : this.opts.frameRate);
      this.cell = Math.max(6.5, Math.sqrt((this.width * this.height) / budget));
      this.gw = Math.max(36, Math.round(this.width / this.cell));
      this.gh = Math.max(28, Math.round(this.height / this.cell));
      this.cellX = this.width / this.gw;
      this.cellY = this.height / this.gh;

      const size = this.gw * this.gh;
      this.u = new Float32Array(size);
      this.v = new Float32Array(size);
      this.u0 = new Float32Array(size);
      this.v0 = new Float32Array(size);
      this.den = new Float32Array(size);
      this.den0 = new Float32Array(size);
      this.wrm = new Float32Array(size);
      this.wrm0 = new Float32Array(size);
      this.prs = new Float32Array(size);
      this.div = new Float32Array(size);
      this.crl = new Float32Array(size);
      this.gU = new Float32Array(size);
      this.gV = new Float32Array(size);
      this.gK = new Float32Array(size);
      this.gT = new Float32Array(size);
      this.gNx = new Float32Array(size);
      this.gNy = new Float32Array(size);
      this.fade = new Float32Array(size);

      this.spine = this.opts.geometry(this.width, this.height);
      this.iterA = this.tier ? 9 : 13;
      this.iterB = this.tier ? 6 : 9;
      this.buildGuide();
      this.buildFade();
      this.buildEnvelope();
      this.initParticles(small);

      this.field = document.createElement("canvas");
      this.field.width = this.gw;
      this.field.height = this.gh;
      this.fieldCtx = this.field.getContext("2d");
      this.fieldImage = this.fieldCtx.createImageData(this.gw, this.gh);

      this.pointer.seeded = false;
      this.simTime = 0;
      this.acc = 0;
      this.stepMs = 0;
      this.calmFrames = 0;
      this.warmupRemaining = 150;
    }

    buildGuide() {
      const { gw, gh, gU, gV, gK, gT, gNx, gNy } = this;
      const scaleMin = Math.min(this.width, this.height);

      let spineCells = 0;
      let prev = this.spinePoint(0);
      for (let s = 1; s <= 24; s += 1) {
        const p = this.spinePoint(s / 24);
        spineCells += Math.hypot(p.x - prev.x, p.y - prev.y);
        prev = p;
      }
      spineCells /= this.cell;
      this.transitSpeed = spineCells / 15;

      const steps = 72;
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const point = this.spinePoint(t);
        const tangent = this.spineTangent(t);
        const radiusCss = lerp(0.02, 0.165, Math.pow(t, 0.78)) * scaleMin * this.spine.widthScale;
        const radius = Math.max(1.6, radiusCss / this.cell);
        const speed = this.transitSpeed * lerp(1.4, 0.6, t);
        const px = point.x / this.cell;
        const py = point.y / this.cell;
        const x0 = Math.max(1, Math.floor(px - radius));
        const x1 = Math.min(gw - 2, Math.ceil(px + radius));
        const y0 = Math.max(1, Math.floor(py - radius));
        const y1 = Math.min(gh - 2, Math.ceil(py + radius));
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            const dx = x - px;
            const dy = y - py;
            const q = (dx * dx + dy * dy) / (radius * radius);
            if (q > 1) continue;
            const weight = Math.exp(-2.1 * q);
            const i = y * gw + x;
            gU[i] += tangent.x * speed * weight;
            gV[i] += tangent.y * speed * weight;
            gT[i] += t * weight;
            gNx[i] += -tangent.y * weight;
            gNy[i] += tangent.x * weight;
            gK[i] += weight;
          }
        }
      }
      for (let i = 0; i < gU.length; i += 1) {
        const k = gK[i];
        if (k < 0.004) { gK[i] = 0; continue; }
        gU[i] /= k;
        gV[i] /= k;
        gT[i] /= k;
        const nl = Math.hypot(gNx[i], gNy[i]) || 1;
        gNx[i] /= nl;
        gNy[i] /= nl;
        gK[i] = Math.min(1, k * 0.75);
      }
    }

    buildFade() {
      const { gw, gh, fade } = this;
      for (let y = 0; y < gh; y += 1) {
        for (let x = 0; x < gw; x += 1) {
          const ex = Math.min(1, Math.min(x, gw - 1 - x) / 3.2);
          const ey = Math.min(1, Math.min(y, gh - 1 - y) / 3.2);
          fade[y * gw + x] = ex * ey;
        }
      }
    }

    buildEnvelope() {
      const scale = 8;
      const w = Math.max(2, Math.ceil(this.width / scale));
      const h = Math.max(2, Math.ceil(this.height / scale));
      this.envelope = document.createElement("canvas");
      this.envelope.width = w;
      this.envelope.height = h;
      const ectx = this.envelope.getContext("2d");
      const scaleMin = Math.min(this.width, this.height);
      for (let s = 0; s <= 9; s += 1) {
        const t = s / 9;
        const point = this.spinePoint(t);
        const radius = Math.max(6, lerp(0.05, 0.24, Math.pow(t, 0.9)) * scaleMin * this.spine.widthScale / scale);
        const cool = clamp(t * 0.85 + this.opts.coolBias, 0, 1);
        const r = Math.round(lerp(SMOKE_RAMP.warmThin[0], SMOKE_RAMP.coolThin[0], cool));
        const g = Math.round(lerp(SMOKE_RAMP.warmThin[1], SMOKE_RAMP.coolThin[1], cool));
        const b = Math.round(lerp(SMOKE_RAMP.warmThin[2], SMOKE_RAMP.coolThin[2], cool));
        const alpha = 0.058 * (1 - t * 0.3) * this.opts.envelopeAlpha;
        const blob = ectx.createRadialGradient(point.x / scale, point.y / scale, 0, point.x / scale, point.y / scale, radius);
        blob.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        blob.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
        blob.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ectx.fillStyle = blob;
        ectx.beginPath();
        ectx.arc(point.x / scale, point.y / scale, radius, 0, Math.PI * 2);
        ectx.fill();
      }
    }

    initParticles(small) {
      const count = Math.round((small ? 260 : 520) * this.opts.particleScale * (this.tier ? 0.6 : 1));
      this.particles = Array.from({ length: count }, () => this.spawnParticle({}, true));
      this.embers = this.opts.showSource
        ? Array.from({ length: 7 }, () => ({ phase: this.random(), drift: this.random() * 2 - 1, size: 0.8 + this.random() * 1.6 }))
        : [];
    }

    spawnParticle(particle, scatter = false) {
      const nearSource = this.random() < 0.6 && !scatter;
      const t = nearSource ? this.random() * 0.06 : Math.pow(this.random(), 0.8) * 0.94;
      const point = this.spinePoint(t);
      const radiusCss = lerp(0.02, 0.14, t) * Math.min(this.width, this.height) * this.spine.widthScale;
      const angle = this.random() * Math.PI * 2;
      const reach = Math.sqrt(this.random()) * radiusCss * 0.8;
      particle.x = (point.x + Math.cos(angle) * reach) / this.cell;
      particle.y = (point.y + Math.sin(angle) * reach) / this.cell;
      particle.age = scatter ? this.random() * 8 : 0;
      particle.ttl = 5 + this.random() * 9;
      particle.size = 0.55 + this.random() * 1.35;
      particle.seed = this.random() * 100;
      particle.bright = this.random();
      return particle;
    }

    syncPointer(dt) {
      const p = this.pointer;
      p.strength = lerp(p.strength, p.target, 0.12);
      p.x = lerp(p.x, p.tx, 0.3);
      p.y = lerp(p.y, p.ty, 0.3);
      const gx = p.x * this.width / this.cell;
      const gy = p.y * this.height / this.cell;
      if (!p.seeded) {
        p.gx = gx;
        p.gy = gy;
        p.vx = 0;
        p.vy = 0;
        p.seeded = true;
        return;
      }
      const vx = (gx - p.gx) / dt;
      const vy = (gy - p.gy) / dt;
      p.vx = lerp(p.vx, vx, 0.55);
      p.vy = lerp(p.vy, vy, 0.55);
      const mag = Math.hypot(p.vx, p.vy);
      const maxV = 130;
      if (mag > maxV) {
        p.vx *= maxV / mag;
        p.vy *= maxV / mag;
      }
      p.gx = gx;
      p.gy = gy;
    }

    applyObstacle(share) {
      const p = this.pointer;
      const strength = p.strength * share;
      if (strength < 0.02) return;
      const { gw, gh, u, v, den, wrm } = this;
      const radius = Math.max(3, clamp(Math.min(this.width, this.height) * 0.052, 34, 66) / this.cell);
      const r2 = radius * radius;
      const x0 = Math.max(1, Math.floor(p.gx - radius));
      const x1 = Math.min(gw - 2, Math.ceil(p.gx + radius));
      const y0 = Math.max(1, Math.floor(p.gy - radius));
      const y1 = Math.min(gh - 2, Math.ceil(p.gy + radius));
      for (let y = y0; y <= y1; y += 1) {
        const row = y * gw;
        for (let x = x0; x <= x1; x += 1) {
          const dx = x - p.gx;
          const dy = y - p.gy;
          const q = (dx * dx + dy * dy) / r2;
          if (q >= 1) continue;
          const f = (1 - q) * (1 - q) * strength;
          const i = row + x;
          u[i] += (p.vx - u[i]) * f;
          v[i] += (p.vy - v[i]) * f;
          const clear = 1 - 0.4 * f;
          den[i] *= clear;
          wrm[i] *= clear;
        }
      }
    }

    applyForces(dt) {
      const { gw, gh, u, v, den, gU, gV, gK, gT, gNx, gNy } = this;
      const relaxRate = 2.6 * dt;
      const swayA = Math.sin(this.simTime * 0.42) * 2.4 * dt;
      const swayB = Math.sin(this.simTime * 0.23 + 1.7) * 1.6 * dt;
      const buoyDt = 1.35 * dt;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          const k = gK[i];
          if (k > 0.004) {
            const relax = k * relaxRate;
            u[i] += (gU[i] - u[i]) * relax;
            v[i] += (gV[i] - v[i]) * relax;
            const t = gT[i];
            const sway = (Math.sin(this.simTime * 0.5 - t * 5.6) * 2.2 * dt + swayA * t + swayB * (1 - t)) * k;
            u[i] += gNx[i] * sway;
            v[i] += gNy[i] * sway;
          }
          v[i] -= den[i] * buoyDt;
        }
      }
    }

    applyVorticity(dt) {
      const { gw, gh, u, v, crl } = this;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          crl[i] = 0.5 * ((v[i + 1] - v[i - 1]) - (u[i + gw] - u[i - gw]));
        }
      }
      const eps = 3.6 * dt;
      for (let y = 2; y < gh - 2; y += 1) {
        const row = y * gw;
        for (let x = 2; x < gw - 2; x += 1) {
          const i = row + x;
          const nx = 0.5 * (Math.abs(crl[i + 1]) - Math.abs(crl[i - 1]));
          const ny = 0.5 * (Math.abs(crl[i + gw]) - Math.abs(crl[i - gw]));
          const len = Math.sqrt(nx * nx + ny * ny) + 1e-5;
          const m = eps * crl[i] / len;
          u[i] += ny * m;
          v[i] -= nx * m;
        }
      }
    }

    applyEmission(dt) {
      const { gw, gh, u, v, den, wrm } = this;
      const st = this.simTime;
      const flicker = 1 + 0.24 * Math.sin(st * 2.3) + 0.14 * Math.sin(st * 3.9 + 1.7) + 0.09 * Math.sin(st * 7.1 + 0.5);
      const wobble = 0.11 * Math.sin(st * 1.1) + 0.07 * Math.sin(st * 2.7 + 2.1);
      const tangent = this.spineTangent(0.015);
      const cosW = Math.cos(wobble);
      const sinW = Math.sin(wobble);
      const jx = tangent.x * cosW - tangent.y * sinW;
      const jy = tangent.x * sinW + tangent.y * cosW;
      const jet = this.transitSpeed * 1.35 * flicker;
      const source = this.spinePoint(0.008);
      const px = source.x / this.cell;
      const py = source.y / this.cell;
      const radius = Math.max(2.1, 0.016 * Math.min(this.width, this.height) / this.cell * (this.spine.widthScale + 0.5));
      const rate = 15.5 * this.opts.emission * flicker * dt;
      const x0 = Math.max(1, Math.floor(px - radius * 1.6));
      const x1 = Math.min(gw - 2, Math.ceil(px + radius * 1.6));
      const y0 = Math.max(1, Math.floor(py - radius * 1.6));
      const y1 = Math.min(gh - 2, Math.ceil(py + radius * 1.6));
      for (let y = y0; y <= y1; y += 1) {
        const row = y * gw;
        for (let x = x0; x <= x1; x += 1) {
          const dx = (x - px) / radius;
          const dy = (y - py) / radius;
          const q = dx * dx + dy * dy;
          if (q > 2.6) continue;
          const g = Math.exp(-1.9 * q);
          const i = row + x;
          den[i] += rate * g;
          wrm[i] += rate * g;
          const pull = Math.min(1, g * 0.85);
          u[i] += (jx * jet - u[i]) * pull;
          v[i] += (jy * jet - v[i]) * pull;
        }
      }
    }

    project(iterations) {
      const { gw, gh, u, v, prs, div } = this;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          div[i] = -0.5 * (u[i + 1] - u[i - 1] + v[i + gw] - v[i - gw]);
          prs[i] = 0;
        }
      }
      for (let iter = 0; iter < iterations; iter += 1) {
        for (let y = 1; y < gh - 1; y += 1) {
          const row = y * gw;
          for (let x = 1; x < gw - 1; x += 1) {
            const i = row + x;
            prs[i] = (div[i] + prs[i - 1] + prs[i + 1] + prs[i - gw] + prs[i + gw]) * 0.25;
          }
        }
      }
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          u[i] -= 0.5 * (prs[i + 1] - prs[i - 1]);
          v[i] -= 0.5 * (prs[i + gw] - prs[i - gw]);
        }
      }
    }

    advectVelocity(dt) {
      const { gw, gh, u, v, u0, v0 } = this;
      const maxX = gw - 1.5;
      const maxY = gh - 1.5;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          let bx = x - dt * u0[i];
          let by = y - dt * v0[i];
          if (bx < 0.5) bx = 0.5; else if (bx > maxX) bx = maxX;
          if (by < 0.5) by = 0.5; else if (by > maxY) by = maxY;
          const x0i = bx | 0;
          const y0i = by | 0;
          const s1 = bx - x0i;
          const t1 = by - y0i;
          const s0 = 1 - s1;
          const t0 = 1 - t1;
          const b = y0i * gw + x0i;
          u[i] = t0 * (s0 * u0[b] + s1 * u0[b + 1]) + t1 * (s0 * u0[b + gw] + s1 * u0[b + gw + 1]);
          v[i] = t0 * (s0 * v0[b] + s1 * v0[b + 1]) + t1 * (s0 * v0[b + gw] + s1 * v0[b + gw + 1]);
        }
      }
    }

    advectScalars(dt) {
      const { gw, gh, u, v, den, den0, wrm, wrm0, gK, gT } = this;
      const maxX = gw - 1.5;
      const maxY = gh - 1.5;
      const dis = Math.exp(-dt * 0.11);
      const disWarm = dis * Math.exp(-dt * 0.14);
      const strayDt = dt * 0.55;
      const lateDt = dt * 1.6;
      for (let y = 1; y < gh - 1; y += 1) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x += 1) {
          const i = row + x;
          let bx = x - dt * u[i];
          let by = y - dt * v[i];
          if (bx < 0.5) bx = 0.5; else if (bx > maxX) bx = maxX;
          if (by < 0.5) by = 0.5; else if (by > maxY) by = maxY;
          const x0i = bx | 0;
          const y0i = by | 0;
          const s1 = bx - x0i;
          const t1 = by - y0i;
          const s0 = 1 - s1;
          const t0 = 1 - t1;
          const b = y0i * gw + x0i;
          const w00 = t0 * s0;
          const w10 = t0 * s1;
          const w01 = t1 * s0;
          const w11 = t1 * s1;
          const tAge = gT[i];
          const stray = 1 - strayDt * (1 - Math.min(1, gK[i] * 2.4)) - (tAge > 0.74 ? lateDt * (tAge - 0.74) : 0);
          den[i] = dis * stray * (w00 * den0[b] + w10 * den0[b + 1] + w01 * den0[b + gw] + w11 * den0[b + gw + 1]);
          wrm[i] = disWarm * stray * (w00 * wrm0[b] + w10 * wrm0[b + 1] + w01 * wrm0[b + gw] + w11 * wrm0[b + gw + 1]);
        }
      }
    }

    clearBorders() {
      const { gw, gh, den, wrm } = this;
      const last = (gh - 1) * gw;
      for (let x = 0; x < gw; x += 1) {
        den[x] = 0; wrm[x] = 0;
        den[last + x] = 0; wrm[last + x] = 0;
      }
      for (let y = 0; y < gh; y += 1) {
        const row = y * gw;
        den[row] = 0; wrm[row] = 0;
        den[row + gw - 1] = 0; wrm[row + gw - 1] = 0;
      }
    }

    sampleField(field, x, y) {
      const { gw, gh } = this;
      const bx = clamp(x, 0.5, gw - 1.5);
      const by = clamp(y, 0.5, gh - 1.5);
      const x0 = bx | 0;
      const y0 = by | 0;
      const s1 = bx - x0;
      const t1 = by - y0;
      const b = y0 * gw + x0;
      return (1 - t1) * ((1 - s1) * field[b] + s1 * field[b + 1]) + t1 * ((1 - s1) * field[b + gw] + s1 * field[b + gw + 1]);
    }

    updateParticles(dt) {
      const { gw, gh } = this;
      for (const particle of this.particles) {
        particle.age += dt;
        const swirl = Math.sin(particle.seed * 1.7 + this.simTime * 1.8) * 0.8;
        const su = this.sampleField(this.u, particle.x, particle.y);
        const sv = this.sampleField(this.v, particle.x, particle.y);
        particle.x += (su + swirl * 0.4) * dt;
        particle.y += (sv - swirl * 0.25) * dt;
        if (particle.age > particle.ttl || particle.x < 1.2 || particle.x > gw - 2.2 || particle.y < 1.2 || particle.y > gh - 2.2) {
          this.spawnParticle(particle);
        }
      }
    }

    step(dt) {
      const t0 = performance.now();
      this.simTime += dt;
      this.applyForces(dt);
      this.applyVorticity(dt);
      this.applyEmission(dt);
      if (this.opts.interactive) {
        this.syncPointer(dt);
        this.applyObstacle(1);
      }
      this.project(this.iterA);
      let swap = this.u0; this.u0 = this.u; this.u = swap;
      swap = this.v0; this.v0 = this.v; this.v = swap;
      this.advectVelocity(dt);
      if (this.opts.interactive) this.applyObstacle(0.55);
      this.project(this.iterB);
      swap = this.den0; this.den0 = this.den; this.den = swap;
      swap = this.wrm0; this.wrm0 = this.wrm; this.wrm = swap;
      this.advectScalars(dt);
      this.clearBorders();
      this.updateParticles(dt);

      const cost = performance.now() - t0;
      this.stepMs = this.stepMs ? this.stepMs * 0.94 + cost * 0.06 : cost;
      if (!this.tier && this.warmupRemaining <= 0) {
        if (this.stepMs > 7.5) {
          this.calmFrames += 1;
          if (this.calmFrames > 45) {
            this.tier = 1;
            this.pendingRebuild = true;
          }
        } else {
          this.calmFrames = 0;
        }
      }
    }

    renderField() {
      const { gw, den, wrm, fade } = this;
      const data = this.fieldImage.data;
      const age = this.ageProgress;
      const warmScale = (1 - 0.52 * age) * (1 - this.opts.coolBias);
      const alphaCap = 214 * this.opts.alpha * (1 - 0.16 * age);
      const wt = SMOKE_RAMP.warmThin;
      const wd = SMOKE_RAMP.warmDense;
      const ct = SMOKE_RAMP.coolThin;
      const cd = SMOKE_RAMP.coolDense;
      const total = den.length;
      for (let i = 0, j = 0; i < total; i += 1, j += 4) {
        const density = den[i];
        if (density < 0.012) {
          data[j + 3] = 0;
          continue;
        }
        const warmth = clamp(wrm[i] / (density + 1e-4), 0, 1) * warmScale;
        const dn = density / (density + 1);
        const wr = wt[0] + (wd[0] - wt[0]) * dn;
        const wg = wt[1] + (wd[1] - wt[1]) * dn;
        const wb = wt[2] + (wd[2] - wt[2]) * dn;
        const cr = ct[0] + (cd[0] - ct[0]) * dn;
        const cg = ct[1] + (cd[1] - ct[1]) * dn;
        const cb = ct[2] + (cd[2] - ct[2]) * dn;
        data[j] = cr + (wr - cr) * warmth;
        data[j + 1] = cg + (wg - cg) * warmth;
        data[j + 2] = cb + (wb - cb) * warmth;
        data[j + 3] = (1 - Math.exp(-1.5 * density)) * alphaCap * fade[i];
      }
      this.fieldCtx.putImageData(this.fieldImage, 0, 0);
    }

    renderParticles(time) {
      const { ctx } = this;
      const age = this.ageProgress;
      const warmScale = (1 - 0.52 * age) * (1 - this.opts.coolBias);
      const wt = SMOKE_RAMP.warmThin;
      const ct = SMOKE_RAMP.coolThin;
      for (const particle of this.particles) {
        const life = particle.age / particle.ttl;
        const envelope = Math.sin(Math.PI * clamp(life, 0, 1));
        const local = this.sampleField(this.den, particle.x, particle.y);
        if (local < 0.05) continue;
        const alpha = envelope * Math.min(1, local * 1.4) * (0.09 + particle.bright * 0.2) * this.opts.alpha;
        if (alpha < 0.015) continue;
        const warmth = clamp(this.sampleField(this.wrm, particle.x, particle.y) / (local + 1e-4), 0, 1) * warmScale;
        const glint = particle.bright * (10 + 26 * warmth);
        const r = Math.round(ct[0] + (wt[0] - ct[0]) * warmth + glint);
        const g = Math.round(ct[1] + (wt[1] - ct[1]) * warmth + glint * 0.85);
        const b = Math.round(ct[2] + (wt[2] - ct[2]) * warmth + glint * 0.65);
        ctx.beginPath();
        ctx.arc(particle.x * this.cellX, particle.y * this.cellY, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
      }
    }

    renderSource(time) {
      if (!this.opts.showSource) return;
      const { ctx } = this;
      const source = this.spinePoint(0.004);
      const age = this.ageProgress;
      const dim = 1 - 0.4 * age;
      const flicker = 1 + 0.07 * Math.sin(time * 2.6) + 0.05 * Math.sin(time * 4.3 + 1.2);
      const scaleMin = Math.min(this.width, this.height);
      const outerR = scaleMin * 0.085 * flicker;

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const outer = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, outerR);
      outer.addColorStop(0, `rgba(232, 148, 82, ${0.4 * dim})`);
      outer.addColorStop(0.35, `rgba(191, 106, 61, ${0.16 * dim})`);
      outer.addColorStop(1, "rgba(191, 106, 61, 0)");
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(source.x, source.y, outerR, 0, Math.PI * 2);
      ctx.fill();

      const innerR = 22 * flicker;
      const inner = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, innerR);
      inner.addColorStop(0, `rgba(255, 205, 148, ${0.5 * dim})`);
      inner.addColorStop(0.5, `rgba(240, 156, 92, ${0.24 * dim})`);
      inner.addColorStop(1, "rgba(240, 156, 92, 0)");
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(source.x, source.y, innerR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 214, 160, ${0.9 * dim})`;
      ctx.beginPath();
      ctx.arc(source.x, source.y, 3.2 * flicker, 0, Math.PI * 2);
      ctx.fill();

      for (let e = 0; e < this.embers.length; e += 1) {
        const ember = this.embers[e];
        const life = (ember.phase + time * (0.055 + e * 0.004)) % 1;
        const x = source.x + ember.drift * (7 + life * 26) + Math.sin(time * 1.3 + e * 2.1) * 3;
        const y = source.y - life * scaleMin * 0.09;
        ctx.beginPath();
        ctx.arc(x, y, ember.size * (1 - life * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248, 178, 110, ${(1 - life) * 0.6 * dim})`;
        ctx.fill();
      }
      ctx.restore();
    }

    draw(time, delta = 0) {
      const { ctx, width, height } = this;
      if (!width || !height || !this.gw) return;

      if (this.pendingRebuild) {
        this.pendingRebuild = false;
        this.onResize();
      }

      if (this.warmupRemaining > 0) {
        const chunk = reducedMotion.matches ? this.warmupRemaining : Math.min(4, this.warmupRemaining);
        for (let s = 0; s < chunk; s += 1) this.step(this.dt);
        this.warmupRemaining -= chunk;
      } else if (delta > 0) {
        this.acc = Math.min(this.acc + delta, this.dt * 2.5);
        let guard = 0;
        while (this.acc >= this.dt && guard < 2) {
          this.step(this.dt);
          this.acc -= this.dt;
          guard += 1;
        }
      }

      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;

      ctx.globalAlpha = 0.78 + 0.22 * Math.sin(time * 0.13);
      ctx.drawImage(this.envelope, 0, 0, width, height);
      ctx.globalAlpha = 1;

      this.renderField();
      ctx.drawImage(this.field, 0, 0, width, height);

      this.renderParticles(time);
      this.renderSource(time);
    }
  }

  class HeroPlumeSurface extends SmokePlumeSurface {
    constructor(canvas) {
      super(canvas, {
        interactive: true,
        emission: 1,
        alpha: 1,
        showSource: true,
        geometry: heroSpine,
        seed: 0x2f6e2b1
      });
    }
  }

  class ModelSurface extends CanvasSurface {
    constructor(canvas) {
      super(canvas);
      this.scene = "particle";
      this.previousScene = "particle";
      this.changedAt = performance.now();
      this.sceneOrder = ["particle", "plume", "trajectory", "grid"];
      this.transitionDirection = 1;
      this.progress = 0.45;
      this.paused = false;
      this.frozenTime = 0;
    }

    setScene(scene) {
      if (scene === this.scene) return;
      this.transitionDirection = Math.sign(this.sceneOrder.indexOf(scene) - this.sceneOrder.indexOf(this.scene)) || 1;
      this.previousScene = this.scene;
      this.scene = scene;
      this.changedAt = performance.now();
      if (this.paused) this.draw(this.frozenTime);
      else if (!this.running) this.start();
    }

    setProgress(progress) {
      this.progress = clamp(progress, 0, 1);
      if (this.paused || reducedMotion.matches) this.draw(this.frozenTime || 12);
    }

    setPaused(paused) {
      this.paused = paused;
      if (paused) {
        this.frozenTime = performance.now() / 1000;
        this.stop();
        this.draw(this.frozenTime);
      } else {
        this.start();
      }
    }

    start() {
      if (this.paused) {
        this.draw(this.frozenTime);
        return;
      }
      super.start();
    }

    draw(time) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const sceneTime = this.paused ? this.frozenTime : time;
      const elapsed = reducedMotion.matches || this.paused ? 1 : (performance.now() - this.changedAt) / 850;
      const linearMix = clamp(elapsed, 0, 1);
      const mix = 1 - (1 - linearMix) ** 3;

      if (mix < 1 && this.previousScene !== this.scene) {
        ctx.save();
        ctx.globalAlpha = 1 - mix;
        ctx.translate(-this.transitionDirection * mix * 14, 0);
        this.drawScene(this.previousScene, sceneTime);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = mix;
      ctx.translate(this.transitionDirection * (1 - mix) * 14, 0);
      this.drawScene(this.scene, sceneTime);
      ctx.restore();
    }

    drawScene(scene, time) {
      if (scene === "particle") this.drawParticle(time);
      if (scene === "plume") this.drawPlume(time);
      if (scene === "trajectory") this.drawTrajectory(time);
      if (scene === "grid") this.drawGrid(time);
    }

    cubic(start, controlA, controlB, end, t) {
      const inv = 1 - t;
      return inv ** 3 * start + 3 * inv ** 2 * t * controlA + 3 * inv * t ** 2 * controlB + t ** 3 * end;
    }

    drawGlow(x, y, radius, inner, outer = "rgba(0, 0, 0, 0)") {
      const { ctx } = this;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, inner);
      glow.addColorStop(1, outer);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    drawFire(x, y, scale = 1) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      this.drawGlow(0, 0, 34, "rgba(223, 156, 109, 0.32)");
      ctx.fillStyle = "rgba(223, 156, 109, 0.96)";
      ctx.beginPath();
      ctx.moveTo(-5, 8);
      ctx.bezierCurveTo(-11, -3, 0, -10, 3, -22);
      ctx.bezierCurveTo(11, -10, 14, 0, 7, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 218, 175, 0.9)";
      ctx.beginPath();
      ctx.moveTo(-1, 7);
      ctx.quadraticCurveTo(-4, 0, 3, -8);
      ctx.quadraticCurveTo(8, 2, 4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawPlane(x, y, scale = 1, angle = -0.16) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(226, 229, 224, 0.9)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-30, 2);
      ctx.lineTo(-6, -2);
      ctx.lineTo(8, -25);
      ctx.lineTo(15, -25);
      ctx.lineTo(10, -1);
      ctx.lineTo(38, 3);
      ctx.lineTo(38, 8);
      ctx.lineTo(9, 7);
      ctx.lineTo(-3, 23);
      ctx.lineTo(-10, 23);
      ctx.lineTo(-5, 6);
      ctx.lineTo(-30, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawParticle(time) {
      const { ctx, width, height } = this;
      const cx = width * 0.51;
      const cy = height * 0.5;
      const radius = Math.min(width, height) * 0.22;
      const pulse = 1 + Math.sin(time * 1.05) * (0.035 + this.progress * 0.025);
      const beamStrength = 0.18 + this.progress * 0.12 + Math.sin(time * 0.9) * 0.035;

      const beam = ctx.createLinearGradient(0, cy, cx, cy);
      beam.addColorStop(0, "rgba(139, 182, 201, 0)");
      beam.addColorStop(0.72, `rgba(139, 182, 201, ${beamStrength})`);
      beam.addColorStop(1, `rgba(223, 156, 109, ${0.28 + this.progress * 0.12})`);
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-20, cy - radius * 0.7);
      ctx.lineTo(cx - radius * 0.72, cy - radius * 0.25);
      ctx.lineTo(cx - radius * 0.72, cy + radius * 0.25);
      ctx.lineTo(-20, cy + radius * 0.7);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(139, 182, 201, 0.34)";
      ctx.lineWidth = 1;
      for (let ray = -2; ray <= 2; ray += 1) {
        ctx.beginPath();
        ctx.moveTo(10, cy + ray * radius * 0.22);
        ctx.bezierCurveTo(width * 0.2, cy + ray * radius * 0.18, width * 0.3, cy + ray * radius * 0.12, cx - radius * 0.78, cy + ray * radius * 0.08);
        ctx.stroke();
      }

      this.drawGlow(cx, cy, radius * 1.75, "rgba(191, 106, 61, 0.2)");
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      const particle = ctx.createRadialGradient(-radius * 0.22, -radius * 0.25, radius * 0.08, 0, 0, radius);
      particle.addColorStop(0, "rgba(240, 174, 123, 0.88)");
      particle.addColorStop(0.46, "rgba(178, 91, 49, 0.72)");
      particle.addColorStop(1, "rgba(72, 52, 43, 0.56)");
      ctx.fillStyle = particle;
      ctx.strokeStyle = "rgba(242, 192, 151, 0.48)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let point = 0; point <= 52; point += 1) {
        const angle = point / 52 * Math.PI * 2;
        const edge = radius * (0.86 + Math.sin(angle * 5 + time * 0.18) * 0.055 + Math.cos(angle * 3) * 0.04);
        const x = Math.cos(angle) * edge;
        const y = Math.sin(angle) * edge;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const nodes = [
        [-0.42, -0.24, 4], [-0.12, -0.43, 3], [0.22, -0.26, 5], [0.42, 0.08, 3],
        [0.08, 0.28, 4], [-0.27, 0.32, 3], [-0.04, -0.02, 5]
      ];
      ctx.strokeStyle = "rgba(255, 223, 190, 0.22)";
      ctx.lineWidth = 1;
      nodes.forEach(([nx, ny], index) => {
        const [tx, ty] = nodes[(index + 2) % nodes.length];
        ctx.beginPath();
        ctx.moveTo(nx * radius, ny * radius);
        ctx.lineTo(tx * radius, ty * radius);
        ctx.stroke();
      });
      nodes.forEach(([nx, ny, size], index) => {
        const driftX = Math.cos(time * 0.65 + index * 1.7) * 2.2;
        const driftY = Math.sin(time * 0.72 + index * 1.4) * 2.2;
        ctx.beginPath();
        ctx.arc(nx * radius + driftX, ny * radius + driftY, size, 0, Math.PI * 2);
        ctx.fillStyle = index % 3 === 0 ? "rgba(139, 182, 201, 0.9)" : "rgba(255, 213, 171, 0.9)";
        ctx.fill();
      });
      ctx.restore();

      ctx.strokeStyle = "rgba(223, 156, 109, 0.34)";
      ctx.lineWidth = 1.2;
      for (let arc = 0; arc < 3; arc += 1) {
        ctx.beginPath();
        const sweep = time * (0.045 + arc * 0.012);
        ctx.arc(cx, cy, radius * (1.14 + arc * 0.18), -0.85 + sweep, 0.75 + sweep);
        ctx.stroke();
      }
      for (let mote = 0; mote < 14; mote += 1) {
        const angle = mote / 14 * Math.PI * 2 + time * (0.055 + this.progress * 0.025);
        const orbit = radius * (1.12 + (mote % 3) * 0.16);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * orbit, cy + Math.sin(angle) * orbit, 1 + (mote % 3) * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = mote % 4 === 0 ? "rgba(223, 156, 109, 0.72)" : "rgba(139, 182, 201, 0.38)";
        ctx.fill();
      }
    }

    drawPlume(time) {
      const { ctx, width, height } = this;
      const sourceX = width * 0.1;
      const sourceY = height * 0.73;
      const endX = width * 0.95;
      const endY = height * 0.35;

      const sunX = width * 0.8;
      const sunY = height * 0.16;
      this.drawGlow(sunX, sunY, Math.min(width, height) * 0.2, "rgba(243, 189, 126, 0.17)");
      ctx.strokeStyle = "rgba(242, 190, 130, 0.48)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
      ctx.stroke();
      for (let ray = 0; ray < 10; ray += 1) {
        const angle = ray / 10 * Math.PI * 2 + time * 0.08;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * 17, sunY + Math.sin(angle) * 17);
        ctx.lineTo(sunX + Math.cos(angle) * 25, sunY + Math.sin(angle) * 25);
        ctx.stroke();
      }

      for (let layer = 4; layer >= 0; layer -= 1) {
        const breath = Math.sin(time * 0.55 + layer * 1.2) * height * 0.01;
        const spread = height * (0.045 + layer * 0.024 + this.progress * 0.018) + breath;
        const offset = (layer - 2) * height * 0.018 + breath * 0.45;
        const gradient = ctx.createLinearGradient(sourceX, 0, endX, 0);
        gradient.addColorStop(0, `rgba(172, 96, 54, ${0.18 + layer * 0.025})`);
        gradient.addColorStop(0.48, `rgba(166, 124, 96, ${0.13 + layer * 0.018})`);
        gradient.addColorStop(1, `rgba(106, 135, 153, ${0.06 + layer * 0.015})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.bezierCurveTo(width * 0.31, sourceY - height * 0.3 + offset - spread, width * 0.64, endY + height * 0.11 - spread, endX, endY - spread * 0.55);
        ctx.bezierCurveTo(width * 0.7, endY + spread * 1.3, width * 0.35, sourceY - height * 0.13 + offset + spread, sourceX, sourceY);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(228, 178, 133, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY);
      ctx.bezierCurveTo(width * 0.31, sourceY - height * 0.26, width * 0.64, endY + height * 0.08, endX, endY);
      ctx.stroke();

      for (let index = 0; index < 46; index += 1) {
        const fraction = (index / 46 + time * (0.018 + this.progress * 0.009)) % 1;
        const x = this.cubic(sourceX, width * 0.31, width * 0.64, endX, fraction);
        const center = this.cubic(sourceY, sourceY - height * 0.26, endY + height * 0.08, endY, fraction);
        const spread = height * (0.012 + fraction * 0.11);
        const y = center + Math.sin(index * 7.7 + time * 0.5) * spread;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (index % 4) * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = fraction < 0.52 ? "rgba(224, 151, 101, 0.66)" : "rgba(150, 173, 186, 0.46)";
        ctx.fill();
      }
      this.drawFire(sourceX, sourceY, 0.72);
    }

    drawTrajectory(time) {
      const { ctx, width, height } = this;
      const source = { x: width * 0.12, y: height * 0.77 };
      const sample = { x: width * 0.86, y: height * 0.27 };

      ctx.strokeStyle = "rgba(139, 182, 201, 0.1)";
      ctx.lineWidth = 1;
      for (let contour = 0; contour < 6; contour += 1) {
        ctx.beginPath();
        ctx.moveTo(-20, height * (0.34 + contour * 0.1));
        ctx.bezierCurveTo(width * 0.24, height * (0.12 + contour * 0.12), width * 0.58, height * (0.5 + contour * 0.05), width + 20, height * (0.14 + contour * 0.12));
        ctx.stroke();
      }

      for (let member = 0; member < 9; member += 1) {
        const offset = (member - 4) / 4;
        const controlA = { x: width * (0.31 + offset * 0.025), y: height * (0.75 + offset * 0.08) };
        const controlB = { x: width * (0.56 + offset * 0.04), y: height * (0.13 + offset * 0.1) };
        ctx.strokeStyle = member === 4 ? "rgba(232, 162, 111, 0.9)" : `rgba(139, 182, 201, ${0.12 + (4 - Math.abs(member - 4)) * 0.022})`;
        ctx.lineWidth = member === 4 ? 1.8 : 1;
        const reveal = clamp(0.18 + this.progress * 1.04 + member * 0.015, 0, 1);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        for (let step = 1; step <= 36 * reveal; step += 1) {
          const fraction = step / 36;
          const x = this.cubic(source.x, controlA.x, controlB.x, sample.x, fraction);
          const y = this.cubic(source.y, controlA.y, controlB.y, sample.y, fraction);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let glint = 0; glint < 3; glint += 1) {
        const moving = (time * (0.035 + glint * 0.006) + glint * 0.29) % 1;
        const movingX = this.cubic(source.x, width * 0.31, width * 0.56, sample.x, moving);
        const movingY = this.cubic(source.y, height * 0.75, height * 0.13, sample.y, moving);
        this.drawGlow(movingX, movingY, glint === 0 ? 18 : 11, "rgba(235, 179, 129, 0.22)");
        ctx.beginPath();
        ctx.arc(movingX, movingY, glint === 0 ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = glint === 0 ? "rgba(246, 190, 139, 0.96)" : "rgba(139, 182, 201, 0.8)";
        ctx.fill();
      }

      this.drawFire(source.x, source.y, 0.72);
      this.drawGlow(sample.x, sample.y, 32, "rgba(139, 182, 201, 0.18)");
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(139, 182, 201, 0.82)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.drawPlane(sample.x - 8, sample.y - 28, 0.56, -0.2);
    }

    drawGrid(time) {
      const { ctx, width, height } = this;
      const cx = width * 0.52;
      const cy = height * 0.5;
      const radius = Math.min(width, height) * 0.34;
      this.drawGlow(cx, cy, radius * 1.55, "rgba(91, 136, 163, 0.18)");

      const globe = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.38, radius * 0.05, cx, cy, radius);
      globe.addColorStop(0, "rgba(197, 217, 219, 0.23)");
      globe.addColorStop(0.55, "rgba(78, 116, 139, 0.15)");
      globe.addColorStop(1, "rgba(18, 28, 38, 0.4)");
      ctx.fillStyle = globe;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(139, 182, 201, 0.38)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(202, 214, 213, 0.12)";
      for (let latitude = -2; latitude <= 2; latitude += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + latitude * radius * 0.27, radius * Math.sqrt(1 - (latitude * 0.18) ** 2), radius * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let longitude = -2; longitude <= 2; longitude += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * (0.22 + Math.abs(longitude) * 0.17), radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(190, 203, 199, 0.13)";
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.82, cy - radius * 0.2);
      ctx.bezierCurveTo(cx - radius * 0.42, cy - radius * 0.68, cx - radius * 0.18, cy - radius * 0.2, cx + radius * 0.06, cy - radius * 0.34);
      ctx.bezierCurveTo(cx + radius * 0.36, cy - radius * 0.48, cx + radius * 0.73, cy - radius * 0.18, cx + radius * 0.86, cy + radius * 0.13);
      ctx.bezierCurveTo(cx + radius * 0.42, cy + radius * 0.02, cx + radius * 0.2, cy + radius * 0.42, cx - radius * 0.08, cy + radius * 0.24);
      ctx.bezierCurveTo(cx - radius * 0.34, cy + radius * 0.08, cx - radius * 0.54, cy + radius * 0.3, cx - radius * 0.82, cy - radius * 0.2);
      ctx.fill();

      const plume = ctx.createLinearGradient(cx - radius, 0, cx + radius, 0);
      plume.addColorStop(0, "rgba(211, 111, 59, 0.76)");
      plume.addColorStop(0.56, "rgba(206, 144, 102, 0.4)");
      plume.addColorStop(1, "rgba(139, 182, 201, 0.12)");
      ctx.fillStyle = plume;
      ctx.globalAlpha = 0.58 + this.progress * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx - radius * 1.04, cy + radius * 0.46);
      ctx.bezierCurveTo(cx - radius * 0.38, cy + radius * 0.04, cx + radius * 0.2, cy + radius * 0.24, cx + radius * 1.05, cy - radius * 0.43);
      ctx.bezierCurveTo(cx + radius * 0.25, cy + radius * 0.02, cx - radius * 0.36, cy - radius * 0.1, cx - radius * 1.04, cy + radius * 0.46);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      const sites = [-2.45, -1.3, -0.18, 0.82, 2.06];
      sites.forEach((baseAngle, index) => {
        const angle = baseAngle + time * 0.018;
        const orbit = radius * (1.14 + (index % 2) * 0.08);
        const x = cx + Math.cos(angle) * orbit;
        const y = cy + Math.sin(angle) * orbit;
        ctx.strokeStyle = "rgba(139, 182, 201, 0.14)";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.lineTo(x, y);
        ctx.stroke();
        this.drawGlow(x, y, 13 + Math.sin(time + index) * 2, "rgba(139, 182, 201, 0.2)");
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = index < 2 ? "rgba(223, 156, 109, 0.9)" : "rgba(139, 182, 201, 0.9)";
        ctx.fill();
      });

      const glint = (time * 0.055) % 1;
      const glintX = cx - radius * 0.86 + glint * radius * 1.72;
      const glintY = cy + radius * (0.34 - glint * 0.7 + Math.sin(glint * Math.PI) * 0.16);
      this.drawGlow(glintX, glintY, 19, "rgba(235, 179, 129, 0.2)");
      ctx.beginPath();
      ctx.arc(glintX, glintY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(242, 188, 137, 0.9)";
      ctx.fill();
    }
  }

  class LabSurface extends CanvasSurface {
    constructor(canvas) {
      super(canvas);
      this.age = 18;
      this.wind = 7.2;
      this.mixing = 46;
      this.paused = false;
      this.elapsed = 0;

      let randomState = 0x7ac31f2;
      const random = () => {
        randomState = (randomState * 1664525 + 1013904223) >>> 0;
        return randomState / 4294967296;
      };
      this.seeds = Array.from({ length: 190 }, () => ({
        phase: random(),
        offset: random() * 2 - 1,
        jitter: random() * Math.PI * 2,
        size: 0.45 + random() * 1.1,
        tone: random()
      }));
    }

    normalizedState() {
      const age = clamp((this.age - 1) / 71, 0, 1);
      const wind = clamp((this.wind - 2) / 13, 0, 1);
      const mixing = clamp((this.mixing - 10) / 80, 0, 1);
      const distance = this.age * this.wind * 3.6;
      const distanceProgress = clamp(
        (Math.log(distance) - Math.log(7.2)) / (Math.log(3888) - Math.log(7.2)),
        0,
        1
      );
      return { age, wind, mixing, distance, distanceProgress };
    }

    metrics() {
      const state = this.normalizedState();
      const retained = clamp(Math.exp(-this.age / 70) * lerp(1, 0.78, state.mixing), 0.12, 0.98);
      const spread = state.mixing < 0.28 ? "compact" : state.mixing < 0.67 ? "moderate" : "diffuse";
      return {
        distance: Math.round(state.distance),
        retained,
        spread,
        summary: `At ${Math.round(this.age)} hours, the aircraft intercepts a ${spread} plume after about ${Math.round(state.distance)} km; it retains roughly ${Math.round(retained * 100)}% of its initial absorption.`
      };
    }

    cubic(start, controlA, controlB, end, t) {
      const inverse = 1 - t;
      return inverse ** 3 * start + 3 * inverse ** 2 * t * controlA + 3 * inverse * t ** 2 * controlB + t ** 3 * end;
    }

    pathPoint(path, t) {
      return {
        x: this.cubic(path.start.x, path.controlA.x, path.controlB.x, path.end.x, t),
        y: this.cubic(path.start.y, path.controlA.y, path.controlB.y, path.end.y, t)
      };
    }

    drawPlane(x, y, scale = 1, angle = -0.12) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(231, 232, 225, 0.92)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-24, 2);
      ctx.lineTo(-5, -2);
      ctx.lineTo(7, -20);
      ctx.lineTo(13, -20);
      ctx.lineTo(9, -1);
      ctx.lineTo(31, 3);
      ctx.lineTo(31, 8);
      ctx.lineTo(8, 7);
      ctx.lineTo(-2, 19);
      ctx.lineTo(-8, 19);
      ctx.lineTo(-4, 6);
      ctx.lineTo(-24, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    start() {
      if (this.paused) {
        this.draw(performance.now() / 1000, 0);
        return;
      }
      super.start();
    }

    invalidate() {
      if (this.paused || reducedMotion.matches || !this.running) {
        this.draw(performance.now() / 1000, 0);
      }
      if (!this.paused && this.visible && !document.hidden && !reducedMotion.matches && !this.running) {
        this.start();
      }
    }

    draw(time, delta = 0) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      if (!this.paused && !reducedMotion.matches) this.elapsed += delta;
      ctx.clearRect(0, 0, width, height);

      const state = this.normalizedState();
      const source = { x: width * 0.07, y: height * 0.74 };
      const reach = width * lerp(0.5, 0.92, state.distanceProgress);
      const lift = height * lerp(0.18, 0.4, state.wind);
      const spread = height * lerp(0.05, 0.3, state.mixing);
      const dilution = lerp(1, 0.3, state.mixing);
      const particleSpeed = lerp(0.015, 0.07, state.wind);
      const path = {
        start: source,
        controlA: { x: source.x + reach * 0.32, y: source.y - lift * 0.06 },
        controlB: { x: source.x + reach * 0.72, y: source.y - lift * 0.9 },
        end: { x: source.x + reach, y: source.y - lift }
      };

      ctx.save();
      ctx.strokeStyle = "rgba(139, 182, 201, 0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([22, 18]);
      ctx.lineDashOffset = -this.elapsed * lerp(18, 95, state.wind);
      for (let flow = 0; flow < 5; flow += 1) {
        const y = height * (0.17 + flow * 0.115);
        ctx.beginPath();
        ctx.moveTo(width * 0.08, y + Math.sin(flow) * 7);
        ctx.bezierCurveTo(width * 0.36, y - 18, width * 0.66, y + 22, width * 0.96, y - 8);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      for (let layer = 5; layer >= 0; layer -= 1) {
        const layerScale = 0.28 + layer * 0.14;
        const breathing = Math.sin(this.elapsed * 0.55 + layer * 1.1) * spread * 0.025;
        const layerSpread = spread * layerScale + breathing;
        const gradient = ctx.createLinearGradient(source.x, source.y, path.end.x, path.end.y);
        gradient.addColorStop(0, `rgba(178, 98, 55, ${(0.2 + layer * 0.018) * dilution})`);
        gradient.addColorStop(0.48, `rgba(166, 126, 99, ${(0.13 + layer * 0.012) * dilution})`);
        gradient.addColorStop(1, `rgba(100, 130, 150, ${(0.08 + layer * 0.009) * dilution})`);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y - 3);
        ctx.bezierCurveTo(path.controlA.x, path.controlA.y - layerSpread * 0.28, path.controlB.x, path.controlB.y - layerSpread, path.end.x, path.end.y - layerSpread * 0.72);
        ctx.bezierCurveTo(path.controlB.x, path.controlB.y + layerSpread, path.controlA.x, path.controlA.y + layerSpread * 0.5, source.x, source.y + 3);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      this.seeds.forEach((seed, index) => {
        const life = (seed.phase + this.elapsed * particleSpeed) % 1;
        const center = this.pathPoint(path, life);
        const localSpread = spread * (0.12 + life * 0.9);
        const y = center.y + seed.offset * localSpread + Math.sin(this.elapsed * 0.9 + seed.jitter) * (2 + state.mixing * 5);
        const radius = (2 + life * 15) * seed.size * lerp(0.75, 1.22, state.mixing);
        const alpha = Math.sin(Math.PI * life) * dilution;
        const aged = clamp(state.age * 0.64 + life * 0.45, 0, 1);
        const red = Math.round(lerp(216, 156, aged));
        const green = Math.round(lerp(144, 175, aged));
        const blue = Math.round(lerp(97, 187, aged));
        ctx.beginPath();
        ctx.ellipse(center.x, y, radius * 1.55, radius * 0.62, -0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * (seed.tone > 0.7 ? 0.17 : 0.1)})`;
        ctx.fill();
      });
      ctx.restore();

      ctx.strokeStyle = "rgba(222, 178, 138, 0.48)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(path.start.x, path.start.y);
      ctx.bezierCurveTo(path.controlA.x, path.controlA.y, path.controlB.x, path.controlB.y, path.end.x, path.end.y);
      ctx.stroke();

      [0.25, 0.5, 0.75].forEach((fraction) => {
        const point = this.pathPoint(path, fraction);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = fraction < 0.6 ? "rgba(238, 164, 108, 0.9)" : "rgba(139, 182, 201, 0.9)";
        ctx.fill();
        ctx.fillStyle = "rgba(182, 191, 193, 0.72)";
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.fillText(`${Math.max(1, Math.round(this.age * fraction))} h`, point.x + 8, point.y - 8);
      });

      const sourceGlow = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, 48);
      sourceGlow.addColorStop(0, "rgba(247, 173, 108, 0.78)");
      sourceGlow.addColorStop(0.26, "rgba(210, 101, 49, 0.24)");
      sourceGlow.addColorStop(1, "rgba(191, 106, 61, 0)");
      ctx.fillStyle = sourceGlow;
      ctx.beginPath();
      ctx.arc(source.x, source.y, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 188, 119, 0.96)";
      ctx.beginPath();
      ctx.arc(source.x, source.y, 5, 0, Math.PI * 2);
      ctx.fill();

      const sampleProgress = lerp(0.12, 0.95, state.age);
      const sample = this.pathPoint(path, sampleProgress);
      const gateHeight = clamp(spread * (0.8 + sampleProgress * 0.7), 28, height * 0.3);
      ctx.strokeStyle = "rgba(224, 227, 221, 0.28)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(sample.x, sample.y - gateHeight);
      ctx.lineTo(sample.x, sample.y + gateHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(139, 182, 201, 0.88)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.drawPlane(sample.x - 4, sample.y - 30, width < 620 ? 0.52 : 0.65);

      ctx.fillStyle = "rgba(221, 222, 215, 0.82)";
      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.textAlign = sample.x > width * 0.75 ? "right" : "left";
      ctx.fillText(`SAMPLE / +${Math.round(this.age)} H`, sample.x + (sample.x > width * 0.75 ? -15 : 15), sample.y + gateHeight + 18);
      ctx.textAlign = "left";
    }
  }

  function setupHeroPlume() {
    const canvas = document.querySelector("[data-hero-plume]");
    const hero = canvas.closest(".hero");
    const field = hero.querySelector("[data-hero-field]");
    const plume = new HeroPlumeSurface(canvas);
    const interactionQuery = window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)");
    let heroHeight = hero.offsetHeight;
    let heroTop = hero.offsetTop;
    let heroInView = window.scrollY < heroHeight;
    let interactionEnabled = false;
    let pointerFrame = 0;
    let scrollFrame = 0;
    let pointer = { x: window.innerWidth * 0.72, y: window.innerHeight * 0.44, active: false };

    const renderPointer = () => {
      pointerFrame = 0;
      if (!interactionEnabled || !pointer.active) {
        field.style.transform = "translate3d(0, 0, 0)";
        plume.setPointer(0.72, 0.44, false);
        return;
      }

      const viewportX = clamp(pointer.x / Math.max(window.innerWidth, 1), 0, 1);
      const viewportY = clamp(pointer.y / Math.max(window.innerHeight, 1), 0, 1);
      const localX = clamp((pointer.x - field.offsetLeft) / Math.max(field.offsetWidth, 1), 0, 1);
      const localY = clamp((pointer.y + window.scrollY - heroTop - field.offsetTop) / Math.max(field.offsetHeight, 1), 0, 1);
      field.style.transform = `translate3d(${(viewportX * 2 - 1) * 14}px, ${(viewportY * 2 - 1) * 8}px, 0)`;
      plume.setPointer(localX, localY, true);
    };

    const queuePointer = () => {
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(renderPointer);
    };

    const resetPointer = () => {
      pointer.active = false;
      queuePointer();
    };

    const syncAge = () => {
      scrollFrame = 0;
      if (!interactionEnabled || !heroInView) return;
      plume.setAgeProgress(clamp(window.scrollY / Math.max(heroHeight, 1), 0, 1));
    };

    const queueAge = () => {
      if (!interactionEnabled || !heroInView || scrollFrame) return;
      scrollFrame = requestAnimationFrame(syncAge);
    };

    const syncMetrics = () => {
      heroHeight = hero.offsetHeight;
      heroTop = hero.offsetTop;
    };

    const syncInteraction = () => {
      const nextEnabled = interactionQuery.matches && !reducedMotion.matches;
      if (nextEnabled === interactionEnabled) return;
      interactionEnabled = nextEnabled;
      if (interactionEnabled) {
        syncMetrics();
        queueAge();
        return;
      }

      pointer.active = false;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      pointerFrame = 0;
      scrollFrame = 0;
      field.style.transform = "translate3d(0, 0, 0)";
      plume.setPointer(0.72, 0.44, false);
      plume.setAgeProgress(0);
    };

    hero.addEventListener("pointermove", (event) => {
      if (!interactionEnabled) return;
      pointer = { x: event.clientX, y: event.clientY, active: true };
      queuePointer();
    }, { passive: true });
    hero.addEventListener("pointerleave", resetPointer);
    hero.addEventListener("pointercancel", resetPointer);
    window.addEventListener("blur", resetPointer);
    window.addEventListener("scroll", queueAge, { passive: true });
    window.addEventListener("resize", () => {
      syncMetrics();
      syncInteraction();
      queueAge();
    });
    window.addEventListener("pageshow", () => {
      syncMetrics();
      syncInteraction();
      queueAge();
    });
    interactionQuery.addEventListener("change", syncInteraction);
    reducedMotion.addEventListener("change", syncInteraction);

    const heroObserver = new IntersectionObserver(([entry]) => {
      heroInView = entry.isIntersecting;
      if (heroInView) queueAge();
      else if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
      }
    });
    heroObserver.observe(hero);
    syncInteraction();
    plume.start();
  }

  function setupResearchScenes() {
    const canvas = document.querySelector("[data-model-canvas]");
    const label = document.querySelector("[data-scene-label]");
    const index = document.querySelector("[data-scene-index]");
    const kicker = document.querySelector("[data-scene-kicker]");
    const caption = document.querySelector("[data-scene-caption]");
    const motionToggle = document.querySelector("[data-research-motion]");
    const motionLabel = document.querySelector("[data-research-motion-label]");
    const steps = [...document.querySelectorAll("[data-scene]")];
    const storySteps = document.querySelector("[data-research-story]");
    const spine = storySteps.querySelector("[data-story-spine]");
    const progressFill = storySteps.querySelector("[data-story-progress]");
    const model = new ModelSurface(canvas);
    const scenes = {
      particle: {
        index: "01",
        label: "Particle optics",
        kicker: "What this shows",
        caption: "Light enters a fresh smoke particle; its organic chemistry determines how much energy is absorbed."
      },
      plume: {
        index: "02",
        label: "Chemical aging",
        kicker: "What this shows",
        caption: "As smoke spreads, sunlight and chemistry can weaken its absorption over hours to days."
      },
      trajectory: {
        index: "03",
        label: "Air-mass history",
        kicker: "What this shows",
        caption: "A family of air-mass paths connects a measured sample back to fire and makes uncertainty visible."
      },
      grid: {
        index: "04",
        label: "Global model",
        kicker: "What this shows",
        caption: "Process understanding becomes a global model, tested against observations where the atmosphere is measured."
      }
    };

    let activeStep = null;
    const activate = (step) => {
      if (!step || step === activeStep) return;
      activeStep = step;
      steps.forEach((candidate) => candidate.classList.toggle("is-active", candidate === step));
      const scene = step.dataset.scene;
      const metadata = scenes[scene];
      index.textContent = metadata.index;
      label.textContent = metadata.label;
      kicker.textContent = metadata.kicker;
      caption.textContent = metadata.caption;
      model.setScene(scene);
    };

    let framePending = false;
    const syncActiveStep = () => {
      framePending = false;
      const mobile = window.matchMedia("(max-width: 720px)").matches;
      const anchorY = window.innerHeight * (mobile ? 0.78 : 0.475);
      const rects = steps.map((step) => step.getBoundingClientRect());
      const storyRect = storySteps.getBoundingClientRect();
      const firstCenter = rects[0].top + rects[0].height / 2;
      const lastCenter = rects[rects.length - 1].top + rects[rects.length - 1].height / 2;
      const storySpan = Math.max(lastCenter - firstCenter, 1);
      const storyProgress = reducedMotion.matches ? 1 : clamp((anchorY - firstCenter) / storySpan, 0, 1);
      let next = reducedMotion.matches ? steps[steps.length - 1] : null;
      let nextIndex = reducedMotion.matches ? steps.length - 1 : 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      spine.style.top = `${firstCenter - storyRect.top}px`;
      spine.style.height = `${storySpan}px`;
      progressFill.style.transform = `translateX(-0.5px) scaleY(${storyProgress})`;

      if (!reducedMotion.matches) {
        steps.forEach((step, stepIndex) => {
          const rect = rects[stepIndex];
          if (rect.top <= anchorY && rect.bottom > anchorY) {
            next = step;
            nextIndex = stepIndex;
            nearestDistance = -1;
            return;
          }
          if (nearestDistance < 0) return;
          const distance = Math.abs((rect.top + rect.bottom) / 2 - anchorY);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            next = step;
            nextIndex = stepIndex;
          }
        });
      }

      activate(next);
      if (next) {
        const activeRect = rects[nextIndex];
        const progress = reducedMotion.matches ? 1 : clamp((anchorY - activeRect.top) / Math.max(activeRect.height, 1), 0, 1);
        model.setProgress(progress);
      }
    };

    const queueSync = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(syncActiveStep);
    };

    if (!reducedMotion.matches) {
      window.addEventListener("scroll", queueSync, { passive: true });
      window.addEventListener("resize", queueSync);
      window.addEventListener("pageshow", queueSync);
    } else {
      window.addEventListener("resize", queueSync);
      window.addEventListener("pageshow", queueSync);
    }
    document.fonts?.ready.then(queueSync);
    motionToggle.addEventListener("click", () => {
      const paused = motionToggle.getAttribute("aria-pressed") !== "true";
      motionToggle.setAttribute("aria-pressed", String(paused));
      motionToggle.setAttribute("aria-label", paused ? "Resume research animation" : "Pause research animation");
      motionToggle.querySelector("span:first-child").textContent = paused ? "▶" : "Ⅱ";
      motionLabel.textContent = paused ? "Resume animation" : "Pause animation";
      model.setPaused(paused);
    });
    activate(reducedMotion.matches ? steps[steps.length - 1] : steps[0]);
    queueSync();
    model.start();
  }

  function setupBleachingWidget() {
    const widget = document.querySelector("[data-bleaching-widget]");
    if (!widget) return;

    const slider = widget.querySelector("[data-bleaching-hours]");
    const hoursOutput = widget.querySelector("[data-bleaching-output]");
    const chart = widget.querySelector("[data-bleaching-chart]");
    const bands = [...widget.querySelectorAll("[data-band]")];

    const sync = () => {
      const hours = Number(slider.value);
      const cooling = hours / Number(slider.max);
      const readings = bands.map((band) => {
        const initial = Number(band.dataset.initial);
        const floor = Number(band.dataset.floor);
        const decay = Number(band.dataset.decay);
        const absorption = floor + (initial - floor) * Math.exp(-decay * hours);
        const rounded = Math.round(absorption);
        band.querySelector("[data-band-fill]").style.setProperty("--band-height", `${absorption}%`);
        band.querySelector("[data-band-cool]").style.setProperty("--cool-opacity", cooling.toFixed(3));
        band.querySelector("[data-band-output]").textContent = `${rounded}%`;
        const spokenBand = band.dataset.band === "UV" ? "ultraviolet" : band.dataset.band.toLowerCase();
        return `${spokenBand} ${rounded} percent`;
      });

      hoursOutput.textContent = `${hours} h`;
      slider.style.setProperty("--bleaching-progress", `${cooling * 100}%`);
      slider.setAttribute("aria-valuetext", `${hours} hours since emission; illustrative relative absorption: ${readings.join(", ")}`);
      chart.setAttribute("aria-label", `Illustrative relative absorption at ${hours} hours: ${readings.join(", ")}.`);
    };

    slider.addEventListener("input", sync);
    sync();
  }

  function setupLab() {
    const canvas = document.querySelector("[data-lab-canvas]");
    const lab = new LabSurface(canvas);
    const age = document.querySelector("[data-age]");
    const wind = document.querySelector("[data-wind]");
    const mixing = document.querySelector("[data-mixing]");
    const ageOutput = document.querySelector("[data-age-output]");
    const ageLabel = document.querySelector("[data-age-label]");
    const windOutput = document.querySelector("[data-wind-output]");
    const mixingOutput = document.querySelector("[data-mixing-output]");
    const distanceOutput = document.querySelector("[data-distance-output]");
    const absorptionOutput = document.querySelector("[data-absorption-output]");
    const spreadOutput = document.querySelector("[data-spread-output]");
    const summary = document.querySelector("[data-lab-summary]");
    const presets = [...document.querySelectorAll("[data-lab-preset]")];
    const toggle = document.querySelector("[data-lab-toggle]");
    const status = document.querySelector("[data-lab-status]");

    const sync = () => {
      lab.age = Number(age.value);
      lab.wind = Number(wind.value);
      lab.mixing = Number(mixing.value);
      const metrics = lab.metrics();
      ageOutput.textContent = `${Math.round(lab.age)} h`;
      ageLabel.textContent = `+${Math.round(lab.age)} H`;
      windOutput.textContent = `${lab.wind.toFixed(1)} m s⁻¹`;
      mixingOutput.textContent = `${lab.mixing}%`;
      distanceOutput.textContent = `${metrics.distance} km`;
      absorptionOutput.textContent = `${Math.round(metrics.retained * 100)}%`;
      spreadOutput.textContent = metrics.spread;
      summary.textContent = metrics.summary;

      [age, wind, mixing].forEach((control) => {
        const progress = (Number(control.value) - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100;
        control.style.setProperty("--range-progress", `${progress}%`);
      });
      age.setAttribute("aria-valuetext", `${Math.round(lab.age)} hours transport age`);
      wind.setAttribute("aria-valuetext", `${lab.wind.toFixed(1)} metres per second wind speed`);
      mixing.setAttribute("aria-valuetext", `${lab.mixing} percent mixing`);
      lab.invalidate();
    };

    [age, wind, mixing].forEach((control) => control.addEventListener("input", () => {
      presets.forEach((preset) => {
        preset.classList.remove("is-active");
        preset.setAttribute("aria-pressed", "false");
      });
      sync();
    }));
    presets.forEach((preset) => preset.addEventListener("click", () => {
      age.value = preset.dataset.ageValue;
      wind.value = preset.dataset.windValue;
      mixing.value = preset.dataset.mixingValue;
      presets.forEach((candidate) => {
        const active = candidate === preset;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      sync();
    }));
    toggle.addEventListener("click", () => {
      lab.paused = !lab.paused;
      toggle.setAttribute("aria-pressed", String(lab.paused));
      toggle.innerHTML = lab.paused
        ? '<span aria-hidden="true">▶</span> Resume motion'
        : '<span aria-hidden="true">Ⅱ</span> Pause motion';
      status.textContent = lab.paused ? "PAUSED" : "PLAYING";
      if (lab.paused) {
        lab.stop();
        lab.invalidate();
      } else {
        lab.start();
      }
    });

    if (reducedMotion.matches) {
      lab.paused = true;
      toggle.hidden = true;
      status.textContent = "MOTION REDUCED";
    }
    sync();
    lab.start();
  }

  function setupProjectGraph() {
    const graph = document.querySelector("[data-project-graph]");
    if (!graph) return;

    const cards = [...graph.querySelectorAll(".project[data-project]")];
    const graphElements = [...graph.querySelectorAll("[data-project]")];

    const clear = () => {
      graphElements.forEach((element) => element.classList.remove("is-graph-source", "is-graph-linked"));
    };

    const highlight = (sourceId, linkedIds) => {
      clear();
      const sourceCard = cards.find((card) => card.dataset.project === sourceId);
      sourceCard?.classList.add("is-graph-source");

      [sourceId, ...linkedIds].forEach((projectId) => {
        graph.querySelectorAll(`[data-project="${projectId}"]`).forEach((element) => {
          if (element !== sourceCard) element.classList.add("is-graph-linked");
        });
      });
    };

    const highlightCard = (card) => {
      highlight(card.dataset.project, card.dataset.links.split(/\s+/).filter(Boolean));
    };

    const restoreBaseline = () => {
      const target = cards.find((card) => `#${card.id}` === window.location.hash);
      if (target) highlightCard(target);
      else clear();
    };

    cards.forEach((card) => {
      const links = [...card.querySelectorAll(".project-links [data-project]")];
      card.addEventListener("pointerenter", () => highlightCard(card));
      card.addEventListener("pointerleave", () => {
        if (!card.contains(document.activeElement)) restoreBaseline();
      });

      links.forEach((link) => {
        const highlightLink = () => highlight(card.dataset.project, [link.dataset.project]);
        const restore = () => {
          const focusedLink = links.find((candidate) => candidate === document.activeElement);
          if (focusedLink) highlight(card.dataset.project, [focusedLink.dataset.project]);
          else if (card.matches(":hover")) highlightCard(card);
          else restoreBaseline();
        };
        link.addEventListener("pointerenter", highlightLink);
        link.addEventListener("pointerleave", restore);
        link.addEventListener("focus", highlightLink);
        link.addEventListener("blur", restore);
      });
    });

    window.addEventListener("hashchange", restoreBaseline);
    restoreBaseline();
  }

  function setupContactPlume() {
    const canvas = document.querySelector("[data-contact-plume]");
    const plume = new SmokePlumeSurface(canvas, {
      geometry: contactSpine,
      emission: 0.62,
      alpha: 0.55,
      coolBias: 0.28,
      showSource: false,
      particleScale: 0.45,
      envelopeAlpha: 0.6,
      maxCells: 9000,
      smallMaxCells: 6000,
      frameRate: 24,
      seed: 0x7ac31f2
    });
    plume.start();
  }

  function setupMotionPreference() {
    reducedMotion.addEventListener("change", () => {
      document.querySelectorAll("canvas").forEach((canvas) => {
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
      });
      window.location.reload();
    });
  }

  setupNavigation();
  setupReveals();
  setupHeroPlume();
  setupResearchScenes();
  setupBleachingWidget();
  setupLab();
  setupProjectGraph();
  setupContactPlume();
  setupMotionPreference();

  document.querySelector("[data-year]").textContent = new Date().getFullYear();
})();
