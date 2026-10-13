import { describe, expect, it } from "vitest";
import {
  computeAffordability,
  CAUTION_RATIO,
  type AffordabilityInput,
} from "@/lib/finance";

/** Helper to build a valid input in cents from euro amounts. */
function input(overrides: Partial<AffordabilityInput> = {}): AffordabilityInput {
  return {
    currentBalance: 0,
    expectedIncome: 0,
    upcomingExpenses: 0,
    emergencyReserve: 0,
    purchasePrice: 0,
    ...overrides,
  };
}

/** euro -> cents */
const e = (euros: number) => Math.round(euros * 100);

describe("computeAffordability", () => {
  describe("core arithmetic", () => {
    it("computes projected funds, safe limit and remaining correctly", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1000),
          expectedIncome: e(500),
          upcomingExpenses: e(300),
          emergencyReserve: e(200),
          purchasePrice: e(400),
        }),
      );

      expect(result.projectedFunds).toBe(e(1200));
      expect(result.safeSpendingLimit).toBe(e(1000));
      expect(result.remainingAfterPurchase).toBe(e(600));
      expect(result.purchasePrice).toBe(e(400));
    });

    it("treats expenses and reserve as subtractions from income + balance", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(500),
          expectedIncome: e(0),
          upcomingExpenses: e(500),
          emergencyReserve: e(0),
          purchasePrice: e(0),
        }),
      );
      expect(result.projectedFunds).toBe(0);
      expect(result.safeSpendingLimit).toBe(0);
    });
  });

  describe("status: within", () => {
    it("returns 'within' when the purchase leaves a comfortable buffer", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(2000),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(500),
          purchasePrice: e(500),
        }),
      );
      expect(result.safeSpendingLimit).toBe(e(1500));
      expect(result.remainingAfterPurchase).toBe(e(1000));
      expect(result.status).toBe("within");
    });

    it("returns 'within' at exactly the caution buffer boundary", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1500),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(500),
          purchasePrice: e(900),
        }),
      );
      expect(result.cautionBuffer).toBe(e(100));
      expect(result.remainingAfterPurchase).toBe(e(100));
      expect(result.status).toBe("within");
    });

    it("returns 'within' for a zero purchase with healthy funds", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1000),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(100),
          purchasePrice: e(0),
        }),
      );
      expect(result.status).toBe("within");
    });
  });

  describe("status: caution", () => {
    it("returns 'caution' when the remaining buffer is below the threshold", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1500),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(500),
          purchasePrice: e(950),
        }),
      );
      expect(result.remainingAfterPurchase).toBe(e(50));
      expect(result.cautionBuffer).toBe(e(100));
      expect(result.status).toBe("caution");
    });

    it("returns 'caution' when the purchase exactly equals the limit (zero remaining)", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1500),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(500),
          purchasePrice: e(1000),
        }),
      );
      expect(result.remainingAfterPurchase).toBe(0);
      expect(result.status).toBe("caution");
    });

    it("returns 'caution' when projected funds are already zero, even with no purchase", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(500),
          expectedIncome: e(0),
          upcomingExpenses: e(500),
          emergencyReserve: e(0),
          purchasePrice: e(0),
        }),
      );
      expect(result.projectedFunds).toBe(0);
      expect(result.status).toBe("caution");
    });

    it("returns 'caution' when projected funds are negative (bills exceed income)", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(100),
          expectedIncome: e(0),
          upcomingExpenses: e(300),
          emergencyReserve: e(0),
          purchasePrice: e(0),
        }),
      );
      expect(result.projectedFunds).toBe(-e(200));
      // No purchase is being made, so this is a fragile situation -> caution
      expect(result.status).toBe("caution");
    });

    it("returns 'above' when projected funds are negative AND a purchase is made", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(100),
          expectedIncome: e(0),
          upcomingExpenses: e(300),
          emergencyReserve: e(0),
          purchasePrice: e(10),
        }),
      );
      expect(result.projectedFunds).toBe(-e(200));
      expect(result.status).toBe("above");
    });
  });

  describe("status: above", () => {
    it("returns 'above' when the purchase exceeds the safe spending limit", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(1000),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(200),
          purchasePrice: e(900),
        }),
      );
      expect(result.safeSpendingLimit).toBe(e(800));
      expect(result.remainingAfterPurchase).toBe(-e(100));
      expect(result.status).toBe("above");
    });

    it("returns 'above' when the reserve alone cannot be preserved", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(300),
          expectedIncome: e(0),
          upcomingExpenses: e(0),
          emergencyReserve: e(500),
          purchasePrice: e(100),
        }),
      );
      expect(result.safeSpendingLimit).toBe(-e(200));
      expect(result.status).toBe("above");
    });

    it("prefers 'above' over 'caution' when funds are low and purchase overshoots", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(50),
          expectedIncome: e(0),
          upcomingExpenses: e(200),
          emergencyReserve: e(0),
          purchasePrice: e(10),
        }),
      );
      expect(result.status).toBe("above");
    });
  });

  describe("edge cases", () => {
    it("handles an all-zero input without throwing", () => {
      const result = computeAffordability(input());
      expect(result.projectedFunds).toBe(0);
      expect(result.safeSpendingLimit).toBe(0);
      expect(result.remainingAfterPurchase).toBe(0);
      expect(result.status).toBe("caution");
    });

    it("does not produce a NaN caution buffer for a negative limit", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(0),
          expectedIncome: e(0),
          upcomingExpenses: e(500),
          emergencyReserve: e(0),
          purchasePrice: e(0),
        }),
      );
      expect(Number.isFinite(result.cautionBuffer)).toBe(true);
      // No purchase; negative projected funds -> fragile situation -> caution
      expect(result.status).toBe("caution");
    });

    it("uses integer cent arithmetic (no floating point drift)", () => {
      const result = computeAffordability(
        input({
          currentBalance: e(0.1),
          expectedIncome: e(0.2),
          upcomingExpenses: e(0),
          emergencyReserve: e(0),
          purchasePrice: e(0),
        }),
      );
      expect(result.projectedFunds).toBe(30);
      expect(Number.isInteger(result.projectedFunds)).toBe(true);
    });

    it("exposes a sensible CAUTION_RATIO", () => {
      expect(CAUTION_RATIO).toBeGreaterThan(0);
      expect(CAUTION_RATIO).toBeLessThan(1);
    });
  });
});
