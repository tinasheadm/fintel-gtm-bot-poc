# GTM setup

Container in use: **`GTM-WFD2R889`**. If you are working in that container, skip to
[Import the container](#2-import-the-container).

---

## 0. Creating a GTM account from scratch

Only needed if a coworker wants their own sandbox container rather than sharing
`GTM-WFD2R889`.

1. Go to <https://tagmanager.google.com> and sign in with a Google account.
2. **Create Account**:
   - *Account name*: your company or team name
   - *Country*: as appropriate
   - *Container name*: the domain the pages are served from, e.g. `yourname.github.io`
   - *Target platform*: **Web**
3. Accept the Terms of Service. GTM shows you the container snippet and a
   `GTM-XXXXXXX` ID — that ID is what goes in the pages.
4. Swap the ID into all four HTML files:

   ```bash
   grep -rl GTM-WFD2R889 . --include=*.html --include=*.js | xargs sed -i '' 's/GTM-WFD2R889/GTM-YOURID/g'
   ```

   (Drop the `''` after `-i` on Linux.)

The container snippet is already in every page of this repo, in both places GTM
requires it: the `<script>` at the end of `<head>` and the `<noscript>` iframe
immediately after `<body>`.

---

## 1. Give your coworkers access

**Admin → Account → User Management** (account-level) or **Container User
Management** (single container).

1. **+ → Add users**, enter their Google account emails.
2. Account permissions: **User** is enough. **Administrator** only if they need to add
   more people.
3. Container permissions for `GTM-WFD2R889`:
   - **Publish** — can change tags and push live. Give this to whoever owns the POC.
   - **Approve** or **Edit** — can build and preview but not publish. Right default for
     most of the team.
   - **Read** — can look, can't touch.
4. They get an email invite; the container appears in their GTM home once accepted.

For a POC where several people are experimenting at once, give everyone **Edit** and
keep **Publish** with one person. Each editor should work in their **own workspace**
(GTM allows 3 concurrent on the free tier) so you don't overwrite each other.

---

## 2. Import the container

1. **Admin → Container → Import Container**.
2. Choose file: `gtm/fc-bot-detection-poc.json`.
3. Workspace: **Existing → Default Workspace** (or a new one named `fc-bot-poc`).
4. Import option: **Merge**, then **Overwrite conflicting tags, triggers and
   variables**.
   - Pick **Merge**, *not* Overwrite-the-container — Overwrite wipes everything else in
     `GTM-WFD2R889`.
5. Review the preview screen. You should see **2 tags, 2 triggers, 5 variables** — all
   new, nothing modified — then **Confirm**.

If the import errors on account/container IDs, the JSON's placeholder IDs weren't
remapped. Build the items by hand using section 3 below; it takes about ten minutes.

---

## 3. What the import creates (and how to build it by hand)

### Variables

| Name | Type | Configuration |
|------|------|---------------|
| `DLV - orderId` | Data Layer Variable | Name `orderId`, version 2 |
| `DLV - pid` | Data Layer Variable | Name `pid`, version 2 |
| `FC - Merchant Ref` | Constant | `testmerchantFC` |
| `FC - Program ID` | Constant | `24490` |
| `FC - Cookie Domain` | Custom JavaScript | see below |

`FC - Cookie Domain`:

```js
function () {
  var host = document.location.hostname || "";
  if (/(^|\.)fintelconnect\.com$/i.test(host)) return ".fintelconnect.com";
  return host;
}
```

**Why this exists.** The production call scopes the cookie to `.fintelconnect.com`. A
browser only accepts a cookie scoped to the host serving the page, so on
`*.github.io` or `localhost` that value is rejected and the cookie never appears —
`.github.io` is a public suffix, which browsers refuse outright to protect against
supercookies. Returning the exact hostname off-production keeps the cookie working
without editing the tag between environments.

Also enable the built-in variables **Page URL, Page Hostname, Page Path, Referrer,
Event, Debug Mode** (Variables → Configure).

### Triggers

Both are **Custom Event**, `Event name` matched with **equals**, firing on **All Custom
Events**:

| Name | Event name |
|------|-----------|
| `CE - fc_landing_view` | `fc_landing_view` |
| `CE - fc_application_submitted` | `fc_application_submitted` |

### Tags

Both are **Custom HTML**, firing option **Once per event**, `document.write` **off**.
Copy the tag bodies from `gtm/generate-container.py` (`LANDING_HTML` and `PIXEL_HTML`)
— they're the same strings that go into the JSON, and they're commented.

| Name | Trigger | Does |
|------|---------|------|
| `FC – Attribution (Landing)` | `CE - fc_landing_view` | loads `cdn.fintelconnect.com/scripts/fcanalytics/v1.js`, then `fcpixel.attribution("finteltag", 10, "last", {{FC - Merchant Ref}}, {{FC - Cookie Domain}})` |
| `FC – Conversion Pixel (Thank You)` | `CE - fc_application_submitted` | loads `app.fintelconnect.com/assets/scripts/fcanalytics.js`, then `fcpixel.pxl({{FC - Program ID}}, orderID, pid, "", 0, 0, "", {{FC - Merchant Ref}})` |

**On the tag structure.** Both tags load the library programmatically and call `fcpixel`
from the script's `onload`, rather than pasting `<script src>` followed by an inline
`<script>`. GTM's Custom HTML tags run through a `document.write` shim whose ordering
guarantees are easy to lose — especially with `document.write` support disabled, which
you want for page-speed reasons. The `onload` form makes the dependency explicit and
logs an error instead of throwing `fcpixel is not defined` when the CDN is blocked. The
arguments passed to Fintel are unchanged from the supplied snippets.

---

## 4. Preview and publish

1. Click **Preview**, enter your test URL (`http://localhost:8000` or your Pages URL).
2. Tag Assistant opens the site in a new tab and connects.
3. Walk the flow: landing → offers → apply → submit.
4. In Tag Assistant, check the left-hand event list:
   - on `fc_landing_view` → **FC – Attribution (Landing)** under *Tags Fired*
   - on `fc_application_submitted` → **FC – Conversion Pixel (Thank You)** under *Tags
     Fired*
   - click the pixel tag → **Variables** tab → confirm `DLV - orderId` and `DLV - pid`
     resolved to real values, not `undefined`
5. **Submit → Publish** with a version name like `FC bot POC v1`.

Preview mode adds a `gtm_debug` parameter and a debug banner. Do a clean run without
preview too — the Fintel scripts see a slightly different page in debug mode.

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| Tag never fires | Event pushed before GTM initialised is fine — GTM replays the queue. Check the event name for a typo, and that the trigger is *Custom Event*, not *Page View*. |
| `fcpixel is not defined` | Library blocked (ad blocker, CSP, corporate proxy) or the call ran before `onload`. Check the Network tab for the CDN request. |
| Tag fires, no cookie | Cookie domain mismatch — see `FC - Cookie Domain` above. Also check for `SameSite`/`Secure` warnings in the console; Pages is HTTPS, localhost is not. |
| `orderId` is `undefined` in the pixel | You loaded `thank-you.html` directly. Walk the flow from `apply.html`, or rely on the tag's fallback generator. |
| Pixel fires twice | Tag firing option is not **Once per event**, or the event is pushed twice. Check the drawer's network list for duplicate requests. |
| Nothing at all in Tag Assistant | Ad blocker on `googletagmanager.com`, or the container is not published and you're not in preview. |
