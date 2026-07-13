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

    page.click("nav.site-nav >> text=Research")
    page.wait_for_timeout(1200)
    check("nav scrolls to research", page.evaluate("window.scrollY") > 300)

    page.evaluate("document.querySelector('#research').scrollIntoView()")
    page.wait_for_timeout(600)
    page.click("[data-research-motion]")
    check("research pause pressed", page.get_attribute("[data-research-motion]", "aria-pressed") == "true")
    page.click("[data-research-motion]")

    page.locator("[data-bleaching-hours]").evaluate("el => { el.value = 48; el.dispatchEvent(new Event('input', {bubbles:true})) }")
    uv = page.locator("[data-band='UV'] [data-band-output]").inner_text()
    check(f"bleaching responds (UV at 48h = {uv})", uv != "100%" and uv.endswith("%"))

    page.evaluate("document.querySelector('#methods').scrollIntoView()")
    page.wait_for_timeout(600)
    page.click("text=Old & diffuse")
    page.wait_for_timeout(400)
    check("lab preset applies", page.locator("[data-spread-output]").inner_text() == "diffuse")
    page.click("[data-lab-toggle]")
    check("lab pause works", "PAUSED" in page.locator("[data-lab-status]").inner_text())
    page.click("[data-lab-toggle]")

    page.evaluate("document.querySelector('#projects').scrollIntoView()")
    page.wait_for_timeout(800)
    page.hover("#project-p1")
    page.wait_for_timeout(300)
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
