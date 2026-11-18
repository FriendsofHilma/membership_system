/**
 * Types shared by the membership checkout server actions and the client UI.
 * Kept in a plain module so the client never imports a `"use server"` file for
 * anything other than the actions themselves.
 */

export type PlanView = {
  id: string;
  name: string;
  description: string;
  /** Already formatted, e.g. "1.00 HOT". */
  amountDisplay: string;
  interval: string;
  durationDays: number | null;
  isPlaceholder: boolean;
};

export type RailView = {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
};

export type EvmInstructions = {
  kind: "evm-erc20";
  chainId: number;
  networkName: string;
  tokenAddress: string;
  recipient: string;
  amountMinor: string;
  decimals: number;
  minConfirmations: number;
  explorerUrl: string | null;
  rpcUrl: string | null;
};

export type CheckoutInstructions = { kind: "mock" } | EvmInstructions;

export type StartCheckoutResult =
  | {
      ok: true;
      reference: string;
      amountDisplay: string;
      instructions: CheckoutInstructions;
    }
  | { ok: false; error: string };

export type PaymentActionResult =
  | { ok: true; confirmed: boolean; message: string; reference: string }
  | { ok: false; error: string };
