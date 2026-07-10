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
        opacity: options.opacity ?? 1
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

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = `blur(${Math.max(5, width / 230)}px)`;

      this.seeds.forEach((seed) => {
        const life = (seed.phase + stillTime * (0.009 + seed.size * 0.0018)) % 1;
        const envelope = Math.sin(Math.PI * life);
        const turbulence = Math.sin(stillTime * 0.34 + seed.wobble + life * 9) * (10 + life * 48);
        const pointerPull = this.pointer.active
          ? (this.pointer.y - 0.5) * 70 * life * (1 - Math.abs(this.pointer.x - life))
          : 0;
        const x = sourceX + direction * (life * travel + turbulence * 0.35 + seed.drift * life * 62);
        const y = sourceY - Math.pow(life, 0.76) * rise * seed.lift * 0.62 + turbulence + pointerPull;
        const radius = (4 + life * 48) * seed.size;
        const warm = seed.tone > 0.62;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = warm
          ? `rgba(211, 125, 73, ${envelope * 0.045 * this.options.opacity})`
          : `rgba(145, 163, 172, ${envelope * 0.034 * this.options.opacity})`;
        ctx.fill();
      });

      ctx.filter = "none";
      this.seeds.slice(0, 22).forEach((seed, index) => {
        const life = (seed.phase + stillTime * (0.024 + index * 0.00005)) % 1;
        if (life > 0.45) return;
        const x = sourceX + direction * life * travel * 0.48 + Math.sin(seed.wobble + time) * 20;
        const y = sourceY - life * rise * 0.72 + seed.drift * 16;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + seed.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(235, 164, 103, ${(1 - life / 0.45) * 0.5})`;
        ctx.fill();
      });
      ctx.restore();
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

    drawParticle(time) {
      const { ctx, width, height } = this;
      const cx = width * 0.52;
      const cy = height * 0.5;
      const base = Math.min(width, height) * 0.17;

      ctx.save();
      ctx.translate(cx, cy);
      for (let ring = 3; ring >= 0; ring -= 1) {
        const radius = base * (0.52 + ring * 0.18);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, `rgba(211, 126, 76, ${0.2 - ring * 0.025})`);
        gradient.addColorStop(0.7, `rgba(183, 101, 58, ${0.09 - ring * 0.012})`);
        gradient.addColorStop(1, "rgba(183, 101, 58, 0)");
        ctx.beginPath();
        ctx.arc(Math.sin(time * 0.35 + ring) * 8, Math.cos(time * 0.28 + ring) * 7, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(223, 156, 109, 0.48)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, base * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * Math.PI * 2 + time * 0.05;
        const radius = base * (0.38 + (index % 3) * 0.18);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, index % 3 === 0 ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = index % 3 === 0 ? "#df9c6d" : "rgba(225, 226, 219, 0.55)";
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(139, 182, 201, 0.42)";
      ctx.lineWidth = 1;
      for (let ray = 0; ray < 4; ray += 1) {
        const y = height * (0.2 + ray * 0.17);
        ctx.beginPath();
        ctx.moveTo(20, y);
        ctx.lineTo(cx - base * 1.1, y + Math.sin(time + ray) * 3);
        ctx.stroke();
      }
    }

    drawPlume(time) {
      const { ctx, width, height } = this;
      const sourceX = width * 0.12;
      const sourceY = height * 0.71;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let index = 0; index < 70; index += 1) {
        const seed = (index * 0.61803398875) % 1;
        const life = (seed + time * 0.018) % 1;
        const x = sourceX + life * width * 0.82;
        const centerY = sourceY - life * height * 0.42;
        const spread = 10 + life * height * 0.16;
        const y = centerY + Math.sin(index * 7.1 + time * 0.4) * spread * ((index % 7) / 7);
        const radius = 3 + life * 19 + (index % 5);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = index % 4 === 0
          ? `rgba(211, 126, 76, ${(1 - life) * 0.08})`
          : `rgba(154, 171, 179, ${(1 - life) * 0.055})`;
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(223, 156, 109, 0.85)";
      ctx.beginPath();
      ctx.arc(sourceX, sourceY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(193, 201, 204, 0.58)";
      ctx.fillText("SOURCE", sourceX + 10, sourceY + 3);
    }

    trajectoryPath(offset = 0) {
      const path = new Path2D();
      path.moveTo(-30, this.height * (0.75 + offset));
      path.bezierCurveTo(
        this.width * 0.3,
        this.height * (0.68 + offset),
        this.width * 0.46,
        this.height * (0.26 + offset),
        this.width * 1.06,
        this.height * (0.18 + offset)
      );
      return path;
    }

    drawTrajectory(time) {
      const { ctx, width, height } = this;
      const paths = [this.trajectoryPath(0), this.trajectoryPath(0.08), this.trajectoryPath(-0.07)];

      paths.forEach((path, index) => {
        ctx.strokeStyle = index === 0 ? "rgba(223, 156, 109, 0.66)" : "rgba(139, 182, 201, 0.28)";
        ctx.lineWidth = index === 0 ? 1.5 : 1;
        ctx.setLineDash(index === 0 ? [] : [2, 7]);
        ctx.stroke(path);
      });
      ctx.setLineDash([]);

      for (let index = 0; index < 9; index += 1) {
        const t = (index / 9 + time * 0.035) % 1;
        const x = t * width;
        const y = height * 0.75 - Math.sin(t * Math.PI * 0.88) * height * 0.49 + Math.sin(t * 7) * 7;
        ctx.beginPath();
        ctx.arc(x, y, index === 0 ? 4 : 2.2, 0, Math.PI * 2);
        ctx.fillStyle = index % 3 === 0 ? "#df9c6d" : "rgba(222, 226, 222, 0.72)";
        ctx.fill();
      }

      ctx.fillStyle = "rgba(223, 156, 109, 0.72)";
      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.fillText("t₀ / FIRE CONTACT", 18, height * 0.79);
      ctx.fillStyle = "rgba(139, 182, 201, 0.7)";
      ctx.fillText("t+ / SAMPLE", width - 88, height * 0.22);
    }

    drawGrid(time) {
      const { ctx, width, height } = this;
      const columns = 12;
      const rows = 9;
      const cellW = width / columns;
      const cellH = height / rows;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const dx = column / columns - 0.55;
          const dy = row / rows - 0.44;
          const wave = Math.sin(column * 0.68 + row * 0.46 + time * 0.35) * 0.08;
          const field = Math.exp(-(dx * dx * 7 + dy * dy * 12)) + wave;
          if (field < 0.08) continue;
          const warm = field > 0.44;
          ctx.fillStyle = warm
            ? `rgba(195, 103, 58, ${clamp(field * 0.25, 0, 0.27)})`
            : `rgba(91, 136, 163, ${clamp(field * 0.18, 0, 0.17)})`;
          ctx.fillRect(column * cellW + 1, row * cellH + 1, cellW - 2, cellH - 2);
        }
      }

      ctx.strokeStyle = "rgba(229, 228, 219, 0.12)";
      ctx.lineWidth = 1;
      ctx.stroke(this.trajectoryPath(-0.05));
      ctx.fillStyle = "rgba(223, 156, 109, 0.9)";
      const markerX = width * (0.5 + Math.sin(time * 0.23) * 0.14);
      const markerY = height * 0.43;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
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
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = index % 5 === 0
          ? `rgba(211, 126, 76, ${alpha * 0.09})`
          : `rgba(152, 173, 183, ${alpha * 0.065})`;
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

      ctx.fillStyle = "rgba(223, 156, 109, 0.9)";
      ctx.beginPath();
      ctx.arc(sourceX, sourceY, 4, 0, Math.PI * 2);
      ctx.fill();

      const sampleX = sourceX + reach * clamp(this.age / 54, 0.15, 0.96);
      const sampleY = sourceY - Math.pow(clamp(this.age / 54, 0.15, 0.96), 0.72) * lift;
      ctx.strokeStyle = "rgba(231, 229, 218, 0.7)";
      ctx.beginPath();
      ctx.arc(sampleX, sampleY, 8, 0, Math.PI * 2);
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
    const plume = new PlumeSurface(canvas, { sourceX: 0.08, sourceY: 0.82, density: window.innerWidth < 720 ? 90 : 180 });

    hero.addEventListener("pointermove", (event) => {
      const rect = hero.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      plume.setPointer(x, y, true);
      windReadout.textContent = `ENE · ${(5.5 + x * 4.2).toFixed(1)} m s⁻¹`;
      stateReadout.textContent = y < 0.45 ? "lofting / diluting" : "aging / dispersing";
    }, { passive: true });

    hero.addEventListener("pointerleave", () => plume.setPointer(0.5, 0.5, false));
    plume.start();
  }

  function setupResearchScenes() {
    const canvas = document.querySelector("[data-model-canvas]");
    const label = document.querySelector("[data-scene-label]");
    const steps = [...document.querySelectorAll("[data-scene]")];
    const model = new ModelSurface(canvas);
    const labels = {
      particle: "PARTICLE OPTICS",
      plume: "CHEMICAL AGING",
      trajectory: "AIR-MASS HISTORY",
      grid: "GLOBAL MODEL FIELD"
    };

    const activate = (step) => {
      steps.forEach((candidate) => candidate.classList.toggle("is-active", candidate === step));
      const scene = step.dataset.scene;
      label.textContent = labels[scene];
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
      opacity: 0.75
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
