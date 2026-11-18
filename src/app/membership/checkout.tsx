"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatMinorToDecimal } from "~/server/membership/money";

import {
  confirmMockPaymentAction,
  refreshPaymentAction,
  startCheckoutAction,
  submitHotPaymentAction,
} from "./actions";
import type {
  CheckoutInstructions,
  PlanView,
  RailView,
} from "./checkout-types";
import { sendWalletPayment } from "./wallet";

type Props = {
  plans: PlanView[];
  rails: RailView[];
  signedIn: boolean;
};

type Started = {
  reference: string;
  amountDisplay: string;
  instructions: CheckoutInstructions;
};

export function Checkout({ plans, rails, signedIn }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [rail, setRail] = useState(
    rails.find((entry) => entry.available)?.id ?? "hot-evm",
  );
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    confirmed: boolean;
    message: string;
  } | null>(null);

  const selectedRail = rails.find((entry) => entry.id === rail);

  function begin() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await startCheckoutAction({ planId, rail });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStarted({
        reference: result.reference,
        amountDisplay: result.amountDisplay,
        instructions: result.instructions,
      });
    });
  }

  function pay(details: Started) {
    if (!signedIn) {
      setError("Sign in with DFRI-eID first.");
      return;
    }
    if (details.instructions.kind === "mock") {
      startTransition(async () => {
        const result = await confirmMockPaymentAction({
          reference: details.reference,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStatus({ confirmed: result.confirmed, message: result.message });
        if (result.confirmed) router.refresh();
      });
      return;
    }

    startTransition(async () => {
      try {
        const sent = await sendWalletPayment({
          chainId:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.chainId
              : 0,
          networkName:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.networkName
              : "Unknown network",
          tokenAddress:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.tokenAddress
              : "",
          recipient:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.recipient
              : "",
          amountMinor:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.amountMinor
              : "0",
          rpcUrl:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.rpcUrl
              : null,
          explorerUrl:
            details.instructions.kind === "evm-erc20"
              ? details.instructions.explorerUrl
              : null,
        });
        setTxHash(sent.txHash);

        const result = await submitHotPaymentAction({
          reference: details.reference,
          txHash: sent.txHash,
          payerAddress: sent.from,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStatus({ confirmed: result.confirmed, message: result.message });
        if (result.confirmed) router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The wallet payment failed.",
        );
      }
    });
  }

  function checkAgain(reference: string) {
    startTransition(async () => {
      const result = await refreshPaymentAction({ reference });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus({ confirmed: result.confirmed, message: result.message });
      if (result.confirmed) router.refresh();
    });
  }

  if (plans.length === 0) {
    return (
      <div className="border border-amber-300 bg-amber-50 p-6 text-sm">
        No membership plans are configured yet. Plans, prices and terms must be
        decided by the foundation before the checkout can be used.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <fieldset className="space-y-4" disabled={!signedIn || isPending}>
        <legend className="mb-3 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          1. Choose a plan
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const selected = plan.id === planId;
            return (
              <label
                key={plan.id}
                className={`cursor-pointer border p-5 transition ${
                  selected
                    ? "border-black bg-neutral-50"
                    : "border-black/15 hover:border-black/40"
                } ${!signedIn ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={selected}
                  onChange={() => {
                    setPlanId(plan.id);
                    setStarted(null);
                    setStatus(null);
                  }}
                  className="sr-only"
                />
                <span className="block font-semibold">{plan.name}</span>
                <span className="mt-1 block text-2xl font-medium">
                  {plan.amountDisplay}
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-neutral-600">
                  {plan.description}
                </span>
                {plan.isPlaceholder ? (
                  <span className="mt-3 block text-[11px] font-semibold tracking-wider text-amber-700 uppercase">
                    Placeholder price
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={!signedIn || isPending}>
        <legend className="mb-3 text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
          2. Choose a payment method
        </legend>
        {rails.map((entry) => (
          <label
            key={entry.id}
            className={`flex cursor-pointer items-start gap-3 border p-4 ${
              entry.id === rail
                ? "border-black bg-neutral-50"
                : "border-black/15"
            } ${!entry.available || !signedIn ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="rail"
              value={entry.id}
              checked={entry.id === rail}
              disabled={!entry.available}
              onChange={() => {
                setRail(entry.id);
                setStarted(null);
                setStatus(null);
              }}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="block font-medium">{entry.label}</span>
              {entry.reason ? (
                <span className="mt-1 block text-xs text-neutral-600">
                  {entry.reason}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      {!signedIn ? (
        <div className="border border-black/15 bg-neutral-50 p-5 text-sm">
          <p className="mb-3">
            You need a verified DFRI-eID identity before you can purchase a
            membership or open the member area.
          </p>
          <Link
            href="/internal/login"
            className="inline-block border border-black bg-black px-5 py-2 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800"
          >
            Sign in with DFRI-eID
          </Link>
        </div>
      ) : null}

      {signedIn && !started ? (
        <button
          type="button"
          onClick={begin}
          disabled={isPending || !planId || !selectedRail?.available}
          className="border border-black bg-black px-6 py-3 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Preparing…" : "Continue to payment"}
        </button>
      ) : null}

      {error ? (
        <p className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {started ? (
        <div className="space-y-4 border border-black/15 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">Complete your payment</h3>
            <span className="font-mono text-xs text-neutral-600">
              {started.reference}
            </span>
          </div>
          <p className="text-sm text-neutral-700">
            Amount due: <strong>{started.amountDisplay}</strong>
          </p>

          {started.instructions.kind === "mock" ? (
            <div className="space-y-3 border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-medium">Development payment</p>
              <p>
                This confirms the membership{" "}
                <strong>without any real money</strong>. It exists so the flow
                can be tested. It is disabled in production.
              </p>
              <button
                type="button"
                onClick={() => pay(started)}
                disabled={isPending}
                className="border border-black bg-black px-5 py-2 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPending ? "Confirming…" : "Simulate successful payment"}
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                    Network
                  </dt>
                  <dd>{started.instructions.networkName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                    Amount
                  </dt>
                  <dd className="font-mono">
                    {formatMinorToDecimal(
                      started.instructions.amountMinor,
                      started.instructions.decimals,
                    )}{" "}
                    tokens
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                    Token contract
                  </dt>
                  <dd className="font-mono text-xs break-all">
                    {started.instructions.tokenAddress}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
                    Treasury address
                  </dt>
                  <dd className="font-mono text-xs break-all">
                    {started.instructions.recipient}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-neutral-600">
                The server verifies the ERC-20 transfer on chain (from your
                wallet, to the treasury, exact amount, at least{" "}
                {started.instructions.minConfirmations} confirmation
                {started.instructions.minConfirmations === 1 ? "" : "s"}). Never
                send tokens to a different address.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => pay(started)}
                  disabled={isPending}
                  className="border border-black bg-black px-5 py-2 text-xs font-semibold tracking-[0.15em] text-white uppercase hover:bg-neutral-800 disabled:opacity-50"
                >
                  {isPending ? "Working…" : "Connect wallet and pay"}
                </button>
                <button
                  type="button"
                  onClick={() => checkAgain(started.reference)}
                  disabled={isPending}
                  className="border border-black px-5 py-2 text-xs font-semibold tracking-[0.15em] uppercase hover:bg-neutral-100 disabled:opacity-50"
                >
                  Check payment status
                </button>
              </div>
              {txHash ? (
                <p className="font-mono text-xs break-all text-neutral-600">
                  Transaction: {txHash}
                </p>
              ) : null}
            </div>
          )}

          {status ? (
            <div
              className={`border p-4 text-sm ${
                status.confirmed
                  ? "border-green-300 bg-green-50 text-green-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <p>{status.message}</p>
              {status.confirmed ? (
                <Link className="mt-2 inline-block underline" href="/internal">
                  Go to the member area
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
