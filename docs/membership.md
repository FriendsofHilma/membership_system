# Membership and payment tool

**Status:** working local prototype, verified 2026-11-17 (domain self-test 19/19,
end-to-end 8/8, EVM verifier 4/4 against a mock node). \
**Scope:** this repository (Next.js 15, App Router, no database), mirrored from
`friendsofhilma_website` so the membership subsystem can be developed, tested
and deployed independently. \
**Not production-ready.** See the checklist at the end.

The tool lets a person pay for access to the internal area. Access is tied to a
verified DFRI-eID identity (the certificate common name), not to a cookie or an
email address.

---

## 1. What exists

| Area                                                            | Where                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Domain types (plans, members, payments, memberships, audit log) | `src/server/membership/types.ts`                            |
| Storage abstraction + JSON file store                           | `src/server/membership/store.ts`                            |
| Domain rules (grants, expiry, revocation, duplicate protection) | `src/server/membership/service.ts`                          |
| Configuration (env only, no pricing)                            | `src/server/membership/config.ts`                           |
| Payment rails registry                                          | `src/server/membership/payments/index.ts`                   |
| HOT / ERC-20 verification                                       | `src/server/membership/payments/hot-evm.ts`                 |
| Dependency-free EVM JSON-RPC client                             | `src/server/membership/payments/evm-rpc.ts`                 |
| Access resolution (identity + membership)                       | `src/server/membership/access.ts`, `identity.ts`            |
| Purchase page + checkout UI                                     | `src/app/membership/`                                       |
| Server actions (create intent, submit tx, verify)               | `src/app/membership/actions.ts`                             |
| Admin: members, payments, grants, revocations, audit            | `src/app/internal/members/`                                 |
| Browser wallet helper (EIP-1193, no web3 library)               | `src/app/membership/wallet.ts`                              |
| Dev self-tests                                                  | `src/app/api/membership/dev/*`                              |
| Smoke tests                                                     | `tools/membership-smoke-test.mjs`, `tools/mock-evm-rpc.mjs` |

### Access rule

```
verified DFRI-eID identity
  AND ( active membership  OR  administrator )
```

`src/middleware.ts` still only checks that an identity header exists. Membership
is enforced in the page and in every server action, because middleware is not a
security boundary for server actions.

---

## 2. Data model

- **Plan** — name, decimal amount, currency, interval (`month`/`year`/`lifetime`),
  access length in days (`null` = lifetime), active flag, `isPlaceholder` flag.
- **Member** — one per DFRI-eID subject; role `member` | `admin`.
- **Payment** — a payment _intent_ with a public reference, rail, integer amount
  in minor units, payer wallet, token, chain, transaction hash, confirmations,
  status (`pending` → `submitted` → `confirmed` | `failed` | `expired`).
- **Membership** — the access grant produced by a confirmed payment (or a manual
  grant): start, expiry (`null` = lifetime), status, revocation reason.
- **AuditEvent** — append-only record of every member/payment/membership change.

Amounts are stored as integer strings in the currency's smallest unit, never as
floats.

### Storage

The prototype uses `JsonFileStore` (`MEMBERSHIP_DATA_FILE`, default
`.data/membership.json`, gitignored). Writes are queued and renamed into place so
a crash cannot leave a half-written ledger. It is **single-process only**.
Replace it with a transactional database before deploying; the `MembershipStore`
interface is the seam.

---

## 3. Payment rails

| Rail       | State                      | What it means                                                                                                 |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `hot-evm`  | **Implemented**            | ERC-20 `Transfer` from the member's wallet to the treasury, verified server-side against an EVM RPC endpoint. |
| `mock`     | **Implemented (dev only)** | Records a real membership without any money. Refused in production and when dev tools are disabled.           |
| `manual`   | **Implemented (admin)**    | An administrator records an offline payment and grants access. Always audited.                                |
| `holofuel` | **Not available**          | Listed in the UI with an explanation, but cannot be paid from a web checkout.                                 |

### Why HoloFuel is not offered

Unyt is peer-to-peer accounting on Holochain. A HoloFuel payment needs a running
Holochain conductor, a Unyt agent with its own key pair, and a smart agreement on
the HoloFuel network. There is no hosted checkout, OIDC-style flow, or HTTP
payment API that a Next.js site can call to "take a HoloFuel payment". The
`unyt-harvester-example` shows how such automation is built server-side, but it
requires `@holochain/client`, `unyt_cli` (Linux x86-64), and a long-running
conductor process.

So HoloFuel is **not faked**. The rail is reported as unavailable with a reason,
and manual grants cover the case in the meantime. A future `unytConductor`
adapter can implement the same `Payment`/`VerificationOutcome` contract.

### Why HOT is offered

