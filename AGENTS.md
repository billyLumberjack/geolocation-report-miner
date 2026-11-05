# geolocation-report-miner

Node.js batch job that adds geographic coordinates to ski reports already stored
in MongoDB. Runs after `report-miner`. Bridges two repos: it calls `find-toponym`
(Python) to clean titles and the OpenCage API to geocode them.

## How it works

`index.js`:
1. Connects to MongoDB.
2. Builds a `MongoDbHandler` over a collection (`production-report-collection`).
3. Queries for reports where `geometry` does **not** exist (sorted newest first,
   `limit: 100`), then calls `assignGeocodeToQueryResults`.

`mongoDbHandler.js` (the core):
1. Filters reports whose `TripName` is longer than 3 chars; derives a
   `cleanTitle` (strips non-alphanumerics).
2. Passes the clean titles to `titleRefinerHandler`, which shells out to the
   `find-toponym` Python script (path from `TOPONYM_SCRIPT_PATH`) to extract the
   place name from each.
3. Geocodes each refined toponym via the **OpenCage** geocoding API over HTTPS.
4. Writes the resulting `geometry` back onto the report document (failures get
   the sentinel `"NOT_FOUND"` so they aren't retried forever).

## Files

- `index.js` — entry point, Mongo connect + query definition.
- `mongoDbHandler.js` — query, refine, geocode, update logic.
- `titleRefinerHandler.js` — thin wrapper that invokes the `find-toponym` script.
- `lib/cw-logs-helper.js` — CloudWatch Logs writer.

## Run

```sh
npm install
# .env: ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, TOPONYM_SCRIPT_PATH
node index.js
```

`TOPONYM_SCRIPT_PATH` must point at the sibling `find-toponym` script, and
Python + TreeTagger must be installed there.

## Caveats ⚠️

- **Hardcoded secrets in source** — `index.js` embeds a Mongo connection string
  with `root:root`; `mongoDbHandler.js` embeds OpenCage API keys. Don't commit
  real new ones; flag/rotate if you touch these files.
- The Mongo connection in `index.js` is separate from (and inconsistent with)
  the env-based config elsewhere — unify before relying on it.
- Only processes 100 reports per run (the `limit`); meant to be run repeatedly.
- Remote is Bitbucket (`andreab91`), unlike the other repos.
