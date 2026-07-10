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

    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      header.classList.toggle("is-scrolled", y > 20);
      const hiding = y > lastY && y > 160 && !document.body.classList.contains("nav-open");
      header.classList.toggle("is-hidden", hiding);
      lastY = y;
    }, { passive: true });

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

  class PlumeSurface extends CanvasSurface {
    constructor(canvas, options = {}) {
      super(canvas);
      this.options = {
        sourceX: options.sourceX ?? 0.12,
        sourceY: options.sourceY ?? 0.78,
        direction: options.direction ?? 1,
        density: options.density ?? 150,
        opacity: options.opacity ?? 1,
        showSource: options.showSource ?? true
      };
      this.pointer = { x: 0.5, y: 0.5, active: false };
      this.seeds = Array.from({ length: this.options.density }, (_, index) => ({
        phase: index / this.options.density,
        drift: Math.random() * 2 - 1,
        wobble: Math.random() * Math.PI * 2,
        size: 0.45 + Math.random() * 1.1,
        lift: 0.7 + Math.random() * 0.65,
        tone: Math.random()
      }));
    }

    setPointer(x, y, active = true) {
      this.pointer = { x, y, active };
    }

    draw(time) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);

      const sourceX = width * this.options.sourceX;
      const sourceY = height * this.options.sourceY;
      const direction = this.options.direction;
      const travel = Math.max(width * 0.82, 620);
      const rise = Math.min(height * 0.62, 510);
      const stillTime = reducedMotion.matches ? 18 : time;

      const plumePoint = (life, lane = 0, phase = 0) => {
        const curl = Math.sin(stillTime * 0.26 + phase + life * 8.5) * (8 + life * 42);
        const pointerPull = this.pointer.active
          ? (this.pointer.y - 0.5) * 82 * life * clamp(1 - Math.abs(this.pointer.x - life) * 1.7, 0, 1)
          : 0;
        return {
          x: sourceX + direction * (life * travel + curl * 0.3),
          y: sourceY - Math.pow(life, 0.74) * rise * 0.68 + curl + lane * (8 + life * 44) + pointerPull
        };
      };

      ctx.save();
      const flowGradient = ctx.createLinearGradient(sourceX, sourceY, sourceX + direction * travel, sourceY - rise * 0.55);
      flowGradient.addColorStop(0, "rgba(223, 156, 109, 0.34)");
      flowGradient.addColorStop(0.5, "rgba(183, 163, 151, 0.18)");
      flowGradient.addColorStop(1, "rgba(139, 182, 201, 0.05)");
      for (let lane = -3; lane <= 3; lane += 1) {
        ctx.beginPath();
        for (let step = 0; step <= 34; step += 1) {
          const life = step / 34;
          const point = plumePoint(life, lane * 0.5, lane * 1.9);
          if (step === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = flowGradient;
        ctx.lineWidth = lane === 0 ? 1 : 0.65;
        ctx.setLineDash(lane % 2 === 0 ? [1, 9] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = `blur(${Math.max(4, width / 300)}px)`;

      this.seeds.forEach((seed) => {
        const life = (seed.phase + stillTime * (0.009 + seed.size * 0.0018)) % 1;
        const envelope = Math.sin(Math.PI * life);
        const point = plumePoint(life, seed.drift * seed.lift, seed.wobble);
        const x = point.x + direction * seed.drift * life * 34;
        const y = point.y - life * rise * (seed.lift - 1) * 0.1;
        const radius = (5 + life * 44) * seed.size;
        const warm = seed.tone > 0.62;

        ctx.beginPath();
        ctx.ellipse(x, y, radius * (1.3 + life * 0.45), radius * 0.66, direction * -0.3, 0, Math.PI * 2);
        ctx.fillStyle = warm
          ? `rgba(211, 125, 73, ${envelope * 0.07 * this.options.opacity})`
          : `rgba(145, 163, 172, ${envelope * 0.052 * this.options.opacity})`;
        ctx.fill();
      });

      ctx.filter = "none";
      this.seeds.slice(0, 22).forEach((seed, index) => {
        const life = (seed.phase + stillTime * (0.024 + index * 0.00005)) % 1;
        if (life > 0.45) return;
        const point = plumePoint(life, seed.drift * 0.4, seed.wobble);
        const x = point.x;
        const y = point.y;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + seed.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(235, 164, 103, ${(1 - life / 0.45) * 0.5})`;
        ctx.fill();
      });
      ctx.restore();

      if (this.options.showSource) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const sourceGlow = ctx.createRadialGradient(sourceX, sourceY, 0, sourceX, sourceY, 58);
        sourceGlow.addColorStop(0, "rgba(245, 169, 104, 0.52)");
        sourceGlow.addColorStop(0.22, "rgba(213, 104, 50, 0.2)");
        sourceGlow.addColorStop(1, "rgba(191, 106, 61, 0)");
        ctx.fillStyle = sourceGlow;
        ctx.beginPath();
        ctx.arc(sourceX, sourceY, 58, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(240, 170, 107, 0.88)";
        ctx.beginPath();
        ctx.moveTo(sourceX - 5, sourceY + 6);
        ctx.quadraticCurveTo(sourceX - 10, sourceY - 7, sourceX, sourceY - 18);
        ctx.quadraticCurveTo(sourceX + 11, sourceY - 5, sourceX + 6, sourceY + 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

      }
    }
  }

  class HeroPlumeSurface extends CanvasSurface {
    constructor(canvas) {
      super(canvas);
      this.pointer = {
        x: 0.72,
        y: 0.44,
        targetX: 0.72,
        targetY: 0.44,
        strength: 0,
        targetStrength: 0,
        pathPosition: 0.5,
        normalOffset: 0
      };

      let randomState = 0x2f6e2b1;
      const random = () => {
        randomState = (randomState * 1664525 + 1013904223) >>> 0;
        return randomState / 4294967296;
      };

      this.motes = Array.from({ length: 32 }, () => ({
        phase: random(),
        lane: random() * 1.5 - 0.75,
        size: 0.7 + random() * 1.8,
        speed: 0.016 + random() * 0.012,
        tone: random()
      }));
      this.clouds = Array.from({ length: 48 }, () => ({
        phase: random(),
        lane: random() * 1.8 - 0.9,
        size: 0.55 + random() * 1.1,
        stretch: 1.1 + random() * 1.4,
        drift: 0.7 + random() * 0.65,
        tone: random()
      }));
      this.sparks = Array.from({ length: 7 }, () => ({
        phase: random(),
        drift: random() * 2 - 1,
        size: 0.8 + random() * 1.8
      }));
    }

    setPointer(x, y, active = true) {
      this.pointer.targetX = clamp(x, 0, 1);
      this.pointer.targetY = clamp(y, 0, 1);
      this.pointer.targetStrength = active && !reducedMotion.matches ? 1 : 0;
      if (!this.running && this.visible) this.start();
    }

    geometry() {
      const { width, height } = this;
      const mobile = width < 720;
      return mobile
        ? {
            start: { x: width * 0.96, y: height * 0.78 },
            controlA: { x: width * 0.78, y: height * 0.72 },
            controlB: { x: width * 0.53, y: height * 0.34 },
            end: { x: width * 0.2, y: height * 0.29 },
            widthScale: 0.72
          }
        : {
            start: { x: width * 0.94, y: height * 0.82 },
            controlA: { x: width * 0.85, y: height * 0.64 },
            controlB: { x: width * 0.7, y: height * 0.27 },
            end: { x: width * 0.46, y: height * 0.2 },
            widthScale: 1
          };
    }

    cubicPoint(start, controlA, controlB, end, t) {
      const inverse = 1 - t;
      return {
        x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
        y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
      };
    }

    cubicDerivative(start, controlA, controlB, end, t) {
      const inverse = 1 - t;
      return {
        x: 3 * inverse ** 2 * (controlA.x - start.x) + 6 * inverse * t * (controlB.x - controlA.x) + 3 * t ** 2 * (end.x - controlB.x),
        y: 3 * inverse ** 2 * (controlA.y - start.y) + 6 * inverse * t * (controlB.y - controlA.y) + 3 * t ** 2 * (end.y - controlB.y)
      };
    }

    basePoint(t) {
      const geometry = this.geometry();
      return this.cubicPoint(geometry.start, geometry.controlA, geometry.controlB, geometry.end, t);
    }

    resolvePointer() {
      const pointerX = this.pointer.x * this.width;
      const pointerY = this.pointer.y * this.height;
      let nearestT = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index <= 28; index += 1) {
        const t = index / 28;
        const point = this.basePoint(t);
        const distance = (point.x - pointerX) ** 2 + (point.y - pointerY) ** 2;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestT = t;
        }
      }

      const geometry = this.geometry();
      const point = this.basePoint(nearestT);
      const derivative = this.cubicDerivative(geometry.start, geometry.controlA, geometry.controlB, geometry.end, nearestT);
      const length = Math.hypot(derivative.x, derivative.y) || 1;
      const normal = { x: -derivative.y / length, y: derivative.x / length };
      const normalDistance = (pointerX - point.x) * normal.x + (pointerY - point.y) * normal.y;
      this.pointer.pathPosition = nearestT;
      this.pointer.normalOffset = clamp(normalDistance, -105, 105);
    }

    pathPoint(t, lane, time) {
      const geometry = this.geometry();
      const point = this.cubicPoint(geometry.start, geometry.controlA, geometry.controlB, geometry.end, t);
      const derivative = this.cubicDerivative(geometry.start, geometry.controlA, geometry.controlB, geometry.end, t);
      const length = Math.hypot(derivative.x, derivative.y) || 1;
      const normal = { x: -derivative.y / length, y: derivative.x / length };
      const plumeWidth = lerp(7, Math.min(this.width, this.height) * 0.16, t) * geometry.widthScale;
      const ambient = Math.sin(time * 0.42 + t * 8.5 + lane * 1.7) * (2 + t * 11);
      const localInfluence = Math.exp(-(((t - this.pointer.pathPosition) / 0.16) ** 2));
      const pointerBend = this.pointer.normalOffset * 0.58 * localInfluence * this.pointer.strength;
      const pointerRipple = Math.sin((t - this.pointer.pathPosition) * 26 + time * 3.4) * 18 * localInfluence * this.pointer.strength;
      const broadSteer = (this.pointer.y - 0.5) * 42 * Math.sin(Math.PI * t) * this.pointer.strength;
      const offset = lane * plumeWidth + ambient + pointerBend + pointerRipple + broadSteer;
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
    }

    ribbonPath(center, thickness, time) {
      const { ctx } = this;
      ctx.beginPath();
      for (let index = 0; index <= 40; index += 1) {
        const t = index / 40;
        const point = this.pathPoint(t, center - thickness, time);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      for (let index = 40; index >= 0; index -= 1) {
        const t = index / 40;
        const point = this.pathPoint(t, center + thickness, time);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    }

    draw(time) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      const sceneTime = reducedMotion.matches ? 16 : time;
      ctx.clearRect(0, 0, width, height);

      this.pointer.x = lerp(this.pointer.x, this.pointer.targetX, 0.18);
      this.pointer.y = lerp(this.pointer.y, this.pointer.targetY, 0.18);
      this.pointer.strength = lerp(this.pointer.strength, this.pointer.targetStrength, 0.14);
      if (this.pointer.strength > 0.002 || this.pointer.targetStrength > 0) this.resolvePointer();

      const geometry = this.geometry();
      const bodyGradient = ctx.createLinearGradient(geometry.start.x, geometry.start.y, geometry.end.x, geometry.end.y);
      bodyGradient.addColorStop(0, "rgba(222, 112, 57, 0.78)");
      bodyGradient.addColorStop(0.42, "rgba(190, 137, 111, 0.52)");
      bodyGradient.addColorStop(0.74, "rgba(145, 151, 151, 0.38)");
      bodyGradient.addColorStop(1, "rgba(120, 158, 176, 0.22)");

      ctx.save();
      ctx.filter = `blur(${Math.max(10, width / 95)}px)`;
      [
        { center: 0, thickness: 0.92, alpha: 0.5 },
        { center: -0.28, thickness: 0.62, alpha: 0.34 },
        { center: 0.34, thickness: 0.57, alpha: 0.3 }
      ].forEach((ribbon) => {
        this.ribbonPath(ribbon.center, ribbon.thickness, sceneTime);
        ctx.globalAlpha = ribbon.alpha;
        ctx.fillStyle = bodyGradient;
        ctx.fill();
      });
      ctx.restore();

      ctx.save();
      ctx.filter = `blur(${Math.max(5, width / 260)}px)`;
      this.clouds.forEach((cloud) => {
        const life = (cloud.phase + sceneTime * 0.0045 * cloud.drift) % 1;
        const point = this.pathPoint(life, cloud.lane, sceneTime);
        const radius = lerp(8, Math.min(width, height) * 0.085, life) * cloud.size;
        const envelope = Math.sin(Math.PI * life);
        const warm = cloud.tone > life * 0.8;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, radius * cloud.stretch, radius * 0.62, -0.55 + life * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = warm
          ? `rgba(211, 127, 79, ${envelope * 0.075})`
          : `rgba(139, 172, 184, ${envelope * 0.062})`;
        ctx.fill();
      });
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      [
        { center: -0.36, thickness: 0.045, alpha: 0.3 },
        { center: -0.02, thickness: 0.038, alpha: 0.36 },
        { center: 0.34, thickness: 0.032, alpha: 0.24 }
      ].forEach((ribbon) => {
        this.ribbonPath(ribbon.center, ribbon.thickness, sceneTime);
        ctx.globalAlpha = ribbon.alpha;
        ctx.fillStyle = bodyGradient;
        ctx.fill();
      });

      this.motes.forEach((mote) => {
        const life = (mote.phase + sceneTime * mote.speed) % 1;
        const point = this.pathPoint(life, mote.lane, sceneTime);
        const alpha = Math.sin(Math.PI * life) * (0.34 + mote.tone * 0.35);
        ctx.beginPath();
        ctx.arc(point.x, point.y, mote.size * (0.75 + life * 0.65), 0, Math.PI * 2);
        ctx.fillStyle = mote.tone > 0.62
          ? `rgba(245, 172, 112, ${alpha})`
          : `rgba(178, 201, 207, ${alpha * 0.7})`;
        ctx.fill();
      });
      ctx.restore();

      const source = geometry.start;
      const sourceGlow = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, 74);
      sourceGlow.addColorStop(0, "rgba(255, 177, 104, 0.82)");
      sourceGlow.addColorStop(0.18, "rgba(218, 101, 48, 0.32)");
      sourceGlow.addColorStop(1, "rgba(191, 106, 61, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = sourceGlow;
      ctx.beginPath();
      ctx.arc(source.x, source.y, 74, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 191, 123, 0.96)";
      ctx.beginPath();
      ctx.arc(source.x, source.y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      this.sparks.forEach((spark, index) => {
        const life = (spark.phase + sceneTime * (0.06 + index * 0.003)) % 1;
        const x = source.x + spark.drift * (8 + life * 24) + Math.sin(sceneTime * 1.2 + index) * 3;
        const y = source.y - life * 66;
        ctx.beginPath();
        ctx.arc(x, y, spark.size * (1 - life * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248, 172, 102, ${(1 - life) * 0.72})`;
        ctx.fill();
      });
      ctx.restore();

      if (this.pointer.strength > 0.05) {
        const x = this.pointer.x * width;
        const y = this.pointer.y * height;
        ctx.strokeStyle = `rgba(223, 156, 109, ${this.pointer.strength * 0.22})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 22 + Math.sin(sceneTime * 2.2) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
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
        gradient.addColorStop(0, `rgba(196, 91, 43, ${0.18 + layer * 0.025})`);
        gradient.addColorStop(0.48, `rgba(201, 137, 94, ${0.13 + layer * 0.018})`);
        gradient.addColorStop(1, `rgba(120, 166, 184, ${0.06 + layer * 0.015})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(sourceX, sourceY);
        ctx.bezierCurveTo(width * 0.31, sourceY - height * 0.3 + offset - spread, width * 0.64, endY + height * 0.11 - spread, endX, endY - spread * 0.55);
        ctx.bezierCurveTo(width * 0.7, endY + spread * 1.3, width * 0.35, sourceY - height * 0.13 + offset + spread, sourceX, sourceY);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(235, 179, 129, 0.46)";
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
        ctx.fillStyle = fraction < 0.52 ? "rgba(235, 159, 106, 0.72)" : "rgba(145, 181, 194, 0.5)";
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
        gradient.addColorStop(0, `rgba(220, 111, 57, ${(0.2 + layer * 0.018) * dilution})`);
        gradient.addColorStop(0.48, `rgba(190, 137, 104, ${(0.13 + layer * 0.012) * dilution})`);
        gradient.addColorStop(1, `rgba(105, 151, 170, ${(0.08 + layer * 0.009) * dilution})`);
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
        const red = Math.round(lerp(219, 135, aged));
        const green = Math.round(lerp(126, 169, aged));
        const blue = Math.round(lerp(76, 182, aged));
        ctx.beginPath();
        ctx.ellipse(center.x, y, radius * 1.55, radius * 0.62, -0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * (seed.tone > 0.7 ? 0.17 : 0.1)})`;
        ctx.fill();
      });
      ctx.restore();

      ctx.strokeStyle = "rgba(223, 179, 137, 0.55)";
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
    const plume = new HeroPlumeSurface(canvas);
    const canInteract = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reducedMotion.matches;

    if (canInteract) {
      hero.addEventListener("pointermove", (event) => {
        const rect = hero.getBoundingClientRect();
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((event.clientY - rect.top) / Math.min(rect.height, window.innerHeight), 0, 1);
        plume.setPointer(x, y, true);
      }, { passive: true });

      hero.addEventListener("pointerleave", () => plume.setPointer(0.72, 0.44, false));
      hero.addEventListener("pointercancel", () => plume.setPointer(0.72, 0.44, false));
      window.addEventListener("blur", () => plume.setPointer(0.72, 0.44, false));
    }
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
      let next = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      steps.forEach((step) => {
        const rect = step.getBoundingClientRect();
        if (rect.top <= anchorY && rect.bottom > anchorY) {
          next = step;
          nearestDistance = -1;
          return;
        }
        if (nearestDistance < 0) return;
        const distance = Math.abs((rect.top + rect.bottom) / 2 - anchorY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          next = step;
        }
      });

      activate(next);
      if (next) {
        const activeRect = next.getBoundingClientRect();
        const progress = clamp((anchorY - activeRect.top) / Math.max(activeRect.height, 1), 0, 1);
        model.setProgress(progress);
      }
    };

    const queueSync = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(syncActiveStep);
    };

    window.addEventListener("scroll", queueSync, { passive: true });
    window.addEventListener("resize", queueSync);
    window.addEventListener("pageshow", queueSync);
    document.fonts?.ready.then(queueSync);
    motionToggle.addEventListener("click", () => {
      const paused = motionToggle.getAttribute("aria-pressed") !== "true";
      motionToggle.setAttribute("aria-pressed", String(paused));
      motionToggle.setAttribute("aria-label", paused ? "Resume research animation" : "Pause research animation");
      motionToggle.querySelector("span:first-child").textContent = paused ? "▶" : "Ⅱ";
      motionLabel.textContent = paused ? "Resume animation" : "Pause animation";
      model.setPaused(paused);
    });
    activate(steps[0]);
    queueSync();
    model.start();
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

  function setupContactPlume() {
    const canvas = document.querySelector("[data-contact-plume]");
    const plume = new PlumeSurface(canvas, {
      sourceX: 0.85,
      sourceY: 0.96,
      direction: -1,
      density: window.innerWidth < 720 ? 55 : 100,
      opacity: 0.6,
      showSource: false
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
  setupLab();
  setupContactPlume();
  setupMotionPreference();

  document.querySelector("[data-year]").textContent = new Date().getFullYear();
})();