HOT is an ERC-20 token. Unyt itself bridges HOT through MetaMask, so paying HOT
from a browser wallet is a normal on-chain transfer — something a website can
verify. This gives a real, non-custodial payment path today.

---

## 4. HOT payment flow

```
member                     server                          chain
  │  choose plan + rail       │                               │
  ├─────────────────────────► │ create Payment(pending)        │
  │                           ├─ eth_blockNumber ────────────► │ startBlock
  │ ◄──── reference, amount, token, treasury ────────────────┤
  │  wallet: ERC-20 transfer  │                               │
  ├──────────────────────────────────────────────────────────►│
  │  submit {reference, txHash, wallet}                       │
  ├─────────────────────────► │ markSubmitted                  │
  │                           ├─ eth_chainId / eth_getLogs ──► │
  │                           ├─ eth_getTransactionReceipt ──► │
  │                           ├─ match: from, to, token,      │
  │                           │   exact amount, ≥ N blocks    │
  │                           ├─ confirm → create Membership   │
  │ ◄──── confirmed ──────────┤                               │
```

Verification rules (`hot-evm.ts`):

1. RPC endpoint chain id equals the configured chain id.
2. `Transfer` log for the configured token contract.
3. `from` equals the wallet recorded on the intent.
4. `to` equals the treasury address.
5. Amount equals the intent amount **exactly** (no partial credit).
6. Log block ≥ the block recorded when the intent was created.
7. Transaction status `0x1` and at least `HOT_EVM_MIN_CONFIRMATIONS` blocks.
8. The same transaction hash can never pay two intents (enforced in the service).

### Matching limitation

ERC-20 transfers have no memo field, so an intent is identified by
`(payer, treasury, token, exact amount, block window)`. Two identical purchases
by the same wallet could in principle be matched to the wrong intent; the
duplicate-transaction guard prevents double credit, and the earliest matching
transfer is used. A reference-bearing transfer (e.g. a payment contract or
`transferAndCall`) would remove this ambiguity and is the recommended upgrade
before real money is involved.

---

## 5. Configuration

All variables are optional; with none set, only the development mock rail works.
See `.env.example`.

