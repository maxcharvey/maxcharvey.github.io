# maxcharvey.github.io — Project Vault Context

Personal academic site (static, no build step). Pushing to `main` deploys via the
`Deploy to GitHub Pages` action (~20 s). Bump the `?v=` query strings on
`styles.css` / `script.js` in `index.html` whenever those files change.

## Architecture

- `index.html` — all content. Sections: hero, research (`#research`), plume lab
  (`#methods`), projects (`#projects`, 4 inline SVG figures), outputs, about, contact.
- `styles.css` — design system; palette custom properties at `:root`.
- `script.js` — one IIFE:
  - `CanvasSurface` — base class: DPR cap (`data-max-dpr`), frame gate
    (`data-frame-rate`), ResizeObserver, IntersectionObserver (stops off-screen
    sims), reduced-motion single-draw.
  - `SmokePlumeSurface` — **the fluid smoke engine** (see below).
  - `HeroPlumeSurface` — thin subclass: interactive hero instance.
  - `ModelSurface` — research-scene canvas (particle/trajectory/grid plus quiet
    scene-02 annotations); `ResearchPlumeSurface` supplies scene 02's fluid.
  - `LabSurface` — third `SmokePlumeSurface` subclass; controls map directly to
    transit, jet, warmth decay, vorticity, guide width, and dissipation.
  - `setup*()` functions at the bottom wire everything.

## Fluid smoke engine (added 2026-07-13)

Stable-fluids solver on a coarse grid: semi-Lagrangian advection, Gauss–Seidel
pressure projection (open borders, p=0), vorticity confinement. Two advected
scalars: `den` (smoke) and `wrm` (warmth; fresh brown-carbon → aged blue-grey).
A precomputed **guide flow** along a cubic bezier spine (`heroSpine`,
`researchSpine`, `labSpine`, or `contactSpine`) holds the idle silhouette; the
**pointer is a soft obstacle
inside the pressure solve** (velocity constrained toward cursor velocity in a
disk + density cleared), which produces leading-edge compression, flank
splitting, curl shedding, and wake recombination. Rendering: grid-resolution
`ImageData` upscaled bilinearly + ~500 advected grain particles + static
radial-gradient envelope haze + ember source glow. **No `ctx.filter` anywhere
in the engine** (Safari compatibility + perf) — keep it that way.

Shared colour ramp `SMOKE_RAMP` (script.js): warmThin `216,144,97`, warmDense
`102,59,41`, coolThin `156,175,187`, coolDense `78,99,118`. Site palette vars:
`--ember #bf6a3d`, `--ember-soft #df9c6d`, `--sky #5b88a3`, `--sky-bright #8bb6c9`,
dusk navies `#0a0f15…#202b38`, paper `#f2eee5`.

Tuning knobs (all in `SmokePlumeSurface`):

| knob | value | effect |
|---|---|---|
| emission rate | 15.5·opts.emission /s | core density (~2–3 at source) |
| dissipation | 0.11 /s | plume lifetime (~15 s transit) |
| warm decay | +0.14 /s on `wrm` | how fast smoke cools/ages |
| stray decay | 0.55 /s off-guide | dissolves cursor-displaced smoke, kills strays |
| late decay | 1.6·(t−0.74) /s | dissolves plume head before it pools in corners |
| guide relax | 2.6 /s ·gK | silhouette adherence vs. freedom |
| buoyancy | 1.35·den | lift; raising it makes plume ignore the spine |
| vorticity eps | 3.6 | billow curl detail |
| obstacle radius | clamp(5.2 % min-dim, 34, 66) px | cursor barrier size |
| warm-up | 150 steps, 4/frame (all at once under reduced motion) | ignition fast-forward |
| perf tier | step EMA > 7.5 ms for 45 frames → rebuild at 0.62× cells, 24 fps | safety valve |

Instance options (`setupContactPlume` is the quiet reference): `emission`,
`alpha`, `coolBias`, `showSource`, `particleScale`, `envelopeAlpha`, `prefill`,
`maxCells`/`smallMaxCells` (16 500/8 600 hero; 9 000/6 000 contact; secondary
sims ≤4 700/3 600), `frameRate`, `geometry`, `seed`, plus default-preserving
physics overrides (`transitMultiplier`, `jetMultiplier`, `guideWidth`,
`guideRelax`, `buoyancy`, `vorticity`, `dissipation`, `warmDecay`,
`strayDecay`, `lateDecay`).

## Gotchas learned the hard way

