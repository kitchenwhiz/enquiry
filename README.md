# Kitchen Whiz enquiries — enquiry.kitchenwhiz.in

One enquiry form and one team list per partner brand, on one Cloudflare Worker with a D1 database.

| Address | What |
|---|---|
| `enquiry.kitchenwhiz.in/` | Public "Coming soon" page (to become the Instagram landing page) |
| `enquiry.kitchenwhiz.in/forms` | Internal list of partner forms |
| `enquiry.kitchenwhiz.in/hw` | Hoshizaki & Western enquiry form: name, phone, model search (no prices), comments; floating Start a new enquiry + Send to WhatsApp group |
| `enquiry.kitchenwhiz.in/team` | ONE team list for every brand (brand filter when there are several): dealer prices, call / WhatsApp, comments, follow-up dates, status, edit products, WhatsApp confirmation status |

Enquiry numbers run per brand: HW-1001, HW-1002… `/hw/team` goes to `/team`.

## Files
- `src/brands.js` — the partner brands (name, reference prefix, prices)
- `public/<brand>/index.html`, `config.js`, `products.js` — each brand's form, WhatsApp group link and model list (no prices)
- `public/team/index.html` — the shared team list; `public/js/brands.js` — brands shown on it
- `public/js/form.js`, `public/js/team.js`, `public/css/base.css` — shared by every brand
- `src/worker.js` — API; `src/confirm.js` — WhatsApp confirmation (Gupshup); `src/brands/hw-prices.js` — HW dealer prices (generated)
- `tools/hw/gen.py` + the price list Excel — `npm run gen:hw` rebuilds `public/hw/products.js` and `src/brands/hw-prices.js`

## Adding a partner brand (e.g. `tf`)
1. Copy `public/hw/` to `public/tf/`; change `window.BRAND`, titles and the WhatsApp group link in `config.js`.
2. Make `public/tf/products.js` and `src/brands/tf-prices.js` from that partner's price list (a generator like `tools/hw/gen.py`).
3. Add `tf` to `src/brands.js` and `public/js/brands.js`, add `<script src="/tf/products.js">` to `public/team/index.html`, and a row to `public/forms/index.html`. Push.

## API
- `POST /api/<brand>/enquiries` — saves or updates an enquiry (same id = same enquiry, so tapping both buttons doesn't duplicate). Numbers run per brand (HW-1001…).
- `GET /api/team/enquiries` — all enquiries with team notes
- `POST /api/team/enquiries/:id/notes` — `{author, text, due_date ("" clears), status}`
- `PUT /api/team/enquiries/:id/items` — `{author, items}` replaces the products; the change is logged in team updates
- `GET /api/team/prices` — dealer prices

## Address enquiry.kitchenwhiz.in (one time, owner)
Needs kitchenwhiz.in on Cloudflare (see hosting plan). Then Cloudflare → Workers & Pages → enquiry → Settings → Domains & Routes → Add → Custom domain → `enquiry.kitchenwhiz.in`. Cloudflare creates the DNS record and certificate. The workers.dev address keeps working.

## Deploy (one time)
Cloudflare → Workers & Pages → Create → **Import a repository** → `kitchenwhiz/enquiry` → Deploy. Every push to `main` then redeploys.
The first deploy creates the `enquiry-db` database. If the build ever asks for a database id: Cloudflare → D1 → Create `enquiry-db`, copy its id into `wrangler.jsonc` as `"database_id"`, push.

## WhatsApp confirmation (Gupshup)
Every new enquiry gets one WhatsApp confirmation to the customer's number, sent through Gupshup with an approved template. The result shows on the team page (sent / failed with Gupshup's reason) with a Send again / Try again button, and in Team updates.
- `wrangler.jsonc` → `vars`: `GUPSHUP_APP_NAME`, `GUPSHUP_SOURCE` (Gupshup number with country code), `GUPSHUP_TEMPLATE_ID`, `GUPSHUP_TEMPLATE_PARAMS` (what fills {{1}}, {{2}}… in order; choose from name, firstname, ref, products, count, phone, date).
- Secret `GUPSHUP_API_KEY`: Cloudflare → Workers & Pages → enquiry → Settings → Variables and Secrets → Add → type **Secret**. Never put it in the code.
- Until all four are set, nothing is sent. Code: `src/confirm.js`.

## Access (to do, pending task)
**Team list to be moved under email login** (owner, 21 Oct): only the team's @kitchenwhiz.in emails can open `/team`; the brand forms stay open.
`/team/` and `/api/team/*` are open to anyone who has the link (decided 8 Oct 2026: no restrictions for now). They show customer phone numbers and dealer prices. To add the @kitchenwhiz.in login later: Cloudflare Zero Trust → Access → Applications → Add → Self-hosted, paths `enquiry.kitchenwhiz.in/team` and `/api/team`, policy "emails ending in @kitchenwhiz.in". The customer form (`/` and `POST /api/enquiries`) stays public.

## Local
`npm install`, `npm run dev` → http://localhost:8787 and http://localhost:8787/team/
