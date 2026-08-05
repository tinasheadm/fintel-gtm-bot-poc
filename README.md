# FC GTM Test Harness — Bot Detection POC

A throwaway four-page funnel for testing the Fintel Connect tracking scripts **when
they are deployed through Google Tag Manager**, the way a client would deploy them.
Built for the bot-detection POC.

The pages contain **no Fintel code**. Every Fintel script lives in a GTM Custom HTML
tag and is injected at runtime — that is the behaviour under test.

- **Container:** `GTM-WFD2R889`
- **Merchant ref:** `testmerchantFC`
- **Program ID:** `24490`
- Single domain, no subdomains, static HTML, no build step.

---

## The flow

| # | Page | dataLayer event | GTM tag that fires |
|---|------|-----------------|--------------------|
| 1 | [`index.html`](index.html) — landing | `fc_landing_view` | **FC – Attribution (Landing)** → `fcpixel.attribution(...)`, drops the 1st-party cookie |
| 2 | [`offers.html`](offers.html) — product list | `fc_offer_view` | *(none — proves the cookie survives a navigation)* |
| 3 | [`apply.html`](apply.html) — application form | `fc_application_start`, `fc_application_submit` | *(none by default)* |
| 4 | [`thank-you.html`](thank-you.html) — submitted | `fc_application_submitted` | **FC – Conversion Pixel (Thank You)** → `fcpixel.pxl(...)` |

Order IDs are generated on submit (`FC-<timestamp>-<6 chars>`), kept in
`sessionStorage`, and pushed to the dataLayer for the pixel tag to read. The pixel tag
carries its own fallback generator so it never posts an empty order ID.

## Getting started

**Run it locally**

```bash
cd fintel-gtm-bot-poc && python3 -m http.server 8000
```

Then open <http://localhost:8000>.

**Getting attributed traffic.** Register the landing page URL on the Fintel Connect
platform. The platform generates the publisher tracking link and appends the
`finteltag` click ID itself — don't invent one, because a made-up value won't resolve
to a publisher on the Fintel side. Reaching the landing page directly, with no
`finteltag`, is a legitimate test case: it's what unattributed traffic looks like.

**Or use the hosted copy** — see the Pages URL in the repo's About section once Pages
is enabled (Settings → Pages → Deploy from branch → `main` / root).

## Setting up GTM

Full walkthrough in **[docs/gtm-setup.md](docs/gtm-setup.md)**. The short version:

1. In GTM → **Admin → Import Container**, upload
   [`gtm/fc-bot-detection-poc.json`](gtm/fc-bot-detection-poc.json).
2. Choose the **Default** workspace and **Merge → Overwrite conflicting**.
3. Preview, walk the flow, publish.

The import brings in 2 tags, 2 triggers and 5 variables. Nothing else in the container
is touched.

## The debug drawer

Every page has one, bottom-right — click **FC Debug** or press `d`. It shows, live:

- whether GTM and `fcpixel` actually loaded
- **every request to `fintelconnect.com`**, persisted across the whole session
- all cookies, with Fintel ones highlighted
- the dataLayer events pushed on the page
- **automation signals** — `navigator.webdriver`, headless UA, driver keys, plugin
  count, languages, hardware concurrency, timezone, screen vs viewport

**Copy report** puts the whole lot on your clipboard as JSON, which is the quickest way
to diff a human run against a driven one.

The drawer only reports. It never blocks, scores or challenges anything, and it does
not alter what the Fintel scripts do.

## Cookie domain — read this before you debug a "missing cookie"

The production call scopes the cookie to `.fintelconnect.com`. A browser will not set a
cookie for a domain the page is not served from, so on GitHub Pages or localhost that
argument silently fails — and `.github.io` is a public suffix, which browsers refuse
outright.

The `FC - Cookie Domain` GTM variable resolves this per environment: `.fintelconnect.com`
on production hosts, the exact hostname everywhere else. Same tag, no edits between
environments. If you hardcode `.fintelconnect.com` while testing, expect no cookie.

## Repo layout

```
index.html  offers.html  apply.html  thank-you.html   the funnel
assets/fc-test-harness.js    dataLayer, order IDs, network+cookie instrumentation
assets/debug-panel.js        the on-page drawer
assets/styles.css
gtm/fc-bot-detection-poc.json    importable GTM container
gtm/generate-container.py        regenerates the above (python3, stdlib only)
docs/coworker-guide.md           self-contained guide to send to reviewers
docs/gtm-setup.md                GTM account, container, tag and access setup
docs/testing-guide.md            test scenarios incl. automated/bot runs
```

To change a tag, edit `gtm/generate-container.py` and re-run it — that keeps the tag
source reviewable in a diff rather than buried in a JSON blob:

```bash
python3 gtm/generate-container.py
```

## House rules

- Dummy data only. This repo is public and the form is prefilled with obvious
  placeholders — leave them alone. No real names, emails, or financial details.
- Test conversions hit the real Fintel program `24490`. Coordinate before bulk runs so
  nobody mistakes the traffic for production activity.
