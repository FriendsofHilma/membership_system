#!/usr/bin/env node
/**
 * Mock EVM JSON-RPC node for testing the HOT/ERC-20 payment verifier.
 *
 * Serves exactly one synthetic, successful ERC-20 `Transfer` from the address
 * requested by `eth_getLogs` to the address requested by `eth_getLogs`, at block
 * 254 while the head is 256 (3 confirmations).
 *
 *   node tools/mock-evm-rpc.mjs
 *   MOCK_EVM_RPC_URL=http://127.0.0.1:8599 (see docs/membership.md)
 *
 * TEST ONLY. Not a chain.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_EVM_PORT ?? 8599);
const CHAIN_ID = Number(process.env.MOCK_EVM_CHAIN_ID ?? 11155111);
const AMOUNT = BigInt(process.env.MOCK_EVM_AMOUNT ?? "1000000000000000000");
const HEAD_BLOCK = 256;
const LOG_BLOCK = 254;
const TX_HASH = `0x${"ab".repeat(32)}`;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function pad(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function logFor(params) {
  const topics = params.topics ?? [];
  return {
    address: params.address,
    topics: [TRANSFER_TOPIC, topics[1], topics[2]],
    data: pad(AMOUNT),
    blockNumber: `0x${LOG_BLOCK.toString(16)}`,
    transactionHash: TX_HASH,
    logIndex: "0x0",
    removed: false,
  };
}

const server = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { code: -32700, message: "parse error" } }),
      );
      return;
    }

    const method = payload.method;
    const params = payload.params ?? [];
    let result = null;

    if (method === "eth_chainId") {
      result = `0x${CHAIN_ID.toString(16)}`;
    } else if (method === "eth_blockNumber") {
      result = `0x${HEAD_BLOCK.toString(16)}`;
    } else if (method === "eth_getLogs") {
      result = [logFor(params[0] ?? {})];
    } else if (method === "eth_getTransactionReceipt") {
      result = {
        status: "0x1",
        blockNumber: `0x${LOG_BLOCK.toString(16)}`,
        transactionHash: TX_HASH,
        from: "0x0000000000000000000000000000000000000000",
        to: params[0] ?? null,
        logs: [],
      };
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          error: { code: -32601, message: `unsupported method ${method}` },
        }),
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock EVM RPC on http://127.0.0.1:${PORT}`);
  console.log(`  chainId=${CHAIN_ID} amount=${AMOUNT} confirmations=3`);
});
