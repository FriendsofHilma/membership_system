import "server-only";

import { seedingEnabled } from "./config";
import { getMembershipService } from "./service";
import type { Plan } from "./types";

/**
 * Plan definitions used to seed a development/staging ledger.
 *
 * Only plans with `isPlaceholder: false` carry an approved price. Draft tiers
 * are seeded with no price and `active: false`, so they cannot be bought until
 * someone decides what they cost — see docs/membership.md §7.
 *
 * Approved so far:
 *   - 12 months of access for 200 HOT (decided 2026-11-17).
 */
export type PlanSeed = Omit<Plan, "createdAt" | "updatedAt">;

/** Approved prices are quoted in HOT; drafts use the configured unit only as a label. */
const APPROVED_CURRENCY = "HOT";

export function planSeeds(): PlanSeed[] {
  const draftCurrency = seedCurrency();

  return [
    {
      id: "plan_supporter_monthly",
      code: "supporter-monthly",
      name: "Supporter — monthly",
      description:
        "One month of access to the internal research area. Price not approved yet.",
      amount: "0",
      currency: draftCurrency,
      interval: "month",
      durationDays: 30,
      active: false,
      isPlaceholder: true,
    },
    {
      id: "plan_supporter_yearly",
      code: "supporter-yearly",
      name: "Member — 12 months",
      description: "Twelve months of access to the internal research area.",
      amount: "200",
      currency: APPROVED_CURRENCY,
      interval: "year",
      durationDays: 365,
      active: true,
      isPlaceholder: false,
    },
    {
      id: "plan_patron_lifetime",
      code: "patron-lifetime",
      name: "Patron — lifetime",
      description:
        "Lifetime access. Price and lifetime terms are not approved yet.",
      amount: "0",
      currency: draftCurrency,
      interval: "lifetime",
      durationDays: null,
      active: false,
      isPlaceholder: true,
    },
  ];
}

export function seedCurrency(): string {
  return process.env.MEMBERSHIP_CURRENCY?.trim() || "HOT";
}

/** Idempotently insert or update the seed plans in non-production environments. */
export async function ensureMembershipSeed(): Promise<void> {
  if (!seedingEnabled()) return;
  const service = getMembershipService();
  await service.ensureSeed(planSeeds());
}
