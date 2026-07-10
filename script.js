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
      this.visible = true;
      this.running = false;
      this.lastFrame = 0;
      this.frame = this.frame.bind(this);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);

      this.visibilityObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible && !this.running) this.start();
      }, { rootMargin: "180px" });
      this.visibilityObserver.observe(canvas);
      requestAnimationFrame(() => this.resize());
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
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
      requestAnimationFrame(this.frame);
    }

    frame(now) {
      if (!this.running) return;
      const delta = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;
      this.draw(now / 1000, delta);

      if (this.visible && !document.hidden && !reducedMotion.matches) {
        requestAnimationFrame(this.frame);
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

  class ModelSurface extends CanvasSurface {
    constructor(canvas) {
      super(canvas);
      this.scene = "particle";
      this.previousScene = "particle";
      this.changedAt = performance.now();
    }

    setScene(scene) {
      if (scene === this.scene) return;
      this.previousScene = this.scene;
      this.scene = scene;
      this.changedAt = performance.now();
      if (!this.running) this.start();
    }

    draw(time) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      const elapsed = reducedMotion.matches ? 1 : (performance.now() - this.changedAt) / 700;
      const mix = clamp(elapsed, 0, 1);

      if (mix < 1 && this.previousScene !== this.scene) {
        ctx.save();
        ctx.globalAlpha = 1 - mix;
        this.drawScene(this.previousScene, time);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = mix;
      this.drawScene(this.scene, time);
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
      const pulse = 1 + Math.sin(time * 0.8) * 0.025;

      const beam = ctx.createLinearGradient(0, cy, cx, cy);
      beam.addColorStop(0, "rgba(139, 182, 201, 0)");
      beam.addColorStop(0.72, "rgba(139, 182, 201, 0.18)");
      beam.addColorStop(1, "rgba(223, 156, 109, 0.28)");
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
        ctx.beginPath();
        ctx.arc(nx * radius, ny * radius, size, 0, Math.PI * 2);
        ctx.fillStyle = index % 3 === 0 ? "rgba(139, 182, 201, 0.9)" : "rgba(255, 213, 171, 0.9)";
        ctx.fill();
      });
      ctx.restore();

      ctx.strokeStyle = "rgba(223, 156, 109, 0.34)";
      ctx.lineWidth = 1.2;
      for (let arc = 0; arc < 3; arc += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (1.14 + arc * 0.18), -0.85, 0.75);
        ctx.stroke();
      }
      for (let mote = 0; mote < 14; mote += 1) {
        const angle = mote / 14 * Math.PI * 2 + time * 0.035;
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
        const angle = ray / 10 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * 17, sunY + Math.sin(angle) * 17);
        ctx.lineTo(sunX + Math.cos(angle) * 25, sunY + Math.sin(angle) * 25);
        ctx.stroke();
      }

      for (let layer = 4; layer >= 0; layer -= 1) {
        const spread = height * (0.045 + layer * 0.024);
        const offset = (layer - 2) * height * 0.018;
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
        const fraction = (index / 46 + time * 0.012) % 1;
        const x = this.cubic(sourceX, width * 0.31, width * 0.64, endX, fraction);
        const center = this.cubic(sourceY, sourceY - height * 0.26, endY + height * 0.08, endY, fraction);
        const spread = height * (0.012 + fraction * 0.11);
        const y = center + Math.sin(index * 7.7 + time * 0.5) * spread;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (index % 4) * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = fraction < 0.52 ? "rgba(235, 159, 106, 0.58)" : "rgba(145, 181, 194, 0.38)";
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
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, sample.x, sample.y);
        ctx.stroke();
      }

      const moving = (time * 0.045) % 1;
      const movingX = this.cubic(source.x, width * 0.31, width * 0.56, sample.x, moving);
      const movingY = this.cubic(source.y, height * 0.75, height * 0.13, sample.y, moving);
      this.drawGlow(movingX, movingY, 18, "rgba(235, 179, 129, 0.25)");
      ctx.beginPath();
      ctx.arc(movingX, movingY, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(246, 190, 139, 0.96)";
      ctx.fill();

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
      ctx.beginPath();
      ctx.moveTo(cx - radius * 1.04, cy + radius * 0.46);
      ctx.bezierCurveTo(cx - radius * 0.38, cy + radius * 0.04, cx + radius * 0.2, cy + radius * 0.24, cx + radius * 1.05, cy - radius * 0.43);
      ctx.bezierCurveTo(cx + radius * 0.25, cy + radius * 0.02, cx - radius * 0.36, cy - radius * 0.1, cx - radius * 1.04, cy + radius * 0.46);
      ctx.fill();
      ctx.restore();

      const sites = [-2.45, -1.3, -0.18, 0.82, 2.06];
      sites.forEach((angle, index) => {
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
      this.seeds = Array.from({ length: 130 }, (_, index) => ({
        phase: index / 130,
        offset: Math.sin(index * 17.17),
        jitter: Math.sin(index * 8.73 + 2),
        size: 0.5 + (index % 11) / 13
      }));
    }

    draw(time, delta) {
      const { ctx, width, height } = this;
      if (!width || !height) return;
      if (!this.paused && !reducedMotion.matches) this.elapsed += delta;
      ctx.clearRect(0, 0, width, height);

      const sourceX = width * 0.08;
      const sourceY = height * 0.7;
      const reach = width * clamp(0.5 + this.wind / 23 + this.age / 250, 0.58, 0.94);
      const spread = height * (0.05 + this.mixing / 360);
      const lift = height * (0.23 + this.wind / 100);

      ctx.strokeStyle = "rgba(139, 182, 201, 0.08)";
      ctx.lineWidth = 1;
      for (let contour = 0; contour < 5; contour += 1) {
        ctx.beginPath();
        for (let step = 0; step <= 36; step += 1) {
          const fraction = step / 36;
          const x = fraction * width;
          const y = height * (0.2 + contour * 0.14) + Math.sin(fraction * 7 + contour * 1.7) * (8 + contour * 2);
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.setLineDash([2, 7]);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const windLength = 20 + this.wind * 1.5;
      ctx.strokeStyle = "rgba(139, 182, 201, 0.36)";
      ctx.fillStyle = "rgba(139, 182, 201, 0.52)";
      for (let arrow = 0; arrow < 4; arrow += 1) {
        const x = width * (0.16 + arrow * 0.19);
        const y = height * 0.16 + (arrow % 2) * 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + windLength, y - windLength * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + windLength, y - windLength * 0.3);
        ctx.lineTo(x + windLength - 6, y - windLength * 0.3 - 2);
        ctx.lineTo(x + windLength - 4, y - windLength * 0.3 + 4);
        ctx.closePath();
        ctx.fill();
      }

      const plumeGradient = ctx.createLinearGradient(sourceX, sourceY, sourceX + reach, sourceY - lift);
      plumeGradient.addColorStop(0, "rgba(211, 115, 63, 0.22)");
      plumeGradient.addColorStop(0.48, "rgba(175, 132, 101, 0.12)");
      plumeGradient.addColorStop(1, "rgba(91, 136, 163, 0.05)");
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY - 4);
      ctx.bezierCurveTo(width * 0.3, sourceY - lift * 0.06 - spread * 0.4, width * 0.56, sourceY - lift * 0.92 - spread, sourceX + reach, sourceY - lift - spread * 0.7);
      ctx.lineTo(sourceX + reach, sourceY - lift + spread * 0.85);
      ctx.bezierCurveTo(width * 0.55, sourceY - lift * 0.45 + spread, width * 0.3, sourceY + spread * 0.6, sourceX, sourceY + 4);
      ctx.closePath();
      ctx.fillStyle = plumeGradient;
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      this.seeds.forEach((seed, index) => {
        const speed = 0.025 + this.wind * 0.0011;
        const life = (seed.phase + this.elapsed * speed) % 1;
        const ageFade = clamp(1 - this.age / 105, 0.22, 0.98);
        const x = sourceX + life * reach;
        const plumeCenter = sourceY - Math.pow(life, 0.72) * lift;
        const y = plumeCenter + seed.offset * spread * (0.2 + life) + Math.sin(this.elapsed * 0.7 + index) * 3;
        const radius = (2.5 + life * 16) * seed.size;
        const alpha = Math.sin(Math.PI * life) * ageFade;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 1.5, radius * 0.65, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = index % 5 === 0
          ? `rgba(211, 126, 76, ${alpha * 0.13})`
          : `rgba(152, 173, 183, ${alpha * 0.09})`;
        ctx.fill();
      });
      ctx.restore();

      ctx.strokeStyle = "rgba(139, 182, 201, 0.26)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(sourceX, sourceY);
      ctx.bezierCurveTo(width * 0.32, sourceY - lift * 0.15, width * 0.55, sourceY - lift * 0.86, sourceX + reach, sourceY - lift);
      ctx.stroke();
      ctx.setLineDash([]);

      [0.25, 0.5, 0.75].forEach((fraction, index) => {
        const x = sourceX + reach * fraction;
        const y = sourceY - Math.pow(fraction, 0.72) * lift;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = index < 2 ? "rgba(223, 156, 109, 0.72)" : "rgba(139, 182, 201, 0.78)";
        ctx.fill();
        ctx.fillStyle = "rgba(152, 164, 170, 0.58)";
        ctx.font = "7px 'IBM Plex Mono', monospace";
        ctx.fillText(`${Math.round(this.age * fraction)} h`, x + 6, y - 7);
      });

      const sourceGlow = ctx.createRadialGradient(sourceX, sourceY, 0, sourceX, sourceY, 34);
      sourceGlow.addColorStop(0, "rgba(238, 157, 94, 0.5)");
      sourceGlow.addColorStop(1, "rgba(191, 106, 61, 0)");
      ctx.fillStyle = sourceGlow;
      ctx.beginPath();
      ctx.arc(sourceX, sourceY, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(223, 156, 109, 0.95)";
      ctx.beginPath();
      ctx.moveTo(sourceX - 4, sourceY + 5);
      ctx.quadraticCurveTo(sourceX - 7, sourceY - 5, sourceX, sourceY - 13);
      ctx.quadraticCurveTo(sourceX + 8, sourceY - 3, sourceX + 5, sourceY + 5);
      ctx.closePath();
      ctx.fill();

      const sampleX = sourceX + reach * clamp(this.age / 54, 0.15, 0.96);
      const sampleY = sourceY - Math.pow(clamp(this.age / 54, 0.15, 0.96), 0.72) * lift;
      ctx.strokeStyle = "rgba(231, 229, 218, 0.2)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(sampleX - 54, sampleY + 28);
      ctx.lineTo(sampleX + 56, sampleY - 28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(231, 229, 218, 0.7)";
      ctx.beginPath();
      ctx.arc(sampleX, sampleY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sampleX - 12, sampleY);
      ctx.lineTo(sampleX + 12, sampleY);
      ctx.moveTo(sampleX, sampleY - 12);
      ctx.lineTo(sampleX, sampleY + 12);
      ctx.stroke();
      ctx.fillStyle = "rgba(231, 229, 218, 0.8)";
      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.fillText("SAMPLE", clamp(sampleX + 12, 8, width - 54), sampleY + 3);
    }
  }

  function setupHeroPlume() {
    const canvas = document.querySelector("[data-hero-plume]");
    const hero = canvas.closest(".hero");
    const plume = new PlumeSurface(canvas, {
      sourceX: 0.84,
      sourceY: 0.83,
      direction: -1,
      density: window.innerWidth < 720 ? 90 : 180,
      showSource: true
    });

    hero.addEventListener("pointermove", (event) => {
      const rect = hero.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      plume.setPointer(x, y, true);
    }, { passive: true });

    hero.addEventListener("pointerleave", () => plume.setPointer(0.5, 0.5, false));
    plume.start();
  }

  function setupResearchScenes() {
    const canvas = document.querySelector("[data-model-canvas]");
    const label = document.querySelector("[data-scene-label]");
    const index = document.querySelector("[data-scene-index]");
    const kicker = document.querySelector("[data-scene-kicker]");
    const caption = document.querySelector("[data-scene-caption]");
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
    const toggle = document.querySelector("[data-lab-toggle]");
    const status = document.querySelector("[data-lab-status]");

    const sync = () => {
      lab.age = Number(age.value);
      lab.wind = Number(wind.value);
      lab.mixing = Number(mixing.value);
      ageOutput.textContent = `${lab.age} h`;
      ageLabel.textContent = `+${lab.age} H`;
      windOutput.textContent = `${lab.wind.toFixed(1)} m s⁻¹`;
      mixingOutput.textContent = `${lab.mixing}%`;
      distanceOutput.textContent = `${Math.round(lab.wind * lab.age * 3.6)} km`;
      absorptionOutput.textContent = Math.max(0.18, Math.exp(-lab.age / 70) * (1 - lab.mixing / 380)).toFixed(2);
      lab.draw(performance.now() / 1000, 0);
    };

    [age, wind, mixing].forEach((control) => control.addEventListener("input", sync));
    toggle.addEventListener("click", () => {
      lab.paused = !lab.paused;
      toggle.setAttribute("aria-pressed", String(lab.paused));
      toggle.innerHTML = lab.paused
        ? '<span aria-hidden="true">▶</span> Resume motion'
        : '<span aria-hidden="true">Ⅱ</span> Pause motion';
      status.textContent = lab.paused ? "PAUSED" : "PLAYING";
      if (!lab.paused) lab.start();
    });

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
