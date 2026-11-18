import { NextResponse } from "next/server";

import { devToolsEnabled, type HotEvmConfig } from "~/server/membership/config";
import { currentIdentity } from "~/server/membership/identity";
import { verifyHotPayment } from "~/server/membership/payments/hot-evm";
import type { Payment } from "~/server/membership/types";

export const dynamic = "force-dynamic";

const TOKEN = "0x2222222222222222222222222222222222222222";
const TREASURY = "0x3333333333333333333333333333333333333333";
const PAYER = "0x1111111111111111111111111111111111111111";
const AMOUNT = "1000000000000000000";

function basePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay_evm_selftest",
    reference: "EVMSELFTEST",
    memberId: "mem_evm_selftest",
    planId: "plan_supporter_monthly",
    rail: "hot-evm",
    status: "submitted",
    amountMinor: AMOUNT,
    currency: "HOT",
    amountDisplay: "1.00 HOT",
    payerAddress: PAYER,
    recipientAddress: TREASURY,
    tokenAddress: TOKEN,
    chainId: 11155111,
    txHash: null,
    startBlock: "0xfa",
    confirmations: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    verifiedAt: null,
    ...overrides,
  };
}

/**
 * DEVELOPMENT ONLY: exercise the HOT/ERC-20 verifier against a mock JSON-RPC
 * node (tools/mock-evm-rpc.mjs). Requires MOCK_EVM_RPC_URL.
 */
export async function GET() {
  if (!devToolsEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Dev tools are disabled." },
      { status: 404 },
    );
  }

  const identity = await currentIdentity();
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: "A verified DFRI-eID identity is required." },
      { status: 401 },
    );
  }

  const rpcUrl = process.env.MOCK_EVM_RPC_URL?.trim();
  if (!rpcUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "MOCK_EVM_RPC_URL is not set. Start tools/mock-evm-rpc.mjs and set it on the dev server.",
      },
      { status: 503 },
    );
  }

  const config: HotEvmConfig = {
    configured: true,
    missing: [],
    rpcUrl,
    chainId: 11155111,
    tokenAddress: TOKEN,
    tokenDecimals: 18,
    treasuryAddress: TREASURY,
    minConfirmations: 3,
    explorerUrl: null,
    networkName: "Mock EVM",
    currencySymbol: "HOT",
  };

  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
  };

  try {
    const exact = await verifyHotPayment(basePayment(), config);
    check(
      "exact ERC-20 transfer is confirmed",
      exact.status === "confirmed",
      exact.status,
    );

    const wrongAmount = await verifyHotPayment(
      basePayment({ amountMinor: (BigInt(AMOUNT) + 1n).toString() }),
      config,
    );
    check(
      "an under/over-payment is not confirmed",
      wrongAmount.status === "pending",
      wrongAmount.status,
    );

    const wrongChain = await verifyHotPayment(basePayment(), {
      ...config,
      chainId: 1,
    });
    check(
      "a chain mismatch is rejected",
      wrongChain.status === "failed",
      wrongChain.status,
    );

    const noPayer = await verifyHotPayment(
      basePayment({ payerAddress: null }),
      config,
    );
    check(
      "a payment without a wallet is not confirmed",
      noPayer.status === "pending",
      noPayer.status,
    );
  } catch (error) {
    check("verifier ran without throwing", false, (error as Error).message);
  }

  const failed = checks.filter((entry) => !entry.ok);
  return NextResponse.json(
    {
      ok: failed.length === 0,
      passed: checks.length - failed.length,
      total: checks.length,
      checks,
    },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
