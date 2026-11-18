"use client";

/**
 * Browser wallet helpers (client only).
 *
 * Uses the injected EIP-1193 provider (MetaMask and compatible wallets) directly,
 * so no web3 library is required. Only two things are needed: switch to the
 * configured chain and send one ERC-20 `transfer`.
 */

export type EthereumProvider = {
  request(args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
};

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { ethereum?: EthereumProvider })
    .ethereum;
  return candidate ?? null;
}

/** ABI-encode `transfer(address,uint256)` without a web3 dependency. */
export function encodeErc20Transfer(to: string, amountMinor: string): string {
  const selector = "0xa9059cbb";
  const addressWord = to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amountWord = BigInt(amountMinor).toString(16).padStart(64, "0");
  return `${selector}${addressWord}${amountWord}`;
}

export type WalletPaymentRequest = {
  chainId: number;
  networkName: string;
  tokenAddress: string;
  recipient: string;
  amountMinor: string;
  rpcUrl: string | null;
  explorerUrl: string | null;
};

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

async function ensureChain(
  provider: EthereumProvider,
  request: WalletPaymentRequest,
): Promise<void> {
  const chainIdHex = `0x${request.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (errorCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: request.networkName,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: request.rpcUrl ? [request.rpcUrl] : [],
          blockExplorerUrls: request.explorerUrl ? [request.explorerUrl] : [],
        },
      ],
    });
  }
}

export async function sendWalletPayment(
  request: WalletPaymentRequest,
): Promise<{ txHash: string; from: string }> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error(
      "No browser wallet found. Install MetaMask (or another EIP-1193 wallet) and reload.",
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[] | undefined;
  const from = accounts?.[0];
  if (!from) throw new Error("The wallet did not return an account.");

  await ensureChain(provider, request);

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        to: request.tokenAddress,
        value: "0x0",
        data: encodeErc20Transfer(request.recipient, request.amountMinor),
      },
    ],
  })) as string;

  return { txHash, from };
}
