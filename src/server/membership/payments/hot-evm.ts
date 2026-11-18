import "server-only";

import type { HotEvmConfig } from "../config";
import { MembershipError, type VerificationOutcome } from "../service";
import type { Payment } from "../types";
import {
  blockNumber,
  chainId,
  decodeTransferAmount,
  ERC20_TRANSFER_TOPIC,
  getTransactionReceipt,
  getTransferLogs,
  hexToNumber,
  logFrom,
  logTo,
  logTopic0,
} from "./evm-rpc";

/** Refuse to scan an unbounded history for a single intent. */
const MAX_BLOCK_RANGE = 50_000;

/**
 * Verify that a payment intent was settled by an ERC-20 `Transfer` from the
 * payer's wallet to the treasury address.
 *
 * Matching rules:
 *  - correct token contract, chain, recipient and amount (exact minor units);
 *  - `from` must equal the wallet address recorded for the intent;
 *  - the transfer must appear at or after the block recorded when the intent
 *    was created;
 *  - the transaction must be successful and have `minConfirmations` blocks.
 *
 * ERC-20 has no memo field, so a payment is identified by
 * (payer, recipient, token, amount, block window). Reusing a transaction for a
 * second intent is rejected by the membership service.
 */
export async function verifyHotPayment(
  payment: Payment,
  config: HotEvmConfig,
): Promise<VerificationOutcome> {
  if (!config.configured || !config.rpcUrl) {
    throw new MembershipError(
      "rail_unavailable",
      `HOT/EVM rail is not configured (missing ${config.missing.join(", ")}).`,
    );
  }
  if (payment.rail !== "hot-evm") {
    throw new MembershipError(
      "rail_unavailable",
      "This payment was not created for the HOT/EVM rail.",
    );
  }
  if (
    !payment.tokenAddress ||
    !payment.recipientAddress ||
    !payment.startBlock
  ) {
    return {
      status: "failed",
      reason: "Payment intent is missing EVM details.",
    };
  }
  if (!payment.payerAddress) {
    return {
      status: "pending",
      reason: "Wallet address has not been submitted yet.",
    };
  }
  if (payment.chainId !== null && payment.chainId !== config.chainId) {
    return {
      status: "failed",
      reason: "Payment was created for a different chain.",
    };
  }

  const remoteChainId = hexToNumber(await chainId(config.rpcUrl));
  if (remoteChainId !== config.chainId) {
    return {
      status: "failed",
      reason: `RPC endpoint is on chain ${remoteChainId}, expected ${config.chainId}.`,
    };
  }

  const payer = payment.payerAddress;
  const token = payment.tokenAddress;
  const recipient = payment.recipientAddress;
  const startBlock = payment.startBlock;

  const latestHex = await blockNumber(config.rpcUrl);
  const latest = hexToNumber(latestHex);
  const start = hexToNumber(startBlock);

  if (latest - start > MAX_BLOCK_RANGE) {
    return {
      status: "failed",
      reason:
        "The payment intent is too old to verify automatically. Contact the administrators.",
    };
  }

  const logs = await getTransferLogs(config.rpcUrl, {
    tokenAddress: token,
    fromAddress: payer,
    toAddress: recipient,
    fromBlock: startBlock,
  });

  const expectedAmount = BigInt(payment.amountMinor);
  const matches = logs
    .filter((log) => !log.removed)
    .filter((log) => logTopic0(log) === ERC20_TRANSFER_TOPIC)
    .filter((log) => logFrom(log) === payer.toLowerCase())
    .filter((log) => logTo(log) === recipient.toLowerCase())
    .filter((log) => decodeTransferAmount(log.data) === expectedAmount)
    .sort((a, b) => {
      const blockDelta =
        hexToNumber(a.blockNumber) - hexToNumber(b.blockNumber);
      if (blockDelta !== 0) return blockDelta;
      return hexToNumber(a.logIndex) - hexToNumber(b.logIndex);
    });

  const match = matches[0];
  if (!match) {
    return {
      status: "pending",
      reason: "No matching transfer found on chain yet.",
    };
  }

  const receipt = await getTransactionReceipt(
    config.rpcUrl,
    match.transactionHash,
  );
  if (!receipt) {
    return { status: "pending", reason: "Transaction is not yet mined." };
  }
  if (receipt.status !== "0x1") {
    return { status: "failed", reason: "Transaction reverted on chain." };
  }

  const confirmations = latest - hexToNumber(match.blockNumber) + 1;
  if (confirmations < config.minConfirmations) {
    return {
      status: "pending",
      reason: `Waiting for confirmations (${confirmations}/${config.minConfirmations}).`,
    };
  }

  return {
    status: "confirmed",
    txHash: match.transactionHash,
    confirmations,
    payerAddress: logFrom(match),
  };
}
