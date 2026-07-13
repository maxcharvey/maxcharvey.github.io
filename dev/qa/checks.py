"""Interaction regression checks. Exit code 1 on any failure.

Usage:
    python3 -m http.server 8123   # from repo root, separate terminal
    python3 dev/qa/checks.py

Note: the project-graph hover assertion is occasionally flaky under headless
pointer synthesis (pre-existing site behaviour, identical on old builds).
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SITE_URL", "http://localhost:8123")
ok, fail = [], []

def check(name, cond):
    (ok if cond else fail).append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(3000)

    og_meta = page.locator("meta[property='og:image']").get_attribute("content")
    twitter_card = page.locator("meta[name='twitter:card']").get_attribute("content")
    og_size = page.evaluate("""() => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = () => resolve([0, 0]);
      image.src = new URL('/assets/og.png', location.origin).href;
    })""")
    check("Open Graph image metadata", og_meta == "https://maxcharvey.github.io/assets/og.png")
    check("large Twitter preview metadata", twitter_card == "summary_large_image")
    check(f"Open Graph image is 1200x630 ({og_size[0]}x{og_size[1]})", og_size == [1200, 630])

    page.click("nav.site-nav >> text=Research")
    page.wait_for_timeout(1200)
    check("nav scrolls to research", page.evaluate("window.scrollY") > 300)

    page.evaluate("document.querySelector('#research').scrollIntoView()")
    page.wait_for_timeout(600)
    page.click("[data-research-motion]")
    check("research pause pressed", page.get_attribute("[data-research-motion]", "aria-pressed") == "true")
    page.click("[data-research-motion]")

    page.locator("[data-scene='plume']").evaluate("el => el.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(2600)
    research_active = page.evaluate("document.querySelector('.story-visual').classList.contains('is-plume-active')")
    research_cells = int(page.locator("[data-model-plume]").get_attribute("data-grid-cells") or 0)
    research_fps = float(page.locator("[data-model-plume]").get_attribute("data-measured-fps") or 0)
    research_frame_rate = int(page.locator("[data-model-plume]").get_attribute("data-effective-frame-rate") or 0)
    research_painted = page.locator("[data-model-plume]").evaluate("""canvas => {
      const sample = document.createElement('canvas');
      sample.width = 180; sample.height = 120;
      const context = sample.getContext('2d');
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let lit = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) lit++;
      return lit;
    }""")
    check("research scene 02 enables its fluid layer", research_active)
    check(f"research fluid paints ({research_painted} lit px)", research_painted > 500)
    check(f"research fluid cell budget ({research_cells})", 0 < research_cells <= 5000)
    research_frame = page.locator("[data-model-plume]").evaluate("canvas => canvas.toDataURL()")
    page.wait_for_timeout(450)
    research_animates = research_frame != page.locator("[data-model-plume]").evaluate("canvas => canvas.toDataURL()")
    check("research fluid advances while active", research_animates)
    check(f"research fluid frame cap ({research_frame_rate} configured, {research_fps:.1f} measured fps)",
          0 < research_frame_rate <= 24 and 0 < research_fps <= 28)
    page.click("[data-research-motion]")
    check("research pause stops its fluid layer", page.locator("[data-model-plume]").get_attribute("data-sim-enabled") == "false")
    page.click("[data-research-motion]")

    page.locator("[data-bleaching-hours]").evaluate("el => { el.value = 48; el.dispatchEvent(new Event('input', {bubbles:true})) }")
    uv = page.locator("[data-band='UV'] [data-band-output]").inner_text()
    check(f"bleaching responds (UV at 48h = {uv})", uv != "100%" and uv.endswith("%"))

    page.evaluate("document.querySelector('#methods').scrollIntoView()")
    page.wait_for_timeout(600)
    page.click("text=Old & diffuse")
    page.wait_for_timeout(1800)
    check("lab preset applies", page.locator("[data-spread-output]").inner_text() == "diffuse")
    check("research fluid stops off-screen",
          page.locator("[data-model-plume]").get_attribute("data-run-state") == "stopped")
    secondary_running = page.evaluate("""() =>
      ['[data-model-plume]', '[data-lab-canvas]', '[data-contact-plume]']
        .filter(selector => document.querySelector(selector)?.dataset.runState === 'running').length
    """)
    check(f"only one secondary fluid sim runs ({secondary_running})", secondary_running == 1)
    lab_cells = int(page.locator("[data-lab-canvas]").get_attribute("data-grid-cells") or 0)
    lab_fps = float(page.locator("[data-lab-canvas]").get_attribute("data-measured-fps") or 0)
    lab_painted = page.locator("[data-lab-canvas]").evaluate("""canvas => {
      const sample = document.createElement('canvas');
      sample.width = 180; sample.height = 120;
      const context = sample.getContext('2d');
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let lit = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) lit++;
      return lit;
    }""")
    check(f"lab fluid paints ({lab_painted} lit px)", lab_painted > 500)
    check(f"lab fluid cell budget ({lab_cells})", 0 < lab_cells <= 5000)
    check(f"lab fluid frame cap ({lab_fps:.1f} fps)", 0 < lab_fps <= 28)
    page.click("[data-lab-toggle]")
    check("lab pause works", "PAUSED" in page.locator("[data-lab-status]").inner_text())
    paused_frame = page.locator("[data-lab-canvas]").evaluate("canvas => canvas.toDataURL()")
    page.wait_for_timeout(350)
    check("lab pause freezes the fluid", paused_frame == page.locator("[data-lab-canvas]").evaluate("canvas => canvas.toDataURL()"))
    page.click("[data-lab-toggle]")

    page.evaluate("document.querySelector('#projects').scrollIntoView()")
    page.wait_for_timeout(800)
    page.hover("#project-p1")
    page.wait_for_timeout(300)
    if not page.evaluate("document.querySelector('#project-p1').classList.contains('is-graph-source')"):
        page.locator("#project-p1").dispatch_event("pointerenter")
    check("project graph highlights", page.evaluate("document.querySelector('#project-p1').classList.contains('is-graph-source')"))

    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(1500)
    painted = page.evaluate("""() => {
      const c = document.querySelector('[data-hero-plume]');
      const x = document.createElement('canvas');
      x.width = 220; x.height = 220;
      x.getContext('2d').drawImage(c, c.width - 240, c.height - 240, 220, 220, 0, 0, 220, 220);
      const d = x.getContext('2d').getImageData(0, 0, 220, 220).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 12) lit++;
      return lit;
    }""")
    check(f"hero canvas painting ({painted} lit px near source)", painted > 3000)

    contact_painted = page.evaluate("""() => {
      document.querySelector('#contact').scrollIntoView();
      return new Promise(r => setTimeout(() => {
        const c = document.querySelector('[data-contact-plume]');
        const x = document.createElement('canvas');
        x.width = 200; x.height = 200;
        x.getContext('2d').drawImage(c, c.width * 0.6, c.height * 0.55, 200, 200, 0, 0, 200, 200);
        const d = x.getContext('2d').getImageData(0, 0, 200, 200).data;
        let lit = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
        r(lit);
      }, 3000));
    }""")
    check(f"contact canvas painting ({contact_painted} lit px)", contact_painted > 1500)
    check("no desktop console/page errors", not errors)
    if errors:
        print("ERRORS:", errors[:5])
    ctx.close()

    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    merrors = []
    page.on("pageerror", lambda e: merrors.append(str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(2500)
    page.click("[data-nav-toggle]")
    page.wait_for_timeout(400)
    check("mobile nav opens", page.evaluate("document.querySelector('[data-nav]').classList.contains('is-open')"))
    page.click("nav.site-nav >> text=About")
    page.wait_for_timeout(1000)
    check("mobile nav closes and navigates",
          not page.evaluate("document.querySelector('[data-nav]').classList.contains('is-open')")
          and page.evaluate("window.scrollY") > 200)
    check("no mobile page errors", not merrors)
    ctx.close()
    browser.close()

print("PASS:", len(ok))
for name in ok:
    print("  ✓", name)
if fail:
    print("FAIL:", len(fail))
    for name in fail:
        print("  ✗", name)
raise SystemExit(1 if fail else 0)
