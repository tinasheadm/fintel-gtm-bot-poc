# Testing guide

Scenarios for exercising the Fintel tags through GTM. Every one of them can be verified
from the on-page debug drawer (`d`) plus GTM Preview.

Serve the harness with `./serve.sh` and use **http://www.fctest.test:8000/** — not
`localhost`. A `.fctest.test` cookie cannot be set from any other hostname; see
[local-domain-setup.md](local-domain-setup.md).

Before each run: **Reset test** in the drawer. It clears cookies and the stored order
ID and returns you to step 1, so you get a clean attribution rather than a repeat
conversion on an existing cookie.

---

## Baseline — the happy path

1. Open the landing page **via the tracking link generated on the Fintel Connect
   platform** — that link carries the `finteltag` click ID. The debug drawer's *Status*
   section shows the value that arrived and confirms the host can scope the cookie.
2. Drawer → **Cookies**: a Fintel cookie should be listed, carrying the publisher value.
3. Drawer → **Fintel network calls**: a request to `cdn.fintelconnect.com`.
4. Click through to offers → confirm the cookie is *still there* after navigating.
5. Apply → submit → thank-you.
6. Drawer → **Fintel network calls** now also shows `app.fintelconnect.com` and the
   pixel request. The order ID in the receipt should match the one in the pixel URL.
7. **Copy report** → save it. This is your reference run.

Record: cookie name and value, both request URLs, the order ID.

---

## Scenario matrix

| # | Scenario | How | What you're looking for |
|---|----------|-----|-------------------------|
| 1 | No click ID | Load `index.html` directly, not via the tracking link | Does attribution still set a cookie? With what value? This is unattributed traffic. |
| 2 | Direct-to-conversion | Reset, then go straight to `thank-you.html` | Pixel fires with no cookie — how does Fintel record an unattributed conversion? |
| 3 | Cookie expiry | Set the cookie, edit its expiry in DevTools → Application → Cookies, then convert | Confirms the 10-day window behaves |
| 4 | Repeat conversion | Convert twice on one cookie | Duplicate order IDs? Does Fintel dedupe? |
| 5 | Same order ID twice | Convert, back to thank-you with the same `?orderId=` | Dedup behaviour on a fixed ID |
| 6 | Blocked CDN | DevTools → Network → block `*fintelconnect.com*`, reload | Tag should log a clean console error, page should not break |
| 7 | Cookies disabled | Block third- *and* first-party cookies for the site | Attribution fails — does the pixel still fire? |
| 8 | Private window | Fresh incognito profile per run | Cleanest isolation between runs |
| 9 | Preview vs live | Same flow with and without GTM Preview | Confirms the debug banner isn't changing behaviour |
| 10 | Slow connection | DevTools → Network → Slow 3G | Race between the library loading and the pixel call |

---

## Bot / automation runs

The point of the POC: compare what the Fintel scripts see from a human session against
a driven one. The drawer's **Automation signals** section is the surface a detection
script reads.

### Baseline capture

Do a manual run in a normal browser and hit **Copy report**. Then repeat under each
automation setup below and diff the `automationSignals` block.

### Playwright

```bash
pip install playwright && playwright install chromium
```

```python
from playwright.sync_api import sync_playwright

# Paste the publisher tracking link generated on the Fintel Connect platform — it
# carries the finteltag click ID. Falling back to the bare landing page URL runs the
# same flow as unattributed traffic.
ENTRY = "http://www.fctest.test:8000/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)      # try headless=False too
    page = browser.new_page()

    page.goto(ENTRY)
    page.wait_for_timeout(2000)
    print("cookies after landing:", page.context.cookies())

    # Selectors target hrefs rather than link text, so copy changes don't break the run.
    page.click("section.band a[href='offers.html']")
    page.click(".product a[href='apply.html?pid=Rewards']")
    page.click("form#app-form button[type=submit]")
    page.wait_for_url("**/thank-you.html*")
    page.wait_for_timeout(2500)

    print("order id:", page.evaluate("window.__fcTestOrder.orderId"))
    print("signals:", page.evaluate("FCTest.botSignals()"))
    print("fintel calls:", page.evaluate("FCTest.getPersistedLog()"))
    browser.close()
```

`FCTest.botSignals()` and `FCTest.getPersistedLog()` are callable from any automation
tool that can evaluate JS, which makes the assertions straightforward.

### Variations worth running

- **headless vs headed** — the single biggest signal difference
- **`--disable-blink-features=AutomationControlled`** — hides `navigator.webdriver`
- **spoofed user agent** — a real Chrome UA on a headless binary
- **`playwright-stealth`** or equivalent — patches most of the obvious tells
- **realistic timing** — add waits and mouse movement between steps
- **a plain `curl` of the pages** — no JS runs at all, so no tag fires; useful as the
  floor case
- **many runs in sequence from one IP** — volumetric pattern rather than a per-session
  signal

### What to record per run

| Field | Where from |
|-------|-----------|
| `navigator.webdriver` | drawer / `FCTest.botSignals()` |
| headless in UA | same |
| driver keys present | same |
| plugin count, languages | same |
| cookie set? value? | drawer → Cookies |
| both Fintel requests present? | drawer → Fintel network calls |
| order ID | receipt on thank-you page |
| any Fintel-side response difference | DevTools → Network |

The harness has no view into what Fintel does server-side with these sessions — that
comparison has to come from the Fintel side. What this repo gives you is a controlled,
repeatable client that produces identical traffic apart from the automation variable
you're changing.

---

## Verifying without the drawer

```js
FCTest.botSignals()        // automation surface
FCTest.cookies()           // all cookies, parsed
FCTest.fcCookies()         // Fintel ones only
FCTest.getPersistedLog()   // every fintelconnect.com request this session
FCTest.generateOrderId()   // a fresh order ID
FCTest.resetAll()          // clear and restart the flow
dataLayer.filter(o => o.event && !o.event.startsWith('gtm.'))
```

The console also carries `[GTM][FC]` lines from the tags themselves and `[FCTest]` lines
for each intercepted request.

---

## Reminders

- Dummy data only — the repo is public and the form is prefilled with placeholders.
- Conversions hit the real Fintel program `24490`. Coordinate before bulk automated runs
  so the traffic isn't mistaken for production activity, and agree an order-ID prefix
  with whoever watches that program if you're generating a lot of them.
