# FC GTM Test Harness — guide for reviewers

**Purpose:** a disposable four-page website used to test the Fintel Connect tracking
scripts *when they are deployed through Google Tag Manager*, the way a real client
deploys them. Built for the bot-detection POC.

**Key point:** the pages contain **no Fintel code**. Every Fintel script lives in a GTM
Custom HTML tag and is injected into the page at runtime. That indirection is the thing
being tested — how our scripts behave when a client fires them from a GTM container
rather than hardcoding them.

| | | |
|---|---|---|
| Landing page | <https://testmerchant.fintelconnect.com/> | ⏳ awaiting DNS |
| Source code | <https://github.com/tinasheadm/fintel-gtm-bot-poc> | ✅ live |
| GTM container | `GTM-WFD2R889` | |
| Merchant ref | `testmerchantFC` | |
| Fintel program ID | `24490` | |

> **The landing page needs a DNS record before it resolves.** The source code link works
> now. The landing page needs a `CNAME` record for `testmerchant.fintelconnect.com`
> pointing at `tinasheadm.github.io`, added by whoever administers fintelconnect.com DNS.
> The `CNAME` file is already committed to the repo.
>
> **It has to be a fintelconnect.com host — this is not a preference.** The attribution
> call scopes its cookie to `.fintelconnect.com`, and a browser only accepts a cookie
> scoped to a domain the page is actually served from. Hosted anywhere else the cookie is
> silently rejected and no attribution happens, so the test measures nothing.

---

## 1. The flow

Four static pages on one host, no build step. They are styled as a normal
financial-product marketing site so the session presents a realistic commercial surface
to the tracking scripts and to anything profiling it.

| # | Page | dataLayer event pushed | GTM tag that fires |
|---|------|------------------------|--------------------|
| 1 | `index.html` — landing | `fc_landing_view` | **FC – Attribution (Landing)** |
| 2 | `offers.html` — product list | `fc_offer_view` | none, deliberately |
| 3 | `apply.html` — application form | `fc_application_start`, `fc_application_submit` | none by default |
| 4 | `thank-you.html` — submitted | `fc_application_submitted` | **FC – Conversion Pixel** |

Step 2 exists on purpose: it forces the attribution cookie to survive a navigation
before the pixel reads it on step 4. If the cookie is scoped too narrowly it disappears
here, which is exactly the failure we want to catch.

### Getting attributed traffic

The landing page URL is registered on the Fintel Connect platform. **The platform
generates the publisher tracking link and appends the `finteltag` click ID itself** —
don't hand-write a `?finteltag=` value, because a made-up ID won't resolve to a real
publisher on the Fintel side.

Arriving at the landing page directly, with no click ID, is a valid test case too — it
is what unattributed traffic looks like. The debug drawer's **Status** section shows the
`finteltag` value that actually arrived, plus whether the current host can scope the
attribution cookie at all, so you can confirm the link worked.

---

## 2. The scripts under test

### Step 1 — attribution, on the landing page

Creates the first-party cookie holding the publisher's information.

```js
// library: https://cdn.fintelconnect.com/scripts/fcanalytics/v1.js
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", COOKIE_DOMAIN);
//                   query param   ^days  ^model  ^merchant ref
```

### Step 2 — conversion pixel, on the thank-you page

Creates the record in Fintel's system and uses the cookie to attribute the publisher.

```js
// library: https://app.fintelconnect.com/assets/scripts/fcanalytics.js
fcpixel.pxl(24490, orderID, pid, "", 0, 0, "", "testmerchantFC");
//          ^program        ^product                ^merchant ref
```

### Two things we changed from the reference snippets, and why

**1. The libraries are loaded programmatically instead of `<script src>` + inline
call.** The supplied snippets pair a `<script src>` tag with an inline `<script>` that
calls `fcpixel` immediately. That ordering relies on GTM's `document.write` shim, which
is fragile inside a Custom HTML tag — and it breaks outright when `document.write`
support is disabled, which you want off for page-speed reasons. Both tags now attach
the call to the script's `onload`:

```js
var s = document.createElement("script");
s.src = LIB;
s.async = false;
s.onload = run;                     // fcpixel is guaranteed to exist by now
s.onerror = function () { console.error("[GTM][FC] failed to load " + LIB); };
document.head.appendChild(s);
```

The arguments passed to Fintel are unchanged. The benefit is that a blocked CDN — ad
blocker, CSP, corporate proxy — produces a clean console error instead of an
uncaught `fcpixel is not defined`.

**2. The cookie domain is resolved per environment.** The call scopes the cookie to
`.fintelconnect.com`, which is exactly why the harness is served from
`testmerchant.fintelconnect.com` — that value is only valid on a fintelconnect.com host.
The same pages also get run on localhost and on the plain `github.io` URL during
development, where the browser would reject it. So the tag reads a GTM variable rather
than a literal:

```js
function () {
  var host = document.location.hostname || "";
  if (/(^|\.)fintelconnect\.com$/i.test(host)) return ".fintelconnect.com";
  return host;   // GitHub Pages, localhost, staging — scope to the exact host
}
```

