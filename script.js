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

        ctx.font = "8px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(223, 210, 194, 0.48)";
        ctx.textAlign = direction > 0 ? "left" : "right";
        ctx.fillText("FIRE SOURCE / t₀", sourceX + direction * 14, sourceY + 22);
        ctx.textAlign = "left";
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

    drawPlotFrame(x, y, width, height, xLabel, yLabel) {
      const { ctx } = this;
      ctx.save();
      ctx.strokeStyle = "rgba(220, 224, 220, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();

      ctx.strokeStyle = "rgba(220, 224, 220, 0.07)";
      for (let tick = 1; tick < 4; tick += 1) {
        const tickX = x + width * tick / 4;
        const tickY = y + height * tick / 4;
        ctx.beginPath();
        ctx.moveTo(tickX, y);
        ctx.lineTo(tickX, y + height);
        ctx.moveTo(x, tickY);
        ctx.lineTo(x + width, tickY);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(159, 170, 175, 0.62)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(xLabel, x + width, y + height + 16);
      ctx.save();
      ctx.translate(x - 14, y);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "right";
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = "left";
      ctx.restore();
    }

    cubic(start, controlA, controlB, end, t) {
      const inv = 1 - t;
      return inv ** 3 * start + 3 * inv ** 2 * t * controlA + 3 * inv * t ** 2 * controlB + t ** 3 * end;
    }

    drawParticle(time) {
      const { ctx, width, height } = this;
      const cx = width * 0.29;
      const cy = height * 0.55;
      const base = Math.min(width, height) * 0.13;

      for (let ray = -2; ray <= 2; ray += 1) {
        const y = cy + ray * 21;
        const rayGradient = ctx.createLinearGradient(18, y, cx - base, y);
        rayGradient.addColorStop(0, "rgba(139, 182, 201, 0.06)");
        rayGradient.addColorStop(1, "rgba(139, 182, 201, 0.6)");
        ctx.strokeStyle = rayGradient;
        ctx.lineWidth = ray === 0 ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(18, y);
        ctx.lineTo(cx - base * 1.1, y + Math.sin(time * 0.7 + ray) * 3);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(cx, cy);
      const particleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, base * 1.35);
      particleGlow.addColorStop(0, "rgba(215, 122, 69, 0.42)");
      particleGlow.addColorStop(0.55, "rgba(191, 106, 61, 0.15)");
      particleGlow.addColorStop(1, "rgba(191, 106, 61, 0)");
      ctx.fillStyle = particleGlow;
      ctx.beginPath();
      ctx.arc(0, 0, base * 1.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      for (let point = 0; point <= 36; point += 1) {
        const angle = point / 36 * Math.PI * 2;
        const radius = base * (0.78 + Math.sin(angle * 5 + time * 0.2) * 0.08 + Math.cos(angle * 3) * 0.06);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(139, 78, 49, 0.28)";
      ctx.strokeStyle = "rgba(223, 156, 109, 0.62)";
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(223, 156, 109, 0.48)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, base * 1.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let index = 0; index < 11; index += 1) {
        const angle = index / 11 * Math.PI * 2 + time * 0.04;
        const radius = base * (0.2 + (index % 4) * 0.16);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, index % 3 === 0 ? 3.2 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = index % 3 === 0 ? "#df9c6d" : "rgba(225, 226, 219, 0.55)";
        ctx.fill();
      }
      ctx.restore();

      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(223, 156, 109, 0.76)";
      ctx.fillText("BrC-RICH PARTICLE", cx - base, cy + base * 1.55);

      const plotX = width * 0.54;
      const plotY = height * 0.34;
      const plotW = width * 0.37;
      const plotH = height * 0.38;
      this.drawPlotFrame(plotX, plotY, plotW, plotH, "WAVELENGTH / nm", "REL. ABS.");

      ctx.strokeStyle = "rgba(223, 156, 109, 0.88)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let step = 0; step <= 48; step += 1) {
        const fraction = step / 48;
        const x = plotX + fraction * plotW;
        const response = 0.12 + 0.82 * Math.exp(-fraction * 3.2);
        const y = plotY + plotH * (1 - response) + Math.sin(fraction * 12 + time * 0.5) * 1.5;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(139, 182, 201, 0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (let step = 0; step <= 48; step += 1) {
        const fraction = step / 48;
        const x = plotX + fraction * plotW;
        const response = 0.08 + 0.38 * Math.exp(-fraction * 1.8);
        const y = plotY + plotH * (1 - response);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(159, 170, 175, 0.62)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      [300, 500, 700].forEach((label, index) => {
        ctx.fillText(String(label), plotX + plotW * index / 2 - (index ? 8 : 0), plotY + plotH + 15);
      });
    }

    drawPlume(time) {
      const { ctx, width, height } = this;
      const plotX = 42;
      const plotY = height * 0.22;
      const plotW = width - 78;
      const plotH = height * 0.56;
      this.drawPlotFrame(plotX, plotY, plotW, plotH, "TRANSPORT AGE / h", "ALTITUDE");

      const centerY = plotY + plotH * 0.62;
      const plumeGradient = ctx.createLinearGradient(plotX, centerY, plotX + plotW, centerY);
      plumeGradient.addColorStop(0, "rgba(208, 109, 58, 0.36)");
      plumeGradient.addColorStop(0.48, "rgba(183, 127, 91, 0.2)");
      plumeGradient.addColorStop(1, "rgba(91, 136, 163, 0.1)");

      ctx.beginPath();
      ctx.moveTo(plotX, centerY - 5);
      ctx.bezierCurveTo(plotX + plotW * 0.28, centerY - plotH * 0.28, plotX + plotW * 0.63, centerY - plotH * 0.16, plotX + plotW, centerY - plotH * 0.34);
      ctx.lineTo(plotX + plotW, centerY + plotH * 0.22);
      ctx.bezierCurveTo(plotX + plotW * 0.68, centerY + plotH * 0.08, plotX + plotW * 0.34, centerY + plotH * 0.2, plotX, centerY + 5);
      ctx.closePath();
      ctx.fillStyle = plumeGradient;
      ctx.fill();

      ctx.strokeStyle = "rgba(223, 156, 109, 0.65)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(plotX, centerY);
      ctx.bezierCurveTo(plotX + plotW * 0.3, centerY - plotH * 0.08, plotX + plotW * 0.62, centerY - plotH * 0.02, plotX + plotW, centerY - plotH * 0.12);
      ctx.stroke();

      const hours = [0, 12, 24, 36, 48];
      hours.forEach((hour, index) => {
        const fraction = index / (hours.length - 1);
        const x = plotX + plotW * fraction;
        const y = centerY - plotH * (0.02 + fraction * 0.1) + Math.sin(fraction * Math.PI) * -plotH * 0.04;
        ctx.strokeStyle = "rgba(222, 225, 220, 0.18)";
        ctx.beginPath();
        ctx.moveTo(x, plotY + 8);
        ctx.lineTo(x, plotY + plotH);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, index === 0 ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = index < 3 ? "#df9c6d" : "#8bb6c9";
        ctx.fill();
        ctx.fillStyle = "rgba(159, 170, 175, 0.66)";
        ctx.font = "7px 'IBM Plex Mono', monospace";
        ctx.fillText(`${hour} h`, x - (index ? 8 : 0), plotY + plotH + 15);
      });

      const sunX = plotX + plotW * 0.78;
      const sunY = plotY + 34;
      ctx.strokeStyle = "rgba(223, 156, 109, 0.56)";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
      ctx.stroke();
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = ray / 8 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(angle) * 13, sunY + Math.sin(angle) * 13);
        ctx.lineTo(sunX + Math.cos(angle) * 18, sunY + Math.sin(angle) * 18);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(223, 156, 109, 0.66)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      ctx.fillText("PHOTOCHEMICAL BLEACHING", sunX - 54, sunY + 30);

      for (let index = 0; index < 36; index += 1) {
        const fraction = (index * 0.618033 + time * 0.008) % 1;
        const x = plotX + fraction * plotW;
        const spread = plotH * (0.03 + fraction * 0.13);
        const y = centerY - plotH * fraction * 0.1 + Math.sin(index * 8.2 + time * 0.3) * spread;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (index % 3), 0, Math.PI * 2);
        ctx.fillStyle = index % 4 === 0 ? "rgba(223, 156, 109, 0.48)" : "rgba(171, 186, 191, 0.3)";
        ctx.fill();
      }
    }

    drawTrajectory(time) {
      const { ctx, width, height } = this;
      const source = { x: width * 0.12, y: height * 0.76 };
      const sample = { x: width * 0.86, y: height * 0.25 };

      ctx.strokeStyle = "rgba(139, 182, 201, 0.11)";
      ctx.lineWidth = 1;
      for (let line = 0; line < 5; line += 1) {
        ctx.beginPath();
        ctx.moveTo(-20, height * (0.26 + line * 0.12));
        ctx.bezierCurveTo(width * 0.24, height * (0.1 + line * 0.14), width * 0.47, height * (0.5 + line * 0.06), width + 20, height * (0.16 + line * 0.13));
        ctx.stroke();
      }

      for (let member = 0; member < 9; member += 1) {
        const offset = (member - 4) / 4;
        const controlA = { x: width * (0.31 + offset * 0.02), y: height * (0.73 + offset * 0.08) };
        const controlB = { x: width * (0.55 + offset * 0.04), y: height * (0.16 + offset * 0.09) };
        ctx.strokeStyle = member === 4 ? "rgba(223, 156, 109, 0.78)" : `rgba(139, 182, 201, ${0.12 + (4 - Math.abs(member - 4)) * 0.025})`;
        ctx.lineWidth = member === 4 ? 1.7 : 0.9;
        ctx.setLineDash(member === 4 ? [] : [2, 6]);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, sample.x, sample.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const moving = (time * 0.04) % 1;
      const movingX = this.cubic(source.x, width * 0.31, width * 0.55, sample.x, moving);
      const movingY = this.cubic(source.y, height * 0.73, height * 0.16, sample.y, moving);
      ctx.beginPath();
      ctx.arc(movingX, movingY, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(235, 179, 129, 0.95)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(source.x, source.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#df9c6d";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sample.x, sample.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(139, 182, 201, 0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(223, 156, 109, 0.72)";
      ctx.fillText("FIRE CONTACT / t₀", source.x + 12, source.y + 3);
      ctx.fillStyle = "rgba(139, 182, 201, 0.7)";
      ctx.fillText("AIRCRAFT SAMPLE / t+", sample.x - 102, sample.y - 15);

      ctx.fillStyle = "rgba(159, 170, 175, 0.52)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      ctx.fillText("ENSEMBLE SPREAD", width * 0.43, height * 0.83);
    }

    drawGrid(time) {
      const { ctx, width, height } = this;
      const columns = 10;
      const rows = 7;
      const fieldX = 30;
      const fieldY = height * 0.23;
      const fieldW = width * 0.68;
      const fieldH = height * 0.56;
      const cellW = fieldW / columns;
      const cellH = fieldH / rows;

      ctx.fillStyle = "rgba(159, 170, 175, 0.62)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      ctx.fillText("AAOD / MODEL FIELD", fieldX, fieldY - 12);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const dx = column / columns - 0.55;
          const dy = row / rows - 0.44;
          const wave = Math.sin(column * 0.68 + row * 0.46 + time * 0.25) * 0.08;
          const field = Math.exp(-(dx * dx * 7 + dy * dy * 12)) + wave;
          const normalized = clamp(field, 0, 1);
          ctx.fillStyle = normalized > 0.42
            ? `rgba(195, 103, 58, ${0.08 + normalized * 0.35})`
            : `rgba(91, 136, 163, ${0.045 + normalized * 0.2})`;
          ctx.fillRect(fieldX + column * cellW + 1, fieldY + row * cellH + 1, cellW - 2, cellH - 2);
          ctx.strokeStyle = "rgba(224, 228, 224, 0.07)";
          ctx.strokeRect(fieldX + column * cellW + 0.5, fieldY + row * cellH + 0.5, cellW - 1, cellH - 1);
        }
      }

      const observations = [[0.18, 0.69], [0.34, 0.49], [0.5, 0.58], [0.62, 0.34], [0.76, 0.46], [0.86, 0.27]];
      observations.forEach(([xFraction, yFraction], index) => {
        const x = fieldX + fieldW * xFraction;
        const y = fieldY + fieldH * yFraction;
        ctx.beginPath();
        ctx.arc(x, y, 4 + (index % 2), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(14, 21, 29, 0.76)";
        ctx.fill();
        ctx.strokeStyle = index < 3 ? "rgba(223, 156, 109, 0.92)" : "rgba(139, 182, 201, 0.9)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      });

      const barX = width * 0.78;
      const barY = height * 0.36;
      const barW = width * 0.15;
      const values = [0.72, 0.54, 0.83, 0.61];
      ctx.fillStyle = "rgba(159, 170, 175, 0.56)";
      ctx.font = "7px 'IBM Plex Mono', monospace";
      ctx.fillText("MODEL / OBS", barX, barY - 14);
      values.forEach((value, index) => {
        const y = barY + index * 34;
        ctx.fillStyle = "rgba(220, 224, 220, 0.08)";
        ctx.fillRect(barX, y, barW, 7);
        ctx.fillStyle = index % 2 === 0 ? "rgba(223, 156, 109, 0.76)" : "rgba(139, 182, 201, 0.7)";
        ctx.fillRect(barX, y, barW * value, 7);
        ctx.fillStyle = "rgba(159, 170, 175, 0.54)";
        ctx.fillText(`S${index + 1}`, barX, y + 20);
        ctx.textAlign = "right";
        ctx.fillText(value.toFixed(2), barX + barW, y + 20);
        ctx.textAlign = "left";
      });

      ctx.fillStyle = "rgba(159, 170, 175, 0.52)";
      ctx.fillText("○ OBSERVATION", fieldX, fieldY + fieldH + 18);
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
    const windReadout = document.querySelector("[data-wind-readout]");
    const stateReadout = document.querySelector("[data-state-readout]");
    const monitorValue = document.querySelector("[data-monitor-value]");
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
      windReadout.textContent = `ENE · ${(5.5 + x * 4.2).toFixed(1)} m s⁻¹`;
      stateReadout.textContent = y < 0.45 ? "lofting / diluting" : "aging / dispersing";
      monitorValue.textContent = (0.54 + (1 - y) * 0.22 + x * 0.05).toFixed(2);
    }, { passive: true });

    hero.addEventListener("pointerleave", () => plume.setPointer(0.5, 0.5, false));
    plume.start();
  }

  function setupResearchScenes() {
    const canvas = document.querySelector("[data-model-canvas]");
    const label = document.querySelector("[data-scene-label]");
    const index = document.querySelector("[data-scene-index]");
    const kicker = document.querySelector("[data-scene-kicker]");
    const value = document.querySelector("[data-scene-value]");
    const unit = document.querySelector("[data-scene-unit]");
    const caption = document.querySelector("[data-scene-caption]");
    const axisLeft = document.querySelector("[data-axis-left]");
    const axisMid = document.querySelector("[data-axis-mid]");
    const axisRight = document.querySelector("[data-axis-right]");
    const legendA = document.querySelector("[data-legend-a]");
    const legendB = document.querySelector("[data-legend-b]");
    const steps = [...document.querySelectorAll("[data-scene]")];
    const model = new ModelSurface(canvas);
    const scenes = {
      particle: {
        index: "01",
        label: "PARTICLE OPTICS",
        kicker: "OPTICAL RESPONSE",
        value: "λ-dependent",
        unit: "absorption efficiency",
        caption: "Organic chromophores absorb more strongly toward shorter wavelengths.",
        axis: ["300 nm", "wavelength", "700 nm"],
        legend: ["absorbing fraction", "incident light"]
      },
      plume: {
        index: "02",
        label: "CHEMICAL AGING",
        kicker: "BLEACHING STATE",
        value: "t + 24 h",
        unit: "evolving plume cross-section",
        caption: "Sunlight, oxidants, and phase state alter absorption during transport.",
        axis: ["emission", "transport age", "48 h"],
        legend: ["fresh absorbing aerosol", "aged aerosol"]
      },
      trajectory: {
        index: "03",
        label: "AIR-MASS HISTORY",
        kicker: "ENSEMBLE PATHS",
        value: "45 members",
        unit: "transport uncertainty",
        caption: "A trajectory ensemble connects candidate fire contact to the aircraft sample.",
        axis: ["fire contact", "back trajectory", "sample"],
        legend: ["central path", "ensemble spread"]
      },
      grid: {
        index: "04",
        label: "GLOBAL MODEL FIELD",
        kicker: "MODEL / OBSERVATION",
        value: "ΔAAOD",
        unit: "closure diagnostic",
        caption: "Point observations test whether the gridded model field produces credible optics.",
        axis: ["model grid", "spatial evaluation", "observations"],
        legend: ["simulated absorption", "observation site"]
      }
    };

    const activate = (step) => {
      steps.forEach((candidate) => candidate.classList.toggle("is-active", candidate === step));
      const scene = step.dataset.scene;
      const metadata = scenes[scene];
      index.textContent = metadata.index;
      label.textContent = metadata.label;
      kicker.textContent = metadata.kicker;
      value.textContent = metadata.value;
      unit.textContent = metadata.unit;
      caption.textContent = metadata.caption;
      axisLeft.textContent = metadata.axis[0];
      axisMid.textContent = metadata.axis[1];
      axisRight.textContent = metadata.axis[2];
      legendA.textContent = metadata.legend[0];
      legendB.textContent = metadata.legend[1];
      model.setScene(scene);
    };

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activate(visible.target);
    }, { rootMargin: "-32% 0px -37%", threshold: [0.05, 0.25, 0.5, 0.75] });

    steps.forEach((step) => observer.observe(step));
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
