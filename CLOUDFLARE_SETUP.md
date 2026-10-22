# Cloudflare shared data cache

This Worker caches the public OpenF1 and Open-Meteo responses at Cloudflare edge locations. Visitors served by the same location can reuse cached responses instead of each requesting the upstream service. The cache is edge-local, so a first request in another region may still fetch the upstream data.

It also provides a cached `/news` endpoint that returns F1 headlines and links from Formula1.com, BBC Sport, and Autosport. The page links separately to a Traditional Chinese Google News search; it does not copy or re-host those search results. The local prediction panel uses championship standings and the latest race classification, with no paid AI service or API key.

## Deploy on the free plan

1. Create or sign in to a Cloudflare account and open **Workers & Pages**.
2. Create a Worker named `apex-f1-data-cache`.
3. Replace its starter code with the contents of `worker.js` and deploy it. Keep the `workers.dev` URL enabled.
4. Copy the deployed Worker URL, for example `https://apex-f1-data-cache.<your-subdomain>.workers.dev`.
5. In `index.html`, set `API_PROXY_BASE` to that URL, without a trailing slash:

   ```js
   const API_PROXY_BASE = "https://apex-f1-data-cache.<your-subdomain>.workers.dev";
   ```

6. Publish the updated `index.html` to the website. The browser will now request OpenF1 and Open-Meteo data through the shared edge cache.

Alternatively, with Node.js installed, deploy from this repository using the included `wrangler.toml`:

```powershell
npx wrangler login
npx wrangler deploy
```

Then set `API_PROXY_BASE` to the URL printed by Wrangler and publish the updated page.

The Worker only forwards a fixed list of public-data endpoints and validated query parameters. It contains no API credentials. Cloudflare's free Workers limits apply; this proxy reduces duplicate upstream requests but does not increase OpenF1's quota or guarantee that Cloudflare's daily free request allowance cannot be exceeded.

## Update an existing Worker

Whenever `worker.js` changes, deploy the updated file to Cloudflare for new routes or backend changes to take effect. With Wrangler, run `npx wrangler deploy` from the repository. In the dashboard, replace the Worker's code with the latest `worker.js` and deploy a new version.
