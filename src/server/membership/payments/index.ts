import "server-only";

import { devToolsEnabled, hotEvmConfig, type HotEvmConfig } from "../config";
import { MembershipError, type MembershipService } from "../service";
import type { Payment, PaymentRailId } from "../types";
import { blockNumber } from "./evm-rpc";
import { verifyHotPayment } from "./hot-evm";

export type RailKind = "mock" | "evm-erc20" | "unavailable";

export type RailInfo = {
  id: PaymentRailId;
  label: string;
  kind: RailKind;
  available: boolean;
  reason?: string;
};

/**
 * Payment rails the tool knows about. Only rails reported as `available` are
 * offered in the checkout UI.
 */
export function listPaymentRails(): RailInfo[] {
  const hot = hotEvmConfig();

  return [
    {
      id: "hot-evm",
      label: `HOT (${hot.networkName})`,
      kind: "evm-erc20",
      available: hot.configured,
      reason: hot.configured
        ? undefined
        : `Not configured. Set ${hot.missing.join(", ")}.`,
    },
    {
      id: "mock",
      label: "Test payment (no money)",
      kind: "mock",
      available: devToolsEnabled(),
      reason: devToolsEnabled()
        ? undefined
        : "Disabled outside development. Set MEMBERSHIP_ENABLE_DEV_TOOLS=true to enable.",
    },
    {
      id: "holofuel",
      label: "HoloFuel (Unyt)",
      kind: "unavailable",
      available: false,
      reason:
        "HoloFuel is a Unyt network currency. It needs a Holochain conductor and a Unyt agent, so it cannot be paid from a web checkout yet. Use HOT or a manual grant.",
    },
  ];
}

export function getRailInfo(rail: PaymentRailId): RailInfo {
  const info = listPaymentRails().find((entry) => entry.id === rail);
  if (!info) {
    throw new MembershipError(
      "rail_unavailable",
      `Unknown payment rail "${rail}".`,
    );
  }
  return info;
}

/**
 * Create a HOT/EVM intent. Records the current block so verification only
 * considers transfers made from now on.
 */
export async function createHotEvmIntent(
  service: MembershipService,
  input: { subject: string; planId: string },
): Promise<{ payment: Payment; config: HotEvmConfig }> {
  const config = hotEvmConfig();
  if (
    !config.configured ||
    !config.rpcUrl ||
    !config.tokenAddress ||
    !config.treasuryAddress
  ) {
    throw new MembershipError(
      "rail_unavailable",
      `HOT/EVM rail is not configured (missing ${config.missing.join(", ")}).`,
    );
  }

  const startBlock = await blockNumber(config.rpcUrl);

  const payment = await service.createPaymentIntent({
    subject: input.subject,
    planId: input.planId,
    rail: "hot-evm",
    evm: {
      chainId: config.chainId,
      tokenAddress: config.tokenAddress,
      recipientAddress: config.treasuryAddress,
      decimals: config.tokenDecimals,
      startBlock,
    },
  });

  return { payment, config };
}

export type VerifyPaymentResult = {
  payment: Payment;
  confirmed: boolean;
  message: string;
};

/** Re-check a single payment against its rail and apply the outcome. */
export async function verifyPayment(
  service: MembershipService,
  reference: string,
  actor: string,
): Promise<VerifyPaymentResult> {
  const payment = await service.getPaymentByReference(reference);
  if (!payment) {
    throw new MembershipError(
      "payment_not_found",
      "Unknown payment reference.",
    );
  }

  if (payment.status === "confirmed") {
    return {
      payment,
      confirmed: true,
      message: "Payment is already confirmed.",
    };
  }

  if (payment.rail === "manual") {
    return {
      payment,
      confirmed: true,
      message: "Manual grant already recorded.",
    };
  }

  if (payment.rail === "mock") {
    if (!devToolsEnabled()) {
      throw new MembershipError(
        "rail_unavailable",
        "Mock payments are disabled in this environment.",
      );
    }
    const outcome = await service.applyVerification(
      reference,
      {
        status: "confirmed",
        txHash: `mock:${payment.reference}`,
        confirmations: 1,
        payerAddress: payment.payerAddress ?? "mock-wallet",
      },
      { actor },
    );
    return {
      payment: outcome.payment,
      confirmed: true,
      message: "Test payment accepted (development only).",
    };
  }

  if (payment.rail === "hot-evm") {
    const config = hotEvmConfig();
    if (!config.configured) {
      throw new MembershipError(
        "rail_unavailable",
        `HOT/EVM rail is not configured (missing ${config.missing.join(", ")}).`,
      );
    }
    const outcome = await verifyHotPayment(payment, config);
    const applied = await service.applyVerification(reference, outcome, {
      actor,
    });

    if (outcome.status === "confirmed") {
      return {
        payment: applied.payment,
        confirmed: true,
        message: `Payment confirmed with ${outcome.confirmations} confirmation(s).`,
      };
    }
    return {
      payment: applied.payment,
      confirmed: false,
      message:
        outcome.status === "failed"
          ? `Payment failed: ${outcome.reason}`
          : `Payment not confirmed yet: ${outcome.reason}`,
    };
  }

  throw new MembershipError(
    "rail_unavailable",
    "This payment rail cannot be verified yet.",
  );
}

export {
  ERC20_TRANSFER_SELECTOR,
  padAddressTopic,
  padUint256,
} from "./evm-rpc";
