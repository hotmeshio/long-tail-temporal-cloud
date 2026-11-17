# long-tail-temporal-cloud

The cloud half of the Acme Eyeglass order, on Long Tail and Temporal.

A customer orders a pair of glasses and uploads a prescription. One Temporal workflow, `eyeglassOrder`, carries the order from the prescription to the carrier pickup. Each place the order waits for someone is one `conditional()` call, and each wait is a row in a role's queue. People close rows from the dashboard. A factory site closes the production row over HTTPS, so the factory network accepts no inbound connections.

The site half lives in [long-tail-dbos-onprem](https://github.com/hotmeshio/long-tail-dbos-onprem).

## The order

```
eyeglassOrder
  1. stage the prescription PDF and the frame print file
  2. read the prescription        confidence under 0.85  ──▶  prescription-review
                                  reviewer asks for a copy ─▶  customer-care
  3. pick a lens blank            stock has none         ──▶  order-desk
  4. hand production to a site                           ──▶  production
  5. book the carrier, wait for the pickup scan          ──▶  carrier-pickup
                                  pickup overdue         ──▶  shipping-desk
```

| Role | Who works it | The row asks | Signal key |
|---|---|---|---|
| `prescription-review` | Riley Chen | Confirm or correct the parsed prescription, or ask for a clearer copy | `review-<workflowId>` |
| `customer-care` | Morgan Diaz | Ask the customer for a new copy and record the reply | `copy-<workflowId>` |
| `order-desk` | Sam Okafor | Name the lens blank lot that fills the order | `blank-<orderId>` |
| `production` | a site's bot (`site-1`) | Make the glasses and report the outcome | `production-<orderId>` |
| `carrier-pickup` | Casey Lund | Confirm the carrier's pickup scan | `carrier-pickup-<orderId>` |
| `shipping-desk` | Devon Park | Call the carrier, then rebook or cancel | `carrier-chase-<orderId>` |

Each role owns the form its rows are closed with (`src/config/roles.ts`). The review form shows every parsed field with the model's confidence beside it, and the prescription PDF travels with the row as a signed file.

The workflow returns `{ orderId, status }`:

| Status | The order ended because |
|---|---|
| `shipped` | the carrier scanned the pickup |
| `refused` | the carrier refused the parcel |
| `clearer-copy` | the reviewer asked for a clearer copy and customer care recorded the reply |
| `held` | the order desk named no lens blank lot |
| `rejected` | the site reported `completed: false` |
| `expired` | a wait reached its deadline |
| `cancelled` | a row was cancelled, or the shipping desk cancelled the shipment |

## The handoff to a site

```
cloud (Temporal)                              site (factory LAN)
────────────────                              ──────────────────
eyeglassOrderRequest
  conditional('production-<orderId>', {
    role: 'production', files, data })   ──▶  POST /api/escalations/claim-by-facets
                                              GET  /api/escalations/:id/files
                                              ... prints the frame, cuts the lenses, packs ...
  wakes with the outcome                 ◀──  POST /api/escalations/resolve-by-signal-key
  books the carrier
```

| Step | Call | Notes |
|---|---|---|
| Advertise | `conditional('production-<orderId>', …)` | One pending row per order, `metadata.orderId` as the facet |
| Claim | `POST /api/escalations/claim-by-facets` | Atomic: one site holds each row |
| Fetch | `GET /api/escalations/:id/files` | Signed links for `frame` (the print file) and `prescription` (the confirmed values as JSON) |
| Report | `POST /api/escalations/resolve-by-signal-key` | `{ signalKey: 'production-<orderId>', resolverPayload }`; a repeat answers 409 |

The row's data is the production order: `orderId`, `frameStyle`, `lensMaterial`, `coating`, `lotNumber`, `prescription`, `signalKey`, and `assets` with a checksum and size for each file. The site reports `{ completed, site, binKey?, destination?, notes? }`. The production wait holds for `timeout` (default `7d`).

## Run it locally

```bash
docker compose up -d --build
```

| Service | Address |
|---|---|
| Dashboard and API | http://localhost:3600 (superadmin / l0ngt@1l) |
| Temporal UI | http://localhost:8243 |
| Postgres | localhost:5436 |
| NATS | localhost:4722 |
| MinIO | http://localhost:9703 (API on 9702) |

File links are signed against `http://files.localhost:9702`, a name a browser on this machine resolves to MinIO and the site's compose file maps to the host.

An empty `.env` runs the stack against the Temporal server in the compose file. On boot the API creates one member for each role a person works: `riley`, `morgan`, `sam`, `casey` and `devon`. They sign in with `LT_DEMO_PASSWORD`, which the compose file sets to the local admin password.

### Seed the story

```bash
LT_ADMIN_PASSWORD=... npm run seed:story
```

| Order | Waits in | Why |
|---|---|---|
| `A-1042` | `prescription-review` | the scan was folded across the left axis, so the read scores 0.62 |
| `A-1043` | `production` | read cleanly, blank in stock, ready for a site |
| `A-1044` | `order-desk` | stock has no blank that covers it |
| `A-1045` | `production` | moves to `carrier-pickup` when a site reports it |

The script starts each order through the same API the dashboard uses and prints where each one waits. An order that already has rows stays as it is, so a second run starts nothing. With a site connected, the site claims `A-1043` and `A-1045`. Without one, `npm run seed:story -- --report-production` reports production for `A-1045` as a bot so it waits for the carrier.

`LT_URL` (default `http://localhost:3600`) and `LT_ADMIN_USER` (default `superadmin`) point the script at another stack.

### Walk through it

1. Open **Escalations** and pick the `prescription-review` queue. Claim `A-1042`: the form shows the parsed values, the left axis flagged, and the PDF. Confirm it and the order moves to `production`. Choose "Ask for a clearer copy" and it moves to `customer-care`.
2. Pick the `order-desk` queue and open `A-1044`. Name a lot such as `LOT-4417` and the order moves to `production`.
3. The `production` queue holds the orders a site will claim.
4. Pick the `carrier-pickup` queue once a site has reported. Confirm the scan and the order completes as `shipped`. A pickup that waits past its deadline opens a row for the `shipping-desk`.

Start any other order from the dashboard's Invoke page (`eyeglassOrderRequest`) or over the API:

```bash
TOKEN=$(curl -s localhost:3600/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"superadmin","password":"l0ngt@1l"}' | jq -r .token)

curl -s localhost:3600/api/workflows/eyeglassOrderRequest/invoke \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"workflowId":"order-A-2001","data":{"orderId":"A-2001","frameStyle":"round-48"}}'
```

## Run it on Temporal Cloud

1. Create a namespace with API key authentication and note its address (`<namespace>.<account>.tmprl.cloud:7233`).
2. Create an API key. A service account key suits a deployed worker.
3. Put the three values in `.env`:

```bash
TEMPORAL_ADDRESS=my-namespace.a1b2c.tmprl.cloud:7233
TEMPORAL_NAMESPACE=my-namespace.a1b2c
TEMPORAL_API_KEY=...
TEMPORAL_UI_URL=https://cloud.temporal.io
```

4. `docker compose up -d --build app`

With `TEMPORAL_API_KEY` set, the provider and the worker connect over TLS with the key. Workflow runs appear in the namespace at cloud.temporal.io.

## Connect a site

A site calls the cloud as the `site-1` bot, a member of the `production` role.

```bash
LT_URL=https://cloud.example.com LT_ADMIN_USER=superadmin LT_ADMIN_PASSWORD=... npm run site-key
```

The script prints `CLOUD_URL`, `CLOUD_API_KEY` and `CLOUD_BOT_ID` for the site's environment. Running it again issues a new key and revokes the earlier one.

## Deploy to AWS

`deploy/cdk` runs this cloud in its own VPC on Fargate, with Postgres on RDS, an order files bucket and the Temporal API key in Secrets Manager. A version tag deploys it from GitHub Actions and runs one order from start to `shipped` as a check. See [deploy/README.md](deploy/README.md).

```bash
LT_URL=https://cloud.example.com LT_ADMIN_PASSWORD=... npm run smoke
```

## Layout

```
src/
  index.ts                  boot: API, worker, or both (APP_ROLE)
  api/                      Long Tail on the Temporal provider
  worker/                   Temporal worker and its connection
  workflows/                eyeglassOrder, prescription review, shipping
  activities/               order files, prescription parse, lens stock, carrier booking
  config/                   roles and their forms, worker registration, the workflow bot, demo people
  modules/                  config (env), constants and the story's fixtures
  types/order.ts            the order, the production order and its outcome
  services/bot-key.ts       bot accounts and keys
  services/order-api.ts     start an order, read its rows, close a wait
  services/handoff-smoke.ts one order from start to shipped, as a check
  services/story-seed.ts    the four story orders
scripts/seed-story.ts       npm run seed:story
scripts/mint-site-key.ts    npm run site-key
scripts/smoke-handoff.ts    npm run smoke
scripts/make-prescription-pdf.ts  npm run make:pdf, writes assets/prescription-sample.pdf
deploy/cdk/                 AWS stacks
```

`APP_ROLE=both` runs the API and the Temporal worker in one process. On AWS the two run as separate services on the one database: `APP_ROLE=api` serves the dashboard and API, and `APP_ROLE=worker` runs the worker with Long Tail started in its process, HTTP server off. In every role the workflows call Long Tail in the worker's process as the `temporal-workflows` bot.

## Tests

```bash
npm test                   # unit, mocked
npm run test:integration   # against the running compose stack
npm run typecheck
```

The integration tests play the site's part over the public API: claim, signed files, the production report, the pickup scan, a repeated report, rejection and expiry. Run them with the site stack stopped, so the test is the only claimer.

## Configuration

`.env.example` lists every variable with its local default.
