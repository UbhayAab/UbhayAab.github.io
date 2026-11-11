# Safalta Setu website design

This folder contains the complete editable static website, published under
`/safalta-setu/`. It reuses the reviewed seven-page redesign without a framework
or build step. The original website repository remains separate and private.

## Source and page coverage

| Source | Purpose |
| --- | --- |
| `index.html` | Programme introduction, intended approach and contribution routes |
| `vision.html` | Mission, purpose and guiding principles |
| `programme.html` | Intended programme, audience and current development status |
| `get-involved.html` | Mentor, volunteer and institutional information |
| `contact.html` | Programme and participation status |
| `partners.html` | Preserved network and partnership route |
| `404.html` | Explicit recovery page with this publication's base path |

Every page uses the same `style.css`, `theme.js` and `script.js`. Both themes and
responsive compositions apply to every page, including recovery. `style.css`
owns semantic surface, text, action, border, focus and illustration tokens.
Fraunces headings and Atkinson Hyperlegible body type are loaded through the
Google Fonts stylesheet, with local system fallbacks. The bridge illustration
is authored markup and CSS. The original logo remains `logo.jpg`.

## Shared behavior

- Exactly Light and Dark, selected before first paint. Preference is remembered
  as `safalta-theme`; valid older `theme` values remain compatible. Storage
  failures leave the site usable. Theme colors change atomically.
- Responsive navigation has Menu/Close, Escape with focus return, link selection
  and outside-click dismissal. Wide-screen navigation stays directly available.
- Skip links, visible focus, semantic landmarks, headings, descriptive links and
  text status supplement the palette. Reduced motion disables smooth scrolling.
- There are no registration, donation or personal-data forms. Programme,
  safeguarding and participation details remain explicitly in development.

## Publication and validation

The reviewed source is from website commit
`e8769d7c53eb5cc860aa4789613012a09cc22bb1`. All twelve copied source blobs matched
that commit before the single path adaptation in `404.html`. `CNAME` and
`CNAME.txt` are deliberately excluded; portfolio, custom-domain settings and
repository visibility are unchanged.

The original design check covered 28 page/theme/width combinations at 390 and
1280 CSS pixels, 134 local links/anchors and fourteen text contrast pairs
(minimum 6.06). The publication adapter additionally checked 169 local links
and assets across seven pages, JavaScript syntax, phone menu/Escape and
cross-page Dark persistence at an observed 390 CSS pixels. These are local
checks; hosted release verification is recorded separately in the release PR.

GitHub Pages uses a site-wide fallback for unknown URLs. This subfolder's
`404.html` is an explicit recovery URL, not a replacement for the portfolio's
global fallback.
