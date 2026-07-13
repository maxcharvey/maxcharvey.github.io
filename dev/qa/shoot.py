"""Screenshot + console-error harness.

Usage:
    python3 -m http.server 8123   # from repo root, separate terminal
    python3 dev/qa/shoot.py <outdir> [tag]

Requires: pip install playwright (drives installed Chrome via channel="chrome";
no browser download needed). Set SITE_URL to target another origin.
"""
import math
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SITE_URL", "http://localhost:8123")
outdir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "qa-shots")
outdir.mkdir(parents=True, exist_ok=True)
tag = ("-" + sys.argv[2]) if len(sys.argv) > 2 else ""

def collect(page, sink):
    page.on("console", lambda m: sink.append(f"[console.{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: sink.append(f"[pageerror] {e}"))

report = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)

    # ---------- Desktop ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    errs = []
    collect(page, errs)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(4500)
    page.screenshot(path=outdir / f"desktop-hero-idle{tag}.png")

    # pointer sweep straight through the smoke column, then hold inside it
    page.mouse.move(1360, 830)
    for i in range(55):
        t = i / 54
        page.mouse.move(1360 - t * 380, 830 - t * 430 + 60 * math.sin(t * math.pi * 2))
        page.wait_for_timeout(30)
    for i in range(25):
        page.mouse.move(1150 + 3 * math.sin(i / 4), 480 + 2 * math.cos(i / 5))
        page.wait_for_timeout(33)
    page.screenshot(path=outdir / f"desktop-hero-pointer{tag}.png")
    for i in range(12):
        page.mouse.move(1150 - i * 55, 480 - i * 6)
        page.wait_for_timeout(16)
    page.wait_for_timeout(1100)
    page.screenshot(path=outdir / f"desktop-hero-wake{tag}.png")

    for anchor, name in [("#research", "research"), ("#methods", "methods"), ("#projects", "projects"), ("#contact", "contact")]:
        page.evaluate(f"document.querySelector('{anchor}').scrollIntoView()")
        page.wait_for_timeout(2200)
        page.screenshot(path=outdir / f"desktop-{name}{tag}.png")

    page.evaluate("document.querySelector('#methods').scrollIntoView()")
    page.wait_for_timeout(800)
    page.locator("[data-age]").evaluate("el => { el.value = 60; el.dispatchEvent(new Event('input', {bubbles:true})) }")
    page.wait_for_timeout(700)
    report.append(f"lab distance after age=60: {page.locator('[data-distance-output]').inner_text()}")
    page.screenshot(path=outdir / f"desktop-lab-aged{tag}.png")

    report.append(f"DESKTOP console/page errors: {len(errs)}")
    report += errs
    ctx.close()

    # ---------- Mobile ----------
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True)
    page = ctx.new_page()
    merrs = []
    collect(page, merrs)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(4500)
    page.screenshot(path=outdir / f"mobile-hero{tag}.png")
    for anchor, name in [("#methods", "methods"), ("#contact", "contact")]:
        page.evaluate(f"document.querySelector('{anchor}').scrollIntoView()")
        page.wait_for_timeout(2200)
        page.screenshot(path=outdir / f"mobile-{name}{tag}.png")
    report.append(f"MOBILE console/page errors: {len(merrs)}")
    report += merrs
    ctx.close()

    # ---------- Reduced motion ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    rerrs = []
    collect(page, rerrs)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(2500)
    page.screenshot(path=outdir / f"desktop-hero-reduced{tag}.png")
    report.append(f"REDUCED-MOTION console/page errors: {len(rerrs)}")
    report += rerrs
    ctx.close()
    browser.close()

print("\n".join(report))
print("done ->", outdir)
