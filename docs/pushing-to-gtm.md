# Pushing changes to GTM

The container in this repo is generated from source, so the flow is always the same:
edit the generator → regenerate the JSON → import → publish.

**Container:** `GTM-WFD2R889` · account **Fintel Connect** · container **fc-bot-poc**

---

## When do you actually need to re-import?

| You changed | Re-import needed? |
|---|---|
| `gtm/generate-container.py` (tag code, variables, triggers) | **Yes** |
| Any `.html` page or `assets/*.js` | No — GitHub Pages serves those directly |
| A constant you can edit in the GTM UI (`FC - Program ID`, `FC - Merchant Ref`) | No, edit in place and publish |

Only the first row involves a file. The pages and the container are deployed
independently: pushing to `main` updates the site, importing updates the tags.

---

## 1. Regenerate (only if you edited the generator)

```bash
python3 gtm/generate-container.py
```

Writes `gtm/fc-bot-detection-poc.json` and validates it. Commit both files together so
the JSON never drifts from its source.

## 2. Import

1. **Admin** (top nav) → right-hand **Container** column → **Import Container**
2. **Choose container file** → `gtm/fc-bot-detection-poc.json`
3. **Choose workspace** → `Default Workspace`
4. **Choose an import option** → **Overwrite**

   Overwrite is correct here: this container holds nothing but the POC tags, and the
   JSON is the complete intended state. Use **Merge** only if someone has added tags in
   the UI that are not in the file — Overwrite would delete those.
5. Check the **Preview** — every row should read `Added` or `Modified`, and nothing you
   care about should read `Deleted`
6. **Add to workspace**

## 3. Publish — the step that actually matters

Import writes to a *workspace*. The container browsers download is unchanged until you
publish.

1. **Submit** (top right)
2. **Publish and Create Version**
3. Version name, e.g. `FC bot POC v2`, and a one-line description of what changed
4. **Publish**

## 4. Verify from the command line

Never assume. Check that the live container really contains the tags:

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-WFD2R889" | grep -c fcpixel
```

`0` means it did not publish. A non-zero count means it is live.

Two more worth running after a change:

```bash
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-WFD2R889" | grep -o "fintelconnect.com[^\"']*" | sort -u
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tinasheadm.github.io/fintel-gtm-bot-poc/
```

The first lists the library URLs the tags will inject; the second confirms the pages are
still being served.

---

## Rolling back

**Versions** tab → find the version you want → ⋮ → **Publish**. It goes live immediately;
nothing is lost, and the version you rolled back from stays in the list.

---

## Preview before publishing

For anything non-trivial, use **Preview** instead of publishing straight away:

1. **Preview** (top right) → enter `https://tinasheadm.github.io/fintel-gtm-bot-poc/`
2. Tag Assistant opens the site and connects
3. Walk the funnel and confirm, on the left-hand event list:
   - `fc_landing_view` → **FC – Attribution (Landing)** under *Tags Fired*
   - `fc_application_submitted` → **FC – Conversion Pixel (Thank You)** under *Tags Fired*
   - click the pixel tag → **Variables** tab → `DLV - orderId` and `DLV - pid` resolved to
     real values, not `undefined`
4. Then Submit → Publish

Preview appends `gtm_debug` to the URL and shows a banner. Do a clean run without it too
— the Fintel scripts see a slightly different page in debug mode.

---

## Editing a constant without touching the repo

`FC - Program ID` and `FC - Merchant Ref` are GTM **Constant** variables, so they can be
changed in the UI:

**Variables** → click the variable → edit the value → **Save** → **Submit** → **Publish**

If you do this, change it in `gtm/generate-container.py` as well, or the next import will
quietly revert it.

`FC - Cookie Domain` is a Custom JavaScript variable and should be edited in the
generator, not the UI — it is the piece most likely to be wrong in a way nobody notices.

---

## Common failure modes

| Symptom | Cause |
|---|---|
| `grep -c fcpixel` returns 0 after importing | Imported but never published. Submit → Publish. |
| Tags fire in Preview but not live | Same thing — Preview runs the workspace, not the published version. |
| A tag you added in the UI disappeared | Someone imported with **Overwrite**. Recover it from the Versions tab. |
| Import preview shows unexpected `Deleted` rows | You picked Overwrite when you wanted Merge. Cancel. |
| Changes to a page aren't showing | Pages are served from GitHub Pages, not GTM. Push to `main` and wait for the build. |
