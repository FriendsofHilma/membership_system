import "server-only";

import { resolve } from "node:path";

/**
 * Membership/payment configuration.
 *
 * Everything is read from `process.env` lazily (on call) rather than at module
 * load so that a missing optional variable never breaks `next build`, and so a
 * deployment can be reconfigured without a code change.
 *
 * No pricing, refund rule or approval threshold is defined here. Every default
 * in this file is either purely operational or explicitly marked provisional in
 * docs/membership.md.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function dataFilePath(): string {
  return (
    str(process.env.MEMBERSHIP_DATA_FILE) ??
    resolve(process.cwd(), ".data", "membership.json")
  );
}

/** Dev-only tools (mock payments, self-test endpoint, seeding). */
export function devToolsEnabled(): boolean {
  return bool(process.env.MEMBERSHIP_ENABLE_DEV_TOOLS, !isProduction());
}

export function seedingEnabled(): boolean {
  return bool(process.env.MEMBERSHIP_SEED_PLANS, !isProduction());
}

/**
 * Provisional rule: a new purchase after an unexpired membership starts when the
 * current one ends, instead of overlapping. Change only after the board decides
 * the actual renewal policy (see docs/membership.md).
 */
export function renewalStacks(): boolean {
  return bool(process.env.MEMBERSHIP_RENEWAL_STACKS, true);
}

/** DFRI certificate subjects allowed to administer members/payments. */
export function adminSubjects(): string[] {
  return (str(process.env.MEMBERSHIP_ADMIN_SUBJECTS) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export type HotEvmConfig = {
  configured: boolean;
  missing: string[];
  rpcUrl: string | null;
  chainId: number;
  tokenAddress: string | null;
  tokenDecimals: number;
  treasuryAddress: string | null;
  minConfirmations: number;
  explorerUrl: string | null;
  networkName: string;
  currencySymbol: string;
};

export function hotEvmConfig(): HotEvmConfig {
  const rpcUrl = str(process.env.HOT_EVM_RPC_URL) ?? null;
  const tokenAddress = str(process.env.HOT_EVM_TOKEN_ADDRESS) ?? null;
  const treasuryAddress = str(process.env.HOT_EVM_TREASURY_ADDRESS) ?? null;

  const missing: string[] = [];
  if (!rpcUrl) missing.push("HOT_EVM_RPC_URL");
  if (!tokenAddress) missing.push("HOT_EVM_TOKEN_ADDRESS");
  if (!treasuryAddress) missing.push("HOT_EVM_TREASURY_ADDRESS");

  return {
    configured: missing.length === 0,
    missing,
    rpcUrl,
    chainId: int(process.env.HOT_EVM_CHAIN_ID, 11155111), // Sepolia
    tokenAddress,
    tokenDecimals: int(process.env.HOT_EVM_TOKEN_DECIMALS, 18),
    treasuryAddress,
    minConfirmations: int(process.env.HOT_EVM_MIN_CONFIRMATIONS, 3),
    explorerUrl: str(process.env.HOT_EVM_EXPLORER_URL) ?? null,
    networkName: str(process.env.HOT_EVM_NETWORK_NAME) ?? "Ethereum Sepolia",
    currencySymbol: str(process.env.HOT_EVM_CURRENCY_SYMBOL) ?? "HOT",
  };
}

/** True when a real (non-mock) payment rail can currently be used. */
export function hasRealPaymentRail(): boolean {
  return hotEvmConfig().configured;
}
