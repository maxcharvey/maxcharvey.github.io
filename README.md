# Max Harvey | Academic website

Static personal academic site for <https://maxcharvey.github.io/>.

## Structure

- `index.html`: content, metadata, and page structure
- `styles.css`: complete responsive design system
- `script.js`: navigation, reveal effects, and canvas visualizations
- `assets/favicon.svg`: site mark
- `.github/workflows/pages.yml`: GitHub Pages deployment

No framework, package installation, or build step is required.

## Local preview

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173/>.

## Content updates

Search `index.html` for `Outputs / evolving` to add publications, talks, and a CV. The portrait placeholder is in the `about-aside` block. Core contact links appear in the hero, About, Contact, and footer sections.

## Deployment

Pushes to `main` deploy through the `Deploy to GitHub Pages` workflow. In repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.
