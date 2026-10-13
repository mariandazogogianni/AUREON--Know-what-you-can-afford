/**
 * Money utilities.
 *
 * All monetary values are handled as integer "cents" internally to avoid the
 * classic floating point errors of binary floating arithmetic (e.g.
 * `0.1 + 0.2 !== 0.3`). User-facing values are plain euro amounts (numbers),
 * which we convert to/from cents at the boundaries.
 */

/** A monetary amount expressed as an integer number of euro cents. */
export type Cents = number;

const LOCALE = "el-GR";
const CURRENCY = "EUR";

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format an integer amount of cents as a Greek-style EUR currency string,
 * e.g. `formatCents(123456)` -> `"1.234,56 €"`.
 */
export function formatCents(cents: Cents): string {
  return currencyFormatter.format(cents / 100);
}

/**
 * Format an integer amount of cents without the currency symbol.
 * Useful inside inputs/labels where the symbol is shown separately.
 */
export function formatCentsValue(cents: Cents): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Format an integer amount of cents as whole euros (no decimals). */
export function formatCentsCompact(cents: Cents): string {
  return compactCurrencyFormatter.format(cents / 100);
}

/** Format cents with an explicit leading sign, e.g. `+120,00 €` / `-40,00 €`. */
export function formatCentsSigned(cents: Cents): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  return `${sign}${formatCents(Math.abs(cents))}`;
}

/**
 * Convert a euro amount (e.g. `12.5`) to integer cents, rounding to the
 * nearest cent with "round half away from zero" behaviour.
 *
 * A naive `Math.round(euros * 100)` is unreliable because binary floating point
 * stores values like `1.005` as `1.0049999…`, which would round *down* to 100
 * instead of the intended 101. We first scale to cents and apply a tiny nudge
 * (1e-6) that is orders of magnitude larger than typical representation drift
 * (~1e-10) but far smaller than half a cent (0.5), so genuine values round
 * correctly while float noise is cancelled out.
 */
export function eurosToCents(euros: number): Cents {
  const scaled = euros * 100;
  const nudged = scaled < 0 ? scaled - 1e-6 : scaled + 1e-6;
  return Math.round(nudged);
}

/**
 * Result of trying to parse a user-entered monetary string.
 * `ok: true` yields an integer cent amount; `ok: false` yields a message.
 */
export type ParseResult =
  | { ok: true; cents: Cents }
  | { ok: false; error: string };

/** Largest amount we accept for a single field, to guard against typos/overflow. */
const MAX_EUROS = 1_000_000_000; // one billion euro

/**
 * Parse a user-entered euro amount into integer cents.
 *
 * Accepts both Greek (`el-GR`) and English/US notation, because the app stores
 * and displays values in the Greek format (`1.840,50`) while many users type
 * the English format (`1,840.50` or `1840.50`). Thousands separators (`.` or
 * `,`) are stripped and a single decimal separator (`,` or `.`) is honoured.
 *
 * Separator rules (documented and deterministic):
 * - If the input contains **both** `.` and `,`, the **rightmost** one is the
 *   decimal separator and every other one is a thousands separator:
 *   `1.840,50` → `1840.50`, `1,840.50` → `1840.50`.
 * - If the input has a **single** `.` or `,` followed by **exactly 3 digits**,
 *   it is treated as a thousands separator (matching Greek grouping):
 *   `1.840` → `1840`, `1,840` → `1840`.
 * - If the input has a **single** separator followed by **1 or 2 digits**, it is
 *   the decimal point: `1840,50` → `1840.50`, `1840.50` → `1840.50`.
 *
 * Anything else — empty digit groups, separators in illegal positions, more
 * than one decimal separator, a trailing separator, or a fractional part with
 * more than two digits — is **rejected** with a clear message rather than
 * silently interpreted. Returns a structured error instead of throwing, so the
 * UI can surface precise validation messages.
 */
export function parseEuroInput(raw: string): ParseResult {
  const compact = raw.replace(/\s/g, "");

  if (compact === "") {
    return { ok: false, error: "This field is required." };
  }

  // Detect an explicit leading minus and reject it with a dedicated message,
  // before the digits-only check below would flag it as generic invalid input.
  if (compact.startsWith("-")) {
    return { ok: false, error: "Amount cannot be negative." };
  }

  // Only digits, thousands separators and a single decimal separator are
  // allowed; anything else (letters, currency symbols, stray punctuation) is
  // rejected before any interpretation happens.
  if (!/^\d+([.,]\d+)*$/.test(compact)) {
    return { ok: false, error: "Enter a valid amount using digits only." };
  }

  // Split the input into integer and fractional digit strings, deciding which
  // separator is the decimal point using the documented rules, and validating
  // that every other separator is a legal thousands separator.
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");

  let integerPart: string;
  let fractionalPart = "";

  if (lastDot >= 0 && lastComma >= 0) {
    // Both separators present: the rightmost is the decimal separator; every
    // other one must be a thousands separator.
    const decimalIndex = Math.max(lastDot, lastComma);
    integerPart = compact.slice(0, decimalIndex);
    fractionalPart = compact.slice(decimalIndex + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    // A single separator kind. If it is followed by exactly 3 digits it is a
    // thousands separator; otherwise it is the decimal point.
    const index = lastDot >= 0 ? lastDot : lastComma;
    const after = compact.slice(index + 1);
    if (/^\d{3}$/.test(after)) {
      integerPart = compact;
    } else {
      integerPart = compact.slice(0, index);
      fractionalPart = after;
    }
  } else {
    integerPart = compact;
  }

  // Validate the integer part is a plain integer or validly grouped in threes
  // (1–3 digit lead group, then groups of exactly 3), and the fractional part is
  // empty or 1–2 digits (cents). Reject anything else rather than guessing.
  if (!/^\d+(?:[.,]\d{3})*$/.test(integerPart)) {
    return { ok: false, error: "Enter a valid amount using digits only." };
  }
  if (fractionalPart !== "" && !/^\d{1,2}$/.test(fractionalPart)) {
    return { ok: false, error: "Enter a valid amount using digits only." };
  }

  const value = Number(`${integerPart.replace(/[.,]/g, "")}.${fractionalPart || "0"}`);

  if (!Number.isFinite(value)) {
    return { ok: false, error: "Enter a valid amount using digits only." };
  }

  if (value > MAX_EUROS) {
    return { ok: false, error: "Amount is too large." };
  }

  return { ok: true, cents: eurosToCents(value) };
}

/** Convert integer cents back to a euro amount (may contain 2 decimals). */
export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

