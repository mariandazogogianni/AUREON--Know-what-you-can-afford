import { describe, expect, it } from "vitest";
import {
  parseEuroInput,
  eurosToCents,
  centsToEuros,
  formatCents,
  formatCentsSigned,
  formatCentsValue,
} from "@/lib/money";

describe("eurosToCents / centsToEuros", () => {
  it("converts euro amounts to integer cents", () => {
    expect(eurosToCents(12.5)).toBe(1250);
    expect(eurosToCents(0.07)).toBe(7);
    expect(eurosToCents(0)).toBe(0);
  });

  it("rounds half-up to avoid float drift", () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    // Classic float traps that must still round to the intended cent.
    expect(eurosToCents(1.005)).toBe(101);
    expect(eurosToCents(2.675)).toBe(268);
    expect(eurosToCents(0.29)).toBe(29);
  });

  it("round-trips euro -> cents -> euro", () => {
    expect(centsToEuros(eurosToCents(99.99))).toBeCloseTo(99.99, 5);
  });
});

describe("parseEuroInput", () => {
  it("parses plain integers and decimals", () => {
    expect(parseEuroInput("100")).toEqual({ ok: true, cents: 10000 });
    expect(parseEuroInput("99.99")).toEqual({ ok: true, cents: 9999 });
  });

  it("accepts a comma as the decimal separator", () => {
    expect(parseEuroInput("99,99")).toEqual({ ok: true, cents: 9999 });
  });

  it("ignores whitespace and thousands separators", () => {
    expect(parseEuroInput(" 1 234,56 ")).toEqual({ ok: true, cents: 123456 });
  });

  it("accepts zero", () => {
    expect(parseEuroInput("0")).toEqual({ ok: true, cents: 0 });
    expect(parseEuroInput("0,00")).toEqual({ ok: true, cents: 0 });
    expect(parseEuroInput("0.00")).toEqual({ ok: true, cents: 0 });
  });

  // Regression: the app stores/echoes values in Greek locale ("1.840,50"), which
  // previously failed validation because the parser turned the thousands dot
  // into a second decimal point. These are the exact formats from the bug report.
  describe("locale-aware EUR input (regression)", () => {
    it("accepts a Greek decimal comma", () => {
      expect(parseEuroInput("1840,50")).toEqual({ ok: true, cents: 184050 });
    });

    it("accepts a Greek thousands dot + decimal comma (demo-data format)", () => {
      expect(parseEuroInput("1.840,50")).toEqual({ ok: true, cents: 184050 });
      expect(parseEuroInput("1.840,5")).toEqual({ ok: true, cents: 184050 });
    });

    it("accepts a US/English thousands comma + decimal dot", () => {
      expect(parseEuroInput("1,840.50")).toEqual({ ok: true, cents: 184050 });
    });

    it("accepts a plain decimal dot", () => {
      expect(parseEuroInput("1840.50")).toEqual({ ok: true, cents: 184050 });
    });

    it("accepts a plain integer", () => {
      expect(parseEuroInput("1840")).toEqual({ ok: true, cents: 184000 });
    });

    it("treats a single separator followed by exactly 3 digits as thousands", () => {
      // Matches Greek grouping; unambiguous for a currency with 2 decimals.
      expect(parseEuroInput("1.840")).toEqual({ ok: true, cents: 184000 });
      expect(parseEuroInput("1,840")).toEqual({ ok: true, cents: 184000 });
      expect(parseEuroInput("1.234.567")).toEqual({ ok: true, cents: 123456700 });
    });

    it("handles multi-group thousands with a decimal part", () => {
      // Grouped thousands (Greek) plus a Greek decimal comma.
      expect(parseEuroInput("12.345,67")).toEqual({ ok: true, cents: 1234567 });
      // Grouped thousands (US) plus an English decimal dot.
      expect(parseEuroInput("1,234,567.89")).toEqual({ ok: true, cents: 123456789 });
    });

    it("round-trips the values formatCentsValue produces", () => {
      // formatCentsValue(184050) -> "1.840,50" must parse back to 184050.
      expect(parseEuroInput("1.840,50")).toEqual({ ok: true, cents: 184050 });
      expect(parseEuroInput("500,00")).toEqual({ ok: true, cents: 50000 });
      expect(parseEuroInput("349,99")).toEqual({ ok: true, cents: 34999 });

      // Programmatic round-trip: whatever the Greek formatter emits, the parser
      // must accept and return the identical cent amount. This is the exact
      // path demo data and page refresh take (settingsToRaw -> validate).
      for (const cents of [0, 1, 99, 100, 34999, 100000, 184050, 123456789]) {
        const raw = formatCentsValue(cents);
        const parsed = parseEuroInput(raw);
        expect(parsed, `failed to round-trip ${raw}`).toEqual({
          ok: true,
          cents,
        });
      }
    });

    it("rejects ambiguous/malformed separator layouts", () => {
      // Bad grouping: 1–2 digits after a separator that can't be thousands.
      expect(parseEuroInput("1.2.34").ok).toBe(false);
      expect(parseEuroInput("12,34,56").ok).toBe(false);
      // 3-digit cents are not supported.
      expect(parseEuroInput("1.840,506").ok).toBe(false);
      // Trailing separator.
      expect(parseEuroInput("1840,").ok).toBe(false);
      expect(parseEuroInput("1840.").ok).toBe(false);
    });
  });

  it("rejects an empty field as required", () => {
    const res = parseEuroInput("   ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/required/i);
  });

  it("rejects negative amounts", () => {
    const res = parseEuroInput("-50");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/negative/i);
  });

  it("rejects non-numeric input", () => {
    expect(parseEuroInput("abc").ok).toBe(false);
    // "12.345.6": 3 digits after the first dot -> thousands, then a decimal dot,
    // but that leaves an illegal 4-digit integer group, so it is malformed.
    expect(parseEuroInput("12.3.4").ok).toBe(false);
    // Two commas: grouping the first as thousands leaves a 4-digit integer.
    expect(parseEuroInput("12,34,56").ok).toBe(false);
    expect(parseEuroInput("€50").ok).toBe(false);
    expect(parseEuroInput("1..2").ok).toBe(false);
    expect(parseEuroInput("1,,2").ok).toBe(false);
    expect(parseEuroInput("1840,").ok).toBe(false);
    expect(parseEuroInput("1840.").ok).toBe(false);
  });

  it("rejects a lone decimal point", () => {
    expect(parseEuroInput(".").ok).toBe(false);
  });

  it("rejects absurdly large amounts", () => {
    const res = parseEuroInput("999999999999");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/i);
  });
});

describe("formatCents", () => {
  it("formats cents as Greek-style EUR currency", () => {
    // el-GR uses a dot for thousands, comma for decimals, and a trailing €.
    const out = formatCents(123456);
    expect(out).toContain("1.234,56");
    expect(out).toContain("€");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toContain("0,00");
  });
});

describe("formatCentsSigned", () => {
  it("prefixes positive amounts with +", () => {
    expect(formatCentsSigned(5000).startsWith("+")).toBe(true);
  });

  it("prefixes negative amounts with a minus sign", () => {
    expect(formatCentsSigned(-5000)).toMatch(/^[−-]/);
  });

  it("has no sign for zero", () => {
    const out = formatCentsSigned(0);
    expect(out.startsWith("+")).toBe(false);
    expect(out.startsWith("−")).toBe(false);
  });
});
