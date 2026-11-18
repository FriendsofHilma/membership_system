import "server-only";

/**
 * Minimal JSON-RPC client for EVM chains.
 *
 * Deliberately dependency-free (global `fetch`) so the prototype gains no wallet
 * or web3 library. Only the handful of calls needed to verify an ERC-20
 * transfer are implemented.
 */

export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
};

export type RpcReceipt = {
  status: string;
  blockNumber: string;
  transactionHash: string;
  from: string;
  to: string | null;
  logs: RpcLog[];
};

/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

export class RpcError extends Error {
  readonly code: string;

  constructor(message: string, code = "rpc_error") {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      // Never let a slow node hang a server action indefinitely.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new RpcError(
      `Could not reach the chain RPC endpoint: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new RpcError(`Chain RPC returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };

  if (payload.error) {
    throw new RpcError(
      `Chain RPC error ${payload.error.code}: ${payload.error.message}`,
    );
  }
  if (payload.result === undefined) {
    throw new RpcError("Chain RPC returned no result.");
  }
  return payload.result;
}

export function blockNumber(rpcUrl: string): Promise<string> {
  return rpc<string>(rpcUrl, "eth_blockNumber", []);
}

export function chainId(rpcUrl: string): Promise<string> {
  return rpc<string>(rpcUrl, "eth_chainId", []);
}

export function getTransferLogs(
  rpcUrl: string,
  input: {
    tokenAddress: string;
    fromAddress: string;
    toAddress: string;
    fromBlock: string;
  },
): Promise<RpcLog[]> {
  return rpc<RpcLog[]>(rpcUrl, "eth_getLogs", [
    {
      address: input.tokenAddress,
      fromBlock: toHexQuantity(input.fromBlock),
      toBlock: "latest",
      topics: [
        ERC20_TRANSFER_TOPIC,
        padAddressTopic(input.fromAddress),
        padAddressTopic(input.toAddress),
      ],
    },
  ]);
}

export function getTransactionReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<RpcReceipt | null> {
  return rpc<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
}

function toHexQuantity(value: string): string {
  if (value.startsWith("0x")) return value;
  const parsed = BigInt(value);
  return `0x${parsed.toString(16)}`;
}

/** Left-pad a 20-byte address into a 32-byte log topic. */
export function padAddressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/** Right-pad/left-pad a uint256 into a 32-byte log data word. */
export function padUint256(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

/** Decode the single uint256 word of an ERC-20 Transfer log. */
export function decodeTransferAmount(data: string): bigint | null {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 64) return null;
  try {
    return BigInt(`0x${hex.slice(0, 64)}`);
  } catch {
    return null;
  }
}

/** First topic of a log, lowercase. */
export function logTopic0(log: RpcLog): string {
  return (log.topics[0] ?? "").toLowerCase();
}

export function logFrom(log: RpcLog): string {
  const topic = log.topics[1] ?? "";
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export function logTo(log: RpcLog): string {
  const topic = log.topics[2] ?? "";
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export function hexToNumber(value: string): number {
  return Number.parseInt(value.startsWith("0x") ? value.slice(2) : value, 16);
}