- **Emission source must land inside the grid.** The contact spine originally
  started at y = 1.04·h → the splat was culled and only envelope haze rendered
  (no console error, looked "almost fine"). Now clamped in `applyEmission`, but
  keep spine starts ≤ ~0.99.
- **No node/npm on this machine.** QA runs on anaconda Python + Playwright
  driving installed Chrome: `python3 -m pip install playwright`, then
  `p.chromium.launch(channel="chrome")` — no browser download needed.
- Headless-Chrome hover on project cards sometimes attributes
  `pointerenter` oddly (`is-graph-linked` instead of `is-graph-source`).
  **Pre-existing** — identical on the pre-redesign build (verified via a temp
  `git worktree` served on a second port). Not a regression; occasionally flaky
  in checks.
- `prefers-reduced-motion` change triggers a full page reload
  (`setupMotionPreference`) — intentional.
- Hero interaction only enables at ≥768 px + hover + fine pointer
  (`interactionQuery` in `setupHeroPlume`); the hint line hides via CSS on
  coarse pointers/reduced motion.
- `data-frame-rate` is the base; `onResize` overrides to 24 fps on small
  screens/tier drop.
- `assets/hero-plume-concepts/*.png` (3 AI concept boards, 5.6 MB) are
  **deliberately untracked** — visual direction reference only; committing
  would publish them.

## QA workflow (run before every commit)

```bash
python3 -m http.server 8123          # from repo root
python3 dev/qa/shoot.py <outdir>     # desktop/mobile/reduced, pointer/wake, all sections, OG capture
python3 dev/qa/checks.py             # interactions, canvas paint/budget/fps, metadata, console errors
```

Inspect the screenshots (hero copy readable, plume renders idle *and* under
pointer, sections intact), require zero console errors, keep commits small and
revertable. Live-site sanity: `curl -s https://maxcharvey.github.io/script.js | grep -c SmokePlumeSurface`.

## State (2026-07-13)

`eda9c8e` fluid hero → `58ab7c5` site-wide grading (contact on engine, legacy
`PlumeSurface` removed, lab/model re-graded) → `2027b22` contact source fix.
Deployed and verified live. The visual-system roadmap below is implemented in
the current tree: fluid lab/research surfaces, print figures, small-surface
grading, and the generated social preview.

## Visual roadmap — implemented 2026-07-13

Implemented in visibility/impact order and QA-gated.

1. **Palette tokens — done.** Mirror `SMOKE_RAMP` as CSS custom properties
   (`--smoke-warm-thin` …) at `:root`; migrate hard-coded rgba() in CSS/SVG to
   them. Single source of truth before touching any figure.
2. **Lab console → real fluid — done.** Drive `[data-lab-canvas]` with a third
   `SmokePlumeSurface` instance and map controls to physics: age → warm-decay
   constant + sample position; wind → `transitSpeed`/jet; mixing → vorticity +
   guide radius growth + dissipation. Needs small engine extensions
   (parametrized transit/mixing, cheap `buildGuide()` rebuild on input —
   debounce sliders). Keep readouts, presets, pause, aircraft transect and
   h-labels (labels belong in this instrument view, not the hero). This makes
   the "interactive method" literally the same physics as the hero.
3. **Research scene 02 (plume) — done.** Replace the layered-bezier plume in
   `ModelSurface.drawPlume` with a quiet mini engine instance (≤5 k cells,
   24 fps, run only while scene active) or an engine-rendered static density
   snapshot. Re-grade scenes 01/03/04 glows/strokes to tokens; add sparse grain
   particles for material continuity. Never more than one non-hero sim animating
   per viewport.
4. **Project SVG figures (paper ground) — done.** Keep SVG (crisp, printable) but
   redraw as editorial print figures: ink `#22251f` strokes at unified 1 px,
   ramp-token fills, one shared `<defs>` gradient set, pseudo-density plume
   texture from 3–4 stacked translucent spine paths instead of flat wedges.
   Screenshot-check against parchment — the hero ramp needs higher chroma on
   light ground.
5. **Small surfaces — done.** Bleaching-widget band fills → ramp gradient (UV→red
   tinted parchment→ember→sky); outputs orbit + about portrait contours +
   favicon → token strokes/duotone.
6. **OG image — done.** Screenshot the hero canvas region at 1200×630 via the QA
   harness → `assets/og.png` + `og:image`/`twitter:card` meta, so link previews
   carry the brand.

Perf guardrails throughout: hero keeps priority; secondary sims ≤5 k cells @
24 fps, stopped when off-screen; no `ctx.filter`; verify with the fps probe in
`dev/qa/checks.py` if in doubt.
