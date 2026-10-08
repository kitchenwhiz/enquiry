# Kitchen Whiz — Hoshizaki & Western enquiries

Two pages on one Cloudflare Worker with a D1 database:

| Address | Who | What |
|---|---|---|
| `/` | Customers (public) | Enquiry form: name, phone, search of all 219 Hoshizaki & Western models (no prices), comments. Two WhatsApp buttons plus "Send enquiry without WhatsApp". Every send saves the enquiry. |
| `/team/` | Team | Every enquiry with dealer prices (DP), tap to call, WhatsApp, team comments, follow-up date and status (New, Contacted, Quoted, Won, Lost). |

## Files
- `public/index.html`, `public/js/form.js` — customer form
- `public/team/index.html`, `public/js/team.js` — team page
- `public/js/config.js` — **WhatsApp group invite link and phone number for the buttons**
- `public/js/products.js` — model list without prices (generated)
- `src/worker.js` — API; `src/prices.js` — dealer prices (generated, only served at `/api/team/prices`)
- `tools/hw/gen.py` + the price list Excel — run `npm run gen` after replacing the Excel to rebuild both data files
- `wrangler.jsonc` — Worker name `enquiry`, D1 binding `DB` (`enquiry-db`). Tables are created automatically.

## API
- `POST /api/enquiries` — public; saves or updates an enquiry (same id = same enquiry, so tapping both buttons doesn't duplicate). Numbers run E-1001, E-1002…
- `GET /api/team/enquiries` — all enquiries with team notes
- `POST /api/team/enquiries/:id/notes` — `{author, text, due_date ("" clears), status}`
- `GET /api/team/prices` — dealer prices

## Deploy (one time)
Cloudflare → Workers & Pages → Create → **Import a repository** → `kitchenwhiz/enquiry` → Deploy. Every push to `main` then redeploys.
The first deploy creates the `enquiry-db` database. If the build ever asks for a database id: Cloudflare → D1 → Create `enquiry-db`, copy its id into `wrangler.jsonc` as `"database_id"`, push.

## Access (to do)
`/team/` and `/api/team/*` are open to anyone who has the link (decided 8 Oct 2026: no restrictions for now). They show customer phone numbers and dealer prices. To add the @kitchenwhiz.in login later: Cloudflare Zero Trust → Access → Applications → Add → Self-hosted, paths `enquiry.<subdomain>.workers.dev/team` and `/api/team`, policy "emails ending in @kitchenwhiz.in". The customer form (`/` and `POST /api/enquiries`) stays public.

## Local
`npm install`, `npm run dev` → http://localhost:8787 and http://localhost:8787/team/
