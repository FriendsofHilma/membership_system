/**
 * Decimal <-> minor-unit helpers.
 *
 * Kept dependency-free and integer-only so financial amounts never pass through
 * a JavaScript float.
 */

export function parseDecimalToMinor(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: "${amount}"`);
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `Amount "${amount}" has more than ${decimals} decimal places.`,
    );
  }
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(`${whole}${padded}`);
}

export function formatMinorToDecimal(
  amountMinor: string | bigint,
  decimals: number,
): string {
  const value = BigInt(amountMinor);
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmedFraction = fraction.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return trimmedFraction.length > 0
    ? `${sign}${whole}.${trimmedFraction}`
    : `${sign}${whole}`;
}

/** Render an amount for display, keeping at most `maxFractionDigits`. */
export function formatAmount(
  amountMinor: string | bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const full = formatMinorToDecimal(amountMinor, decimals);
  const [whole = "0", fraction = ""] = full.split(".");
  if (fraction.length <= maxFractionDigits) return full;
  const cut = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return cut.length > 0 ? `${whole}.${cut}` : whole;
}