| Variable                                                                  | Purpose                                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MEMBERSHIP_ADMIN_SUBJECTS`                                               | Comma-separated DFRI-eID subjects with admin rights. Empty = nobody.               |
| `MEMBERSHIP_DATA_FILE`                                                    | Ledger path (default `.data/membership.json`).                                     |
| `MEMBERSHIP_SEED_PLANS`                                                   | Seed the placeholder plans (default: true outside production).                     |
| `MEMBERSHIP_ENABLE_DEV_TOOLS`                                             | Enable mock payments + `/api/membership/dev/*` (default: true outside production). |
| `MEMBERSHIP_RENEWAL_STACKS`                                               | Start a new purchase after the current one ends (default: true).                   |
| `MEMBERSHIP_CURRENCY`                                                     | Unit symbol used by the placeholder plans (default `HOT`).                         |
| `HOT_EVM_RPC_URL`                                                         | JSON-RPC endpoint.                                                                 |
| `HOT_EVM_CHAIN_ID`                                                        | Chain id (default `11155111`, Sepolia).                                            |
| `HOT_EVM_TOKEN_ADDRESS`                                                   | ERC-20 contract to accept.                                                         |
| `HOT_EVM_TOKEN_DECIMALS`                                                  | Token decimals (default 18).                                                       |
| `HOT_EVM_TREASURY_ADDRESS`                                                | Address that receives payments.                                                    |
| `HOT_EVM_MIN_CONFIRMATIONS`                                               | Confirmations required (default 3).                                                |
| `HOT_EVM_NETWORK_NAME`, `HOT_EVM_EXPLORER_URL`, `HOT_EVM_CURRENCY_SYMBOL` | Display only.                                                                      |

### Enabling a HOT test payment

1. Deploy a throwaway ERC-20 on Sepolia (any test token) or use an existing test
   token. The real HOT mainnet contract is **not** a test asset.
2. Create a treasury wallet and note its address.
3. Set the `HOT_EVM_*` variables and restart the dev server.
4. The membership page will show the HOT rail as available instead of
   "Not configured".
5. Add your DFRI-eID test subject to `MEMBERSHIP_ADMIN_SUBJECTS` to reach
   `/internal/members`.

The wallet must be on the configured chain; the checkout asks the wallet to
switch (and to add the chain if unknown).

---

## 6. Running it

```bash
# 1) certificates + app + verifier (see docs/dfri-eid-prototype.md)
wsl -d Ubuntu -e bash tools/dfri-verifier/generate-test-certs.sh
npm run dev
node tools/dfri-verifier/verifier.mjs

# 2) verify the whole membership stack
node tools/membership-smoke-test.mjs

# 3) optional: verify the ERC-20 matcher against a mock node
node tools/mock-evm-rpc.mjs                     # terminal 3
# restart the dev server with MOCK_EVM_RPC_URL=http://127.0.0.1:8599
# then open: https://localhost:8443/api/membership/dev/evm-selftest
```

Pages:

- `http://localhost:8080/membership` — public plan overview, purchase requires sign-in
- `https://localhost:8443/membership` — checkout for a verified identity
- `https://localhost:8443/internal` — member area (membership or admin required)
- `https://localhost:8443/internal/members` — admin: members, payments, audit log

### Development endpoints

Both require a verified identity and `MEMBERSHIP_ENABLE_DEV_TOOLS`.

- `GET /api/membership/dev/selftest` — runs the domain rules against an isolated
  in-memory ledger (17 checks). Does not touch real data.
- `GET /api/membership/dev/evm-selftest` — runs the ERC-20 matcher against
  `MOCK_EVM_RPC_URL` (4 checks: exact payment, wrong amount, wrong chain, no wallet).
- `POST /api/membership/dev/mock-purchase` `{"planId": "..."}` — completes a mock
  purchase for the current identity, through the real ledger and access checks.

---

## 7. Pricing: what is decided

| Plan                | Price       | Duration | On sale                           |
| ------------------- | ----------- | -------- | --------------------------------- |
| Member — 12 months  | **200 HOT** | 365 days | Yes (decided 2026-11-17)          |
| Supporter — monthly | —           | 30 days  | No — price not approved           |
| Patron — lifetime   | —           | lifetime | No — price and terms not approved |

Draft tiers are seeded with `active: false` and no amount, so they cannot be
bought by accident. They are listed on the membership page as “not on sale yet”.

## 8. Decisions that are deliberately NOT made

These are policy, not engineering. The prototype contains **fabricated** test
plans so the flow can be exercised; they are flagged `isPlaceholder` and shown
with a warning. Nothing below has been approved.

1. **Remaining prices** for the monthly and lifetime tiers, and whether any tier is priced in EUR/USD or HoloFuel rather than HOT.
2. **Intervals**: monthly, annual, lifetime — and whether lifetime exists at all.
3. **Refunds** and cancellation: pro-rata, none, or discretionary?
4. **Grace periods** after expiry, and whether content stays readable.
5. **Renewal stacking**: the code currently starts a new purchase when the
   current one ends (`MEMBERSHIP_RENEWAL_STACKS=true`). Confirm or change.
6. **Approval rules**: may any single admin grant or revoke? Is a second approval
   required above a threshold?
7. **Manual grants**: which offline payment methods are acceptable (bank transfer,
   cash, other)?
8. **Tax treatment** of membership income and of token receipts, and what
   receipt/invoice a member gets.
9. **HoloFuel strategy**: whether to require Unyt agents at all, or accept HOT
   only.
10. **Data retention / privacy**: how long identity subjects, wallet addresses and
    payment records are kept, and who can see them.
11. **Who is an administrator**, and how that survives staff changes.
12. **Whether the internal area is a paid product at all** — the login prototype
    and the membership tool are independent.

---

## 9. Production readiness checklist

| Area             | Required before real money                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Database         | Replace `JsonFileStore` with a transactional DB; unique constraints on reference and tx hash.              |
| Sessions         | Issue a server-side session after mTLS instead of trusting headers per request.                            |
| Authorization    | Re-check membership/admin on every action and route (already done) and add rate limiting.                  |
| Payment matching | Reference-bearing transfers or per-intent deposit addresses; remove amount-only matching.                  |
| Reconciliation   | A job that re-verifies `submitted` payments and expires stale intents; alerting on mismatches.             |
| Refunds          | Not implemented. Decide policy before accepting money.                                                     |
| Receipts         | Not implemented. Decide what members receive for tax/accounting.                                           |
| Audit log        | Append-only storage outside the app database, with retention policy.                                       |
| Key management   | Treasury address and RPC credentials in a managed secret store, not `.env` on a laptop.                    |
| Hosting          | mTLS at the edge, app origin unreachable except through the verifier.                                      |
| Legal            | Terms, privacy notice, refund policy, and confirmation that token payments are acceptable for a 501(c)(3). |

---

## 10. Security notes

- The client never confirms its own payment. It submits a transaction hash; the
  server verifies chain state.
- Mock payments are impossible in production (`MEMBERSHIP_ENABLE_DEV_TOOLS`
  defaults to false, and `/api/membership/dev/*` returns 404 when disabled).
- Admin actions require an admin identity on the server and are audited with the
  acting subject.
- No private keys exist in the application: members pay from their own wallet.
- Amounts are integers; there is no floating-point money anywhere.
- The JSON store is not encrypted. It contains identity subjects and wallet
  addresses — treat it as personal data.
