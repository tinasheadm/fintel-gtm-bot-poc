# FC GTM Test Harness — Bot Detection POC

A throwaway four-page funnel for testing the Fintel Connect tracking scripts **when
they are deployed through Google Tag Manager**, the way a client would deploy them.
Built for the bot-detection POC.

The pages contain **no Fintel code**. Every Fintel script lives in a GTM Custom HTML
tag and is injected at runtime — that is the behaviour under test.

- **Container:** `GTM-WFD2R889`
- **Merchant ref:** `testmerchantFC`
- **Program ID:** `24490`
- **Dev test host:** `www.fctest.com` via `/etc/hosts` — cookie domain `.fctest.com`
- Static HTML, one host, no build step.

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

**Run it** — one-time hosts entry, then serve:

```bash
echo '127.0.0.1 www.fctest.com testmerchant.fctest.com' | sudo tee -a /etc/hosts
```

```bash
./serve.sh
```

Then open <http://www.fctest.com:8000/>. Full explanation in
[docs/local-domain-setup.md](docs/local-domain-setup.md).

**Getting attributed traffic.** Register the landing page URL on the Fintel Connect
platform. The platform generates the publisher tracking link and appends the
`finteltag` click ID itself — don't invent one, because a made-up value won't resolve
to a publisher on the Fintel side. Reaching the landing page directly, with no
`finteltag`, is a legitimate test case: it's what unattributed traffic looks like.

**Hosted copy** — none. The harness runs locally on `www.fctest.com` so attribution can
be tested without DNS. A publicly hosted copy would need a host under a domain we
control; see the cookie domain note below for why that matters.

## Why a hosts entry, not just localhost

The attribution call scopes its cookie to a domain, and a browser only accepts a cookie
scoped to a domain the page is **actually served from**:

```js
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", ".fctest.com");
```

Serve from `localhost` or a `github.io` URL and ask for a `.fctest.com` cookie, and the
browser discards it silently — the tag looks like it fired cleanly and no cookie exists.
That is the most common false negative in this test.

Mapping `www.fctest.com` to `127.0.0.1` in `/etc/hosts` makes the browser treat the page
as genuinely on `fctest.com`, so the cookie is accepted exactly as in production. It's
local to your machine, overrides public DNS, and needs no DNS administrator.

> `fctest.com` is registered to a third party and resolves to real servers. The hosts
> entry overrides that locally, which is what makes this safe — but don't point real
> traffic at it or publish a copy there.

The `FC - Cookie Domain` GTM variable resolves the right value per host, so one tag
covers every environment:

| Host | Cookie domain |
|---|---|
| `*.fctest.com` | `.fctest.com` — dev testing |
| `*.fintelconnect.com` | `.fintelconnect.com` — production |
| anything else | the exact hostname — cookie is written but won't attribute |

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

If the attribution tag fires but no cookie appears, check the hostname in the debug
drawer's **Status** section first. It reports whether the current host can scope the
cookie at all. Nine times out of ten the answer is that the page was opened on
`localhost` instead of `www.fctest.com`.

## Repo layout

```
index.html  offers.html  apply.html  thank-you.html   the funnel
serve.sh                         local server on www.fctest.com
assets/fc-test-harness.js    dataLayer, order IDs, network+cookie instrumentation
assets/debug-panel.js        the on-page drawer
assets/styles.css
gtm/fc-bot-detection-poc.json    importable GTM container
gtm/generate-container.py        regenerates the above (python3, stdlib only)
docs/coworker-guide.md           self-contained guide to send to reviewers
docs/local-domain-setup.md       .fctest.com hosts-file setup, no DNS needed
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
