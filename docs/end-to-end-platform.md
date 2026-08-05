# End-to-end testing through the Fintel Connect platform

There are two ways to run this harness, and they are not interchangeable. Picking the
wrong one is the main way to waste a day.

| | Local dev testing | Platform end-to-end |
|---|---|---|
| Host | `www.fctest.test:8000` | `tinasheadm.github.io/fintel-gtm-bot-poc/` |
| Reachable from the internet | **No** | **Yes** |
| Cookie domain | `.fctest.test` | `tinasheadm.github.io` (host-scoped) |
| Publisher tracking link works | No | **Yes** |
| Setup | `/etc/hosts` entry per machine | Enable GitHub Pages once |
| Use it for | tags, flow, bot signals, cookie mechanics | full attribution through the platform |

## Why `.test` cannot be used with the platform

`.test` is reserved by [RFC 6761](https://www.rfc-editor.org/rfc/rfc6761) and is
guaranteed never to resolve on the public internet. That is exactly what makes it safe
for local work — no stray request can escape to a stranger's server, and no one can ever
register it.

It is also what makes it useless to the platform. Register
`http://www.fctest.test:8000/` as a landing page and Fintel will generate a tracking link
pointing at a hostname that exists only inside your own machine. Every click on it fails
DNS resolution, for you and for everyone else.

```
$ host www.fctest.test
Host www.fctest.test not found: 3(NXDOMAIN)
```

The same applies to `localhost` and `127.0.0.1`. **A landing page registered on the
platform has to be publicly reachable.** There is no way around that.

## Choosing a domain the platform can reach

Requirements: publicly resolvable, HTTPS, stable enough to register on the platform, and
available without a DNS administrator.

| Option | Reachable | Cost / setup | Cookie can be dotted? |
|---|---|---|---|
| **`tinasheadm.github.io`** (GitHub Pages) | ✅ | free, one click, repo already public | ❌ host-scoped only |
| `*.netlify.app` / `*.pages.dev` | ✅ | free, but a new account + deploy pipeline | ❌ host-scoped only |
| ngrok / Cloudflare Tunnel to your laptop | ✅ | free-tier URL changes each session; laptop must stay up | ❌ host-scoped only |
| A domain you buy | ✅ | ~$10/yr + DNS setup | ✅ |
| `*.fintelconnect.com` | ✅ | needs the DNS admin you can't reach | ✅ |
| `.test` / `localhost` | ❌ | — | — |

**GitHub Pages is the answer** — it's free, the URL is stable, the repo is already public,
and it's one setting away.

### Why none of the free options give a dotted cookie domain

`github.io`, `netlify.app`, `pages.dev` and `ngrok-free.app` are all on the
[Public Suffix List](https://publicsuffix.org/). Browsers refuse to set a cookie scoped
to a public suffix — that's the rule that stops one GitHub Pages site from writing a
cookie readable by every other one. So on any shared free host you can only ever get a
**host-scoped** cookie (`tinasheadm.github.io`, no leading dot).

That is a property of shared hosting, not a flaw in the harness, and for a single-host
funnel it makes no practical difference — see the section below. A dotted domain like
`.fintelconnect.com` requires a domain you actually control.

## The unblocked path: GitHub Pages

The repository is already public, so this needs no DNS administrator and no hosting
budget — one setting, then it's live.

**1. Enable Pages**

<https://github.com/tinasheadm/fintel-gtm-bot-poc/settings/pages>

- Source: **Deploy from a branch**
- Branch: **`main`**, folder: **`/ (root)`**
- **Save**

First build takes a minute or two. A 404 immediately after saving is normal.

**2. Confirm it's live**

```
https://tinasheadm.github.io/fintel-gtm-bot-poc/
```

Open the debug drawer (`d`) → **Status**. It reports the hostname and what the
attribution cookie can be scoped to.

**3. Register that URL on the Fintel Connect platform** as the landing page for
merchant `testmerchantFC`, and let the platform generate the publisher tracking link.

**4. Run the flow through the tracking link** — landing → offers → apply → submitted.
The `finteltag` click ID arrives on the landing page, the attribution tag writes the
cookie, and the pixel on the confirmation page reports the conversion against program
`24490`.

## What differs from production, and whether it matters

On the Pages URL the `FC - Cookie Domain` variable returns the exact hostname
(`tinasheadm.github.io`) rather than a leading-dot domain like `.fintelconnect.com`.

**For this funnel that should behave identically.** The cookie is still first-party, all
four pages are on the same host, and the pixel reads the cookie client-side on that same
host before reporting. A leading-dot domain only becomes load-bearing when a funnel
spans subdomains — landing on `www.merchant.com`, converting on `apply.merchant.com` —
which this one does not.

> **One thing to confirm with whoever owns `fcanalytics`:** this reasoning is based on
> how first-party cookies work, not on reading the library's source. If `fcpixel` does
> anything that depends on the cookie's `domain` attribute specifically — rather than
> just reading it back — a host-scoped cookie could behave differently. Worth a
> five-minute check before you treat a Pages run as a full production rehearsal.

If it turns out a `.fintelconnect.com` cookie is genuinely required end-to-end, the only
answer is a host under `fintelconnect.com`, which needs the DNS record this setup was
built to avoid. Nothing in the harness changes — the GTM variable already returns
`.fintelconnect.com` on any `*.fintelconnect.com` host.

## The attribution call, per environment

The deployed tag never contains a literal — it reads the `FC - Cookie Domain` variable,
which resolves the right value per host. These are the calls it produces:

```js
// Local dev, served from www.fctest.test
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", ".fctest.test");

// Platform end-to-end, served from GitHub Pages
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", "tinasheadm.github.io");

// Production, served from any *.fintelconnect.com host
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", ".fintelconnect.com");
```

Note the Pages one has **no leading dot** — it's a host, not a domain. Adding a dot, or
using `.github.io`, makes the browser reject the cookie outright.

The conversion pixel is identical everywhere; it doesn't take a domain:

```js
fcpixel.pxl(24490, orderID, pid, "", 0, 0, "", "testmerchantFC");
```

## Which to use when

- **Building or debugging a tag, checking the flow, comparing bot signals** → local, on
  `www.fctest.test`. Faster, private, no publishing.
- **Proving attribution works from a real publisher link, demoing to stakeholders,
  validating what the platform records** → GitHub Pages.

Both run the identical build from the same repository. The only difference is where it
is served from and, consequently, what the cookie is scoped to.

---

# Findings from the first live run (5 Aug 2026)

Diagnosing why no cookie appeared after clicking a QA-sandbox tracking link. Recorded
here because several of these are not obvious and will come up again.

## The blocker: the GTM container was published but empty

Fetching the live container directly:

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-WFD2R889" | grep -c fcpixel
# 0
```

A valid, published container (~320 KB) with **zero** occurrences of `fcpixel`,
`fcanalytics`, `fintelconnect`, `fc_landing_view` or `fc_application_submitted`. The
tags were never in the live version, so nothing fired, no library loaded, and no cookie
could exist — matching an entirely empty Application tab.

**Importing is not publishing.** A container import lands in a *workspace*. Until you
click **Submit → Publish**, the live container that browsers fetch is unchanged. This is
the single most likely cause any time "the tag doesn't fire".

Verify from the command line before debugging anything else — the grep above should
return a non-zero count.

## The tracking link itself is fine

```
https://api.qa3.fintelsandbox.com/t/l/HqFNXsGFX
  → 301 → https://tinasheadm.github.io/fintel-gtm-bot-poc/
          ?finteltag=62326338&mproduct=YarBarProd&publisherid=24489
          &publishername=Test%20Publisher&fclid=AAAAA7cGQv75eppyA1MReM2z3kTXdLg
```

The redirect works, the landing page returns 200, and `finteltag` arrives. Nothing wrong
on this side.

## What the attribution library actually does

Read from the shipped `v1.js`, which settles the cookie-domain question:

```js
document.cookie = "FcAtrId=" + id + ";"
    + (domain === "" ? "" : "domain=" + domain + ";")
    + "expires=...; path=/; SameSite=Strict";
```

- The cookie is named **`FcAtrId`**.
- Passing `""` as the domain **omits the attribute entirely**, host-scoping the cookie.
  That is now what the `FC - Cookie Domain` variable returns off our own domains — it
  cannot be rejected, unlike a mismatched explicit domain.
- `fcpixel.pxl()` reads the cookie back with a plain lookup for `FcAtrId` and never
  inspects its domain. **A host-scoped cookie therefore attributes identically to a
  dotted one** for a single-host funnel. The caveat previously flagged in this document
  is resolved.
- The cookie is `SameSite=Strict`. It is written by our own page after the redirect, so
  the cross-site hop does not prevent it.

## Environment: use the production link

The first run used a QA3 sandbox link (`api.qa3.fintelsandbox.com`) while the tags load
production libraries — a mismatch. **The scripts in this harness are the production
ones, so the tracking link must be a production link too:**

```
https://api.fintelconnect.com/t/l/<code>
```

There is no sandbox build of the attribution library —
`app.qa3.fintelsandbox.com/scripts/fcanalytics/v1.js` returns an HTML SPA fallback, not
JavaScript, and the sandbox-hosted pixel is byte-identical to production and posts to
`api.fintelconnect.com` anyway. Production end to end is the supported path.

## Identifiers, confirmed from the redirect

The production link's 307 response settles what the numbers mean:

```
set-cookie: fintelTag-24490=a-27733b-24749c-
set-cookie: clickId-24490=86765804
location:   ...?finteltag=86765804&utm_campaign=a-27733b-24749c-
```

| Value | Meaning |
|---|---|
| **24490** | The **program ID** — the platform names its own cookies after it. `FC - Program ID` is correct as shipped; do not change it to the ad ID. |
| **24749** | The **ad ID**, carried inside the campaign string as `b-24749`. Not an argument to `pxl()`. |
| **27733** | The publisher, as `a-27733`. |
| `finteltag` | The click ID, fresh on every click of the link. |

The platform also drops its own `HttpOnly; Secure` cookies on `api.fintelconnect.com`
during the redirect. Those are separate from the first-party `FcAtrId` cookie our
attribution tag writes on the landing page host — don't confuse the two when debugging.

## `pid` is never hardcoded

The product an ad points at changes, so no product name is fixed anywhere in this
harness or in the GTM tags. **`24490` is the only constant.** The pid is resolved per
session, in this order:

1. **`mproduct` on the landing URL** — the platform's own product parameter. It appears
   only on the first hop, so it is captured there and persisted for the session.
2. **An ad-sourced product is sticky.** Once step 1 has fired, an in-funnel link such as
   `apply.html?pid=Rewards` cannot replace it. Without that rule the harness's own
   navigation would silently overwrite the product the ad actually pointed at.
3. **`pid` on the current URL** — a product chosen inside the funnel, when no ad supplied
   one.
4. **Empty.** The pixel tag does not substitute a default; it reports an empty product
   and logs a console warning. Inventing a product would be worse than reporting none.

On the application page, a product that came from the ad is shown and locked, with the
dropdown disabled — the generic products exist only for standalone tag testing.

Verified across three journeys: an ad carrying `mproduct` (product survives the whole
funnel including a deliberate clobber attempt), an ad without one (funnel selection is
used), and a direct visit (stays empty).

## The attribution library fingerprints the device

`v1.js` dynamically imports **FingerprintJS v4** from `fpjscdn.net`. Directly relevant
to the bot-detection POC: device fingerprinting is already part of the attribution path,
so any automated run is being profiled by that library before our own signals are
considered. Worth factoring into the test plan.
