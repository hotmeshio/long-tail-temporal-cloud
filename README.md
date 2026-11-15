# long-tail-temporal-cloud

A Long Tail cloud on Temporal that hands fabrication orders to a factory site and waits for the result.

A Temporal workflow uploads an order's files, parks on one `conditional()` wait, and finishes when a site reports the outcome. The wait is a row in the `fabrication` role's queue. A site finds the row, claims it, downloads the files, builds the order on its own network, and resolves the row. Every call travels from the site to the cloud over HTTPS, so the factory network accepts no inbound connections.

The site half lives in [long-tail-dbos-onprem](https://github.com/hotmeshio/long-tail-dbos-onprem).

## The handoff

```
cloud (Temporal)                              site (factory LAN)
────────────────                              ──────────────────
fabricationOrderRequest
  upload model + ticket to storage
  conditional('fab-<orderId>', {
    role: 'fabrication', files, data })  ──▶  POST /api/escalations/claim-by-facets
                                              GET  /api/escalations/:id/files
                                              ... prints, inspects ...
  wakes with the outcome                 ◀──  POST /api/escalations/resolve-by-signal-key
  returns { orderId, status, outcome }
```

| Step | Call | Notes |
|---|---|---|
| Advertise | `conditional('fab-<orderId>', …)` | One pending row per order, `metadata.orderId` as the facet, files attached with checksums |
| Claim | `POST /api/escalations/claim-by-facets` | Atomic: one site holds each row |
| Fetch | `GET /api/escalations/:id/files` | Signed download links |
| Report | `POST /api/escalations/resolve-by-signal-key` | `{ signalKey: 'fab-<orderId>', resolverPayload }`; a repeat answers 409 |
| Read | `GET /api/workflows/:id/result` | `{ orderId, status, outcome }` |

`status` is `fabricated`, `rejected`, `expired` or `cancelled`. The wait holds for `timeout` (default `7d`); an order that no site reports in that time completes as `expired`.

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
| MinIO | http://localhost:9703 |

An empty `.env` runs the stack against the Temporal server in the compose file. Start an order from the dashboard's Invoke page (`fabricationOrderRequest`) or over the API:

```bash
TOKEN=$(curl -s localhost:3600/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"superadmin","password":"l0ngt@1l"}' | jq -r .token)

curl -s localhost:3600/api/workflows/fabricationOrderRequest/invoke \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"workflowId":"order-A-100","data":{"orderId":"A-100","product":"bracket","quantity":2}}'
```

The order appears in the `fabrication` queue and waits there until a site resolves it.

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

A site calls the cloud as a bot that holds the `fabrication` role.

```bash
LT_URL=https://cloud.example.com LT_ADMIN_USER=superadmin LT_ADMIN_PASSWORD=... npm run site-key
```

The script prints `CLOUD_URL`, `CLOUD_API_KEY` and `CLOUD_BOT_ID` for the site's environment. Running it again issues a new key and revokes the earlier one.

## Layout

```
src/
  index.ts                 boot: API, worker, or both (APP_ROLE)
  api/                     Long Tail on the Temporal provider
  worker/                  Temporal worker and its connection
  workflows/               fabricationOrderRequest
  activities/              asset upload
  config/                  roles and worker registration
  modules/                 config (env) and constants
  services/bot-key.ts      bot accounts and keys
scripts/mint-site-key.ts   the key a site calls with
```

`APP_ROLE=api` serves the dashboard and API, `APP_ROLE=worker` runs the Temporal worker, and `both` runs the two in one process for local work.

## Tests

```bash
npm test                   # unit, mocked
npm run test:integration   # against the running compose stack
npm run typecheck
```

The integration tests play the site's part over the public API: claim, signed files, resolve, repeated resolve, rejection and expiry. Run them with the site stack stopped, so the test is the only claimer.

## Configuration

`.env.example` lists every variable with its local default.
