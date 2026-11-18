# DFRI-eID verifier prototype (local)

A small **prototype** mTLS reverse proxy that mirrors the behaviour of the upstream
[DFRI-eID](https://codeberg.org/DFRI-eID/dfri-eid) Caddy verifier demo:

- requests an X.509 **client certificate** over TLS,
- verifies it against a trusted CA,
- forwards the verified identity to the Next.js app via headers.

It is implemented in Node so it can run on Windows without the upstream Linux
Caddy/Go demo stack. It is **not** production-ready.

## Files

- `verifier.mjs` — public HTTP listener (`8080`) and secure HTTPS listener (`8443`).
- `generate-test-certs.sh` — creates a throwaway test root CA, issuing CA, localhost
  server certificate and a test client certificate (run in WSL/Linux; `openssl` is
  not installed on this Windows host by default).
- `certs/` — generated test certificates (gitignored, **never commit**).

## Quick start

From the repository root:

```bash
# 1) Generate test certificates (WSL/Linux, openssl required)
#    (run from the repository root; WSL translates the current directory)
wsl -d Ubuntu -e bash tools/dfri-verifier/generate-test-certs.sh

# 2) Start the Next.js app (separate terminal)
npm run dev
# http://localhost:3000

# 3) Start the verifier (separate terminal)
node tools/dfri-verifier/verifier.mjs
```

Then:

- Public site/help page: <http://localhost:8080/internal/login>
- Secure internal page: <https://localhost:8443/internal>
  (the browser will ask for a client certificate; import `certs/test-person-001.p12`,
  password `test`)

**Windows browser note:** import `certs/test-person-001.p12` into *Personal* and,
on the **test machine only**, `certs/root-ca.crt.pem` into *Trusted Root Certification
Authorities* so the browser offers the test client certificate. Never install these
test certificates on a real/production machine.

### Verify with curl (no browser import needed)

```bash
curl -k \
  --cert tools/dfri-verifier/certs/test-person-001.crt.pem \
  --key tools/dfri-verifier/certs/test-person-001.key.pem \
  https://localhost:8443/internal
```

Without a certificate, `https://localhost:8443/internal` returns `401`.

Direct access to the Next.js app (`http://localhost:3000/internal`) redirects to
`/internal/login` because no trusted identity header is present.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DFRI_TARGET` | `http://127.0.0.1:3000` | Next.js upstream |
| `DFRI_PUBLIC_PORT` | `8080` | Public HTTP listener |
| `DFRI_SECURE_PORT` | `8443` | Secure mTLS listener |
| `DFRI_CA_FILE` | `tools/dfri-verifier/certs/ca-bundle.crt.pem` | Trusted CA bundle (issuing CA + root) |
| `DFRI_SERVER_CERT` | `tools/dfri-verifier/certs/server-chain.crt.pem` | TLS server cert chain (leaf + issuing CA) |
| `DFRI_SERVER_KEY` | `tools/dfri-verifier/certs/server.key.pem` | TLS server key |

## Identity headers set on verified requests

- `X-DFRI-EID-Subject` — certificate common name (prototype identity key)
- `X-DFRI-EID-Subject-DN` — full subject DN
- `X-DFRI-EID-Serial` — certificate serial number
- `X-DFRI-EID-Issuer` — issuer common name
- `X-DFRI-EID-Authorized` — `true`

The proxy strips any client-supplied copies of these headers before proxying.

## Limitations

- Test CA/certificates only; no real identity proofing.
- No CRL/OCSP revocation enforcement yet (upstream uses `caddy-revocation-validator`).
- No app session layer: the header is read per request by middleware/page.
- Only trust these headers when the Next.js origin is reachable **exclusively**
  through this proxy (never expose port 3000 directly in a real deployment).
