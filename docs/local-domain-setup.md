# Testing on .fctest.com without DNS

The dev-team test domain is **`.fctest.com`**. Every developer sets it up on their own
machine in about a minute. No DNS administrator, no hosting, no certificate.

## Why a hosts entry rather than a real domain

The attribution call ends with a cookie domain:

```js
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", ".fctest.com");
```

A browser only accepts a cookie scoped to a domain the page is **actually served from**.
Loading the harness from `localhost`, `127.0.0.1` or a `github.io` URL and asking for a
`.fctest.com` cookie gets you nothing — the browser discards it without an error, the
attribution tag appears to fire cleanly, and no cookie exists. That is the single most
common way this test silently produces a false negative.

Mapping `www.fctest.com` to `127.0.0.1` in `/etc/hosts` makes the browser believe it
really is on `fctest.com`, so the cookie is accepted exactly as it would be in
production. The mapping is local to your machine and overrides public DNS.

> **`fctest.com` is registered to someone else.** It currently resolves to
> `13.223.25.84` / `54.243.117.197`. Your hosts entry overrides that locally, which is
> what makes this safe and self-contained — but never point real traffic at
> `fctest.com`, and don't publish a copy of the harness there. It isn't ours.

## Setup

**1. Add the hosts entry** (once per machine):

```bash
echo '127.0.0.1 www.fctest.com testmerchant.fctest.com' | sudo tee -a /etc/hosts
```

macOS and Linux both use `/etc/hosts`. On Windows it's
`C:\Windows\System32\drivers\etc\hosts`, edited as Administrator, same line format.

**2. Start the server** from the repo root:

```bash
./serve.sh
```

It refuses to start with a clear message if the hosts entry is missing, then serves on
port 8000.

**3. Open the landing page:**

```
http://www.fctest.com:8000/
```

Confirm it worked in the debug drawer (press `d`) — the **Status** section shows the
hostname and whether the current host can scope the attribution cookie. The **Cookies**
section should list a Fintel cookie once the GTM tag fires.

## Notes

- **The port doesn't matter.** Cookies ignore port numbers, so `.fctest.com` on
  `:8000` behaves exactly like `:80`. Use port 80 if you want the bare hostname, but
  that needs `sudo ./serve.sh 80`.
- **HTTP, not HTTPS.** Serving locally over plain HTTP is fine here: the cookie carries
  no `Secure` flag, and the Fintel and GTM libraries load over HTTPS from their own
  origins, which browsers permit on an HTTP page. If you need to test `Secure` cookie
  behaviour specifically, that needs a real certificate and is out of scope for this
  setup.
- **Everyone tests the same build.** The repo is the source of truth; each developer
  serves their own checkout. Pull before a test round so you're not comparing runs
  across different revisions.
- **GTM Preview works against this.** Enter `http://www.fctest.com:8000/` as the URL in
  Tag Assistant. The container is fetched from Google over HTTPS regardless of how the
  page is served.

## Undoing it

```bash
sudo sed -i '' '/fctest\.com/d' /etc/hosts
```

Drop the `''` after `-i` on Linux.

## Production, for reference

On a real `*.fintelconnect.com` host the `FC - Cookie Domain` variable returns
`.fintelconnect.com` on its own — no tag edit, no hosts file. This local setup exists
only so the dev team can exercise attribution without waiting on DNS.
