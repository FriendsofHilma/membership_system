# DFRI-eID login prototype (Friends of Hilma website)

**Status:** local prototype — implemented and verified 2026-11-17 (6/6 smoke checks). Not production‑ready.  
**Target site:** `friendsofhilma_website` (Next.js 15, App Router).  
**Upstream reference:** [DFRI-eID/dfri-eid](https://codeberg.org/DFRI-eID/dfri-eid) (reviewed 2026-11-17, early/demo-stage).

## What DFRI-eID is (today)

DFRI-eID is a prototype monorepo for a **free/open, certificate-based e-identification** flow using X.509 client certificates (mTLS-style), not a hosted OpenID Connect/OAuth2/SAML provider.

Relevant upstream demo components:
- `go-eid-test-ca` — test CA, certificate issuance/revocation and CRLs.
- `caddy-test-issuer` — demo issuer site that issues a test `.p12` client certificate.
- `caddy-test-verifier` / `nginx-test` — demo relying‑party/verifier that requires a client certificate, verifies it against a trusted CA (+ CRL), and exposes the identity to app code.

**Implication:** “login” means the browser presents a **client certificate** during TLS; a verifier/proxy validates it and passes a verified identity claim to the application. This cannot be a plain in-app Next.js redirect flow — it needs a TLS front‑end that supports client‑certificate authentication.

## Implemented prototype (this repository)

Because the upstream demos target Linux/Caddy/Go, this repo contains an equivalent **Node mTLS verifier** that runs on Windows and a test‑certificate generator. It mirrors the DFRI verifier behaviour (trusted CA, client cert, identity forwarded to the app).

| File | Purpose |
|---|---|
| `src/middleware.ts` | Protects `/internal/:path*`; redirects to `/internal/login` without a verified identity. |
| `src/lib/dfri-eid.ts` | Reads the verified identity from trusted proxy headers. |
| `src/app/internal/page.tsx` | Protected prototype page showing the authenticated identity. |
| `src/app/internal/login/page.tsx` | Login/help page with a “Sign in with DFRI‑eID (test)” link. |
| `tools/dfri-verifier/verifier.mjs` | Public HTTP listener (**8080**) + secure HTTPS mTLS listener (**8443**). |
| `tools/dfri-verifier/generate-test-certs.sh` | Creates a throwaway test root CA, issuing CA, server chain and client cert (run in WSL/Linux; `openssl`). |
| `tools/dfri-verifier/smoke-test.mjs` | End‑to‑end checks for the verifier + Next integration. |
| `tools/dfri-verifier/README.md` | Verifier usage, configuration, headers and limitations. |

### Flow

```
browser / curl
   │
   ├─ http://localhost:8080  (public)  ──────────────► Next.js :3000
   │     /internal redirects to /internal/login        (no identity headers)
   │
   └─ https://localhost:8443 (mTLS)   ──────────────► Next.js :3000
         client cert verified against test CA           + X-DFRI-EID-* headers
         /internal → protected page with identity
```

### Quick start

```bash
# 0) From the repository root. Node 20 for the site (see start-friendsofhilma.cmd
#    on this machine); WSL/Linux + openssl for cert generation.

# 1) Generate test certificates (gitignored, TEST ONLY)
#    (run from the repository root; WSL translates the current directory)
wsl -d Ubuntu -e bash tools/dfri-verifier/generate-test-certs.sh

# 2) Start the Next.js app (terminal 1)
npm run dev
# http://localhost:3000

# 3) Start the verifier (terminal 2)
node tools/dfri-verifier/verifier.mjs

# 4) Verify end-to-end (terminal 3)
node tools/dfri-verifier/smoke-test.mjs
```

Then:
- Public help page: <http://localhost:8080/internal/login>
- Secure internal page: <https://localhost:8443/internal> — the browser asks for a client certificate. Import `tools/dfri-verifier/certs/test-person-001.p12` (password `test`), or use the curl/Node test below.
- **Windows browser note:** import the `.p12` into *Personal* and, on the **test machine only**, `tools/dfri-verifier/certs/root-ca.crt.pem` into *Trusted Root Certification Authorities* so the browser offers the test certificate. Never install these test certificates on a real/production machine.
- Direct `http://localhost:3000/internal` redirects to `/internal/login` (no trusted identity).

#### Verify with curl (OpenSSL build)

The Windows `curl.exe` in this environment is Schannel‑based and cannot use PEM client certs, so use WSL/Git‑Bash `curl` or the Node smoke test:

```bash
curl -k \
  --cert tools/dfri-verifier/certs/test-person-001.crt.pem \
  --key tools/dfri-verifier/certs/test-person-001.key.pem \
  https://localhost:8443/internal
```

### Verified results (2026-11-17)

`node tools/dfri-verifier/smoke-test.mjs` → **6/6 passed**:

- public `/internal/login` → `200`
- public `/internal` → `307` → `/internal/login?from=%2Finternal`
- secure `/internal` without a cert → `401`
- secure `/internal` with the trusted test cert → `200`
- page shows `test-person-001` and “Authenticated via verified client certificate”
- direct Next.js `/internal` → `307` → `/internal/login?from=%2Finternal`

`tsc --noEmit` passes. (`next lint` currently fails on a pre‑existing `es-abstract` dependency issue, unrelated to this prototype.)

### Identity headers set on verified requests

- `X-DFRI-EID-Subject` — certificate common name (prototype identity key)
- `X-DFRI-EID-Subject-DN` — full subject DN
- `X-DFRI-EID-Serial` — certificate serial number
- `X-DFRI-EID-Issuer` — issuer common name
- `X-DFRI-EID-Authorized` — `true`

The verifier strips client‑supplied copies of these headers before proxying.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DFRI_TARGET` | `http://127.0.0.1:3000` | Next.js upstream |
| `DFRI_PUBLIC_PORT` | `8080` | Public HTTP listener |
| `DFRI_SECURE_PORT` | `8443` | Secure mTLS listener |
| `DFRI_CA_FILE` | `tools/dfri-verifier/certs/ca-bundle.crt.pem` | Trusted CA bundle (issuing CA + root) |
| `DFRI_SERVER_CERT` | `tools/dfri-verifier/certs/server-chain.crt.pem` | TLS server cert chain |
| `DFRI_SERVER_KEY` | `tools/dfri-verifier/certs/server.key.pem` | TLS server key |
| `DFRI_EID_LOGIN_URL` | `https://localhost:8443/internal` | Link used by `/internal/login` |

## Security caveats (prototype)

- **Test CA and test certificates only** — no real identity proofing; never use them in production.
- **Header trust boundary:** identity headers are only trustworthy when the Next.js origin is reachable **exclusively** through the verifier. Never expose port 3000 directly in an environment that relies on these headers. The scaffold is local/staging only.
- **No CRL/OCSP enforcement yet.** Upstream uses `caddy-revocation-validator`; the Node verifier currently checks chain validity but not revocation. Add CRL checking before any real use.
- **No app session layer.** The header is read per request; production needs a server‑side session issued after verified mTLS, RBAC, logout/CSRF handling, and audit logging.
- **Browser UX:** client‑certificate selection/import differs from “Sign in with…” flows and depends on browser/OS. The `.p12` import path was documented; curl/Node is the verified test path.
- **Upstream maturity:** DFRI‑eID is prototype/demo‑stage and may change; deploying issuer/verifier components means owning their operations.

## Readiness checklist (prototype → beyond)

| Area | Status to reach | Notes |
|---|---|---|
| Target route(s) & users | **Decide** | Who needs access (admin/treasurer/etc.) and which pages/actions are protected? |
| Identity contract | **Decide** | Which cert field is the stable user key; mapping to app users/roles. |
| Issuance & trust | **Decide/operate** | Who runs CA/issuer/enrollment; real identity proofing; renewal/revocation policy. |
| Hosting/TLS | **Verify** | Production hosting must support mTLS at the edge/proxy and guarantee only the proxy can reach the app origin. |
| Session & authorization | **Implement** | Server‑side session after verified cert auth; RBAC; logout; CSRF as needed. |
| Revocation & failure mode | **Implement** | CRL/OCSP availability, freshness, fail‑closed behavior for protected areas. |
| UX & support | **Plan** | Browser/certificate import guidance, lost‑cert/revocation process, device/smartcard support. |
| Security review | **Required** | Header trust boundaries, logging/audit, key management, PII handling, upstream tracking. |

## Alternative: run the upstream DFRI Caddy demo

If you want to exercise the actual upstream stack (Linux/WSL), follow `caddy-test-issuer` and `caddy-test-verifier` READMEs: install `xcaddy`, build Caddy with `caddy-cgi` and `caddy-revocation-validator`, generate the test CA (`make -C ../caddy-test-issuer ca-files`), and run `make run` from `caddy-test-verifier`. Point a reverse proxy site at `http://localhost:3000` and inject the verified identity header (`{http.request.tls.client.subject}`) as shown in the verifier's `Caddyfile-secure.inc`. The Node verifier can then be replaced by that Caddy setup without changing the Next.js middleware/page contract (same `X-DFRI-EID-Subject` header).

## Next implementation steps

1. Confirm who/what `/internal` (or other routes) should protect and the required role mapping.
2. Decide on the identity field(s) and whether to keep the Node verifier or adopt the upstream Caddy verifier.
3. Replace header‑only gating with a proper server‑side session issued after verified mTLS; keep the origin non‑public behind the proxy.
4. Add CRL/OCSP revocation enforcement and document fail‑closed behavior.
5. Plan user enrollment (test now; governed issuance later) and operational runbooks.
6. Revisit production feasibility with hosting/TLS constraints and DFRI‑eID project maturity/roadmap.