Same tag in every environment, no edits between them. On
`testmerchant.fintelconnect.com` it returns `.fintelconnect.com` and attribution works.
Anywhere else it falls back to the exact hostname, so a cookie is still written and the
rest of the flow stays testable — but that cookie **will not attribute on the Fintel
platform**. **If you're debugging a conversion that didn't attribute, check the hostname
first.**

---

## 3. What's in the GTM container

Two tags, two triggers, five variables. Everything is importable from
`gtm/fc-bot-detection-poc.json` in the repo.

**Tags** — both Custom HTML, firing option *Once per event*, `document.write` off:

- `FC – Attribution (Landing)` → fires on `CE - fc_landing_view`
- `FC – Conversion Pixel (Thank You)` → fires on `CE - fc_application_submitted`

**Triggers** — both Custom Event, matching the event name with *equals*.

**Variables:**

| Name | Type | Value |
|---|---|---|
| `DLV - orderId` | Data Layer Variable | `orderId` |
| `DLV - pid` | Data Layer Variable | `pid` |
| `FC - Merchant Ref` | Constant | `testmerchantFC` |
| `FC - Program ID` | Constant | `24490` |
| `FC - Cookie Domain` | Custom JavaScript | see above |

### Reviewing the tag code

You do **not** need GTM access to review the tags. The tag bodies live in
`gtm/generate-container.py`, which generates the importable JSON — so the code is
readable in a normal diff on GitHub instead of being buried in a JSON blob. Regenerate
with:

```bash
python3 gtm/generate-container.py
```

### Order IDs

Generated when the application form is submitted, in the format
`FC-<13-digit timestamp>-<6 chars>` (e.g. `FC-1785938373146-5TYSZ3`). The alphabet
excludes `I`, `O`, `0` and `1` so IDs can be read aloud without ambiguity. The ID is
held in `sessionStorage` and pushed to the dataLayer for the pixel tag to read.

The pixel tag carries its own fallback generator, so firing it manually — without going
through the form — still produces a valid ID rather than posting an empty one.

---

## 4. Getting GTM access

Ask the container owner for **`Read`** access to `GTM-WFD2R889`. They'll need the Google
account email you want it on. What `Read` gets you:

- ✅ open the container, inspect every tag, trigger and variable
- ✅ view version history
- ❌ edit anything, create a workspace, or publish
- ❌ **run Preview mode**

That last one matters: a `Read` user can review the tag code but cannot watch tags fire
in Tag Assistant. **If you need to see the tags firing live, ask for `Edit` instead of
`Read`.** With `Edit`, work in your own workspace — GTM allows 3 concurrent workspaces
on the free tier, and sharing one means overwriting each other's changes.

---

## 5. Running a test

Open the landing page and walk the flow: landing → offers → apply → submit.

### The debug drawer

Every page has one, bottom-right. Click **FC Debug** or press `d`. It shows, live:

- whether GTM and `fcpixel` actually loaded
- **every request to `fintelconnect.com`**, kept across the whole session
- all cookies, with Fintel ones highlighted
- the dataLayer events pushed on the page
- **automation signals** — `navigator.webdriver`, headless user agent, Selenium/Phantom
  driver keys, plugin count, languages, hardware concurrency, timezone, screen vs
  viewport

**Copy report** puts all of it on your clipboard as JSON. That's the fastest way to diff
a human session against an automated one — capture a manual run first, then compare.

**Reset test** clears cookies and the stored order ID and returns you to step 1. Use it
between runs, otherwise you're testing a repeat conversion on an existing cookie rather
than a fresh attribution.

The drawer only *reports*. It never blocks, scores or challenges traffic, and it does
not change what the Fintel scripts do.

### What a good run looks like

1. Landing → a Fintel cookie appears in the drawer, and a request to
   `cdn.fintelconnect.com` is logged.
2. Offers → the cookie is **still there** after navigating.
3. Submit → thank-you page shows the order ID, and the drawer logs a request to
   `app.fintelconnect.com`.
4. The order ID on the receipt matches the one in the pixel request.

### From the console

```js
FCTest.botSignals()        // the automation surface a detection script sees
FCTest.cookies()           // all cookies, parsed
FCTest.fcCookies()         // Fintel ones only
FCTest.getPersistedLog()   // every fintelconnect.com request this session
FCTest.resetAll()          // clear and restart the flow
```

These are callable from any automation tool that can evaluate JavaScript, which makes
Playwright/Puppeteer assertions straightforward. The console also carries `[GTM][FC]`
lines from the tags themselves and `[FCTest]` lines for each intercepted request.

Full scenario matrix — blocked CDN, cookies disabled, repeat conversions, headless vs
headed, stealth plugins — is in `docs/testing-guide.md`.

---

## 6. Ground rules

- **Dummy data only.** The repo is public and the form is prefilled with obvious
  placeholders. Leave them. No real names, emails, or financial details.
- **Test conversions hit the real Fintel program `24490`.** Coordinate before any bulk
  automated run so the traffic isn't mistaken for production activity, and agree an
  order-ID prefix with whoever monitors that program.
- The harness has no visibility into what Fintel does server-side with these sessions.
  That side of the comparison has to come from the Fintel platform. What this gives you
  is a controlled, repeatable client that produces identical traffic apart from the one
  variable you're changing.
