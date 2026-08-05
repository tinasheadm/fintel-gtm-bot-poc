# Testing on .fctest.test without DNS

> **This setup is for local development only.** `.test` never resolves on the public
> internet, so the Fintel Connect platform cannot reach it and a publisher tracking link
> pointing here will fail for everyone. For end-to-end testing through the platform, see
> [end-to-end-platform.md](end-to-end-platform.md).

The dev-team test domain is **`.fctest.test`**. Every developer sets it up on their own
machine in about a minute. No DNS administrator, no hosting, no certificate.

## Why a hosts entry rather than a real domain

The attribution call ends with a cookie domain:

```js
fcpixel.attribution("finteltag", 10, "last", "testmerchantFC", ".fctest.test");
```

A browser only accepts a cookie scoped to a domain the page is **actually served from**.
Loading the harness from `localhost`, `127.0.0.1` or a `github.io` URL and asking for a
`.fctest.test` cookie gets you nothing — the browser discards it without an error, the
attribution tag appears to fire cleanly, and no cookie exists. That is the single most
common way this test silently produces a false negative.

Mapping `www.fctest.test` to `127.0.0.1` in `/etc/hosts` makes the browser believe it
really is on `fctest.test`, so the cookie is accepted exactly as it would be in
production. The mapping is local to your machine and overrides public DNS.

> **`.test` can never be registered by anyone.** It is reserved by
> [RFC 6761](https://www.rfc-editor.org/rfc/rfc6761) and is guaranteed not to resolve on
> the public internet, so there is no real site behind this name and no way for a stray
> request to reach a third party. That is why it is a better test domain than a
> plausible-looking `.com` — with a real domain, a missing hosts entry silently loads
> someone else's website instead of failing.

## Setup

**1. Add the hosts entry** (once per machine):

```bash
echo '127.0.0.1 www.fctest.test testmerchant.fctest.test' | sudo tee -a /etc/hosts
```

macOS and Linux both use `/etc/hosts`. On Windows it's
`C:\Windows\System32\drivers\etc\hosts`, edited as Administrator, same line format.

**2. Start the server** from the repo root:

```bash
python3 serve.py
```

`serve.py` works on macOS, Linux and Windows. On a Unix shell you can use `./serve.sh`
instead — same thing, bash only.

Either one refuses to start if the test hostname doesn't resolve to your machine, and
prints the fix. That check is deliberate: without it you would be testing a build whose
cookies silently vanish.

**3. Open the landing page:**

```
http://www.fctest.test:8000/
```

Confirm it worked in the debug drawer (press `d`) — the **Status** section shows the
hostname and whether the current host can scope the attribution cookie. The **Cookies**
section should list a Fintel cookie once the GTM tag fires.

## Rolling this out to the dev team

Every developer runs their **own** copy. `127.0.0.1` is their machine, so there is no
shared URL and no server to maintain — but it does mean each person completes the setup
once. What they need:

| Requirement | Notes |
|---|---|
| The repo | `git clone https://github.com/tinasheadm/fintel-gtm-bot-poc.git` |
| Python 3 | Preinstalled on macOS and most Linux. Windows: python.org or the Store. |
| **Permission to edit the hosts file** | `sudo` on macOS/Linux, Administrator on Windows. **This is the one that actually blocks people** — locked-down corporate laptops often prevent it, and some endpoint-security agents revert changes to the hosts file silently. Check this before promising a timeline. |

Everything else is shared and needs no per-developer setup: the GTM container
(`GTM-WFD2R889`) is fetched from Google, and the Fintel libraries come from their own
CDN.

### Consequences of everyone sharing one container and one program

- **One GTM container.** A change one person publishes affects everyone's next run. Have
  each person work in their own workspace and keep publish rights with one owner.
- **One Fintel program (`24490`).** Every developer's test conversions land in the same
  program, mixed together. Agree an order-ID convention before a coordinated round, or
  the results are hard to attribute back to whoever generated them.
- **Cookies are per-machine and per-browser profile.** That is helpful — runs are
  naturally isolated — but it also means nobody can reproduce your cookie state from
  their own machine. Share the drawer's **Copy report** JSON instead.

### If a developer says "it loads someone else's website"

That is the hosts entry not taking effect. `.test` never resolves publicly, so the failure mode is a clean DNS error. Usual causes, in
order:

1. The hosts line was never added, or was added to the wrong file.
2. **DNS-over-HTTPS / "Secure DNS"** enabled in the browser, which can bypass the OS
   resolver. Turn it off for testing: Chrome → Settings → Privacy and security → Security
   → Use secure DNS; Firefox → Settings → Privacy & Security → DNS over HTTPS.
3. A corporate DNS client or VPN agent that resolves independently of the hosts file.
4. Stale DNS cache — `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` on
   macOS, `ipconfig /flushdns` on Windows.

`serve.py` reports what the hostname currently resolves to, which usually identifies the
cause immediately.

## Notes

- **The port doesn't matter.** Cookies ignore port numbers, so `.fctest.test` on
  `:8000` behaves exactly like `:80`. Use port 80 if you want the bare hostname, but
  that needs `sudo ./serve.sh 80`.
- **HTTP, not HTTPS.** Serving locally over plain HTTP is fine here: the cookie carries
  no `Secure` flag, and the Fintel and GTM libraries load over HTTPS from their own
  origins, which browsers permit on an HTTP page. If you need to test `Secure` cookie
  behaviour specifically, that needs a real certificate and is out of scope for this
  setup.
- **Everyone tests the same build.** The repo is the source of truth; each developer
  serves their own checkout. Pull before a test round so you're not comparing runs
  across different revisions — `git log --oneline -1` is worth recording with results.
- **GTM Preview works against this.** Enter `http://www.fctest.test:8000/` as the URL in
  Tag Assistant. The container is fetched from Google over HTTPS regardless of how the
  page is served.

## Undoing it

```bash
sudo sed -i '' '/fctest\.test/d' /etc/hosts
```

Drop the `''` after `-i` on Linux.

## Production, for reference

On a real `*.fintelconnect.com` host the `FC - Cookie Domain` variable returns
`.fintelconnect.com` on its own — no tag edit, no hosts file. This local setup exists
only so the dev team can exercise attribution without waiting on DNS.
