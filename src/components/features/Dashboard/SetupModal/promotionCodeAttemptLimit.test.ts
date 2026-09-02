import { describe, expect, it } from "vitest";
import {
  createPromotionCodeAttemptLimit,
  PROMOTION_CODE_LOCKOUT_MS,
  PROMOTION_CODE_MAX_FAILED_ATTEMPTS,
} from "./promotionCodeAttemptLimit";

describe("初回登録プロモーションコードの試行制限", () => {
  it("10回目の不一致から10分間ブロックし、期限ちょうどで解除する", () => {
    const limit = createPromotionCodeAttemptLimit(new MemoryStorage());
    const now = Date.parse("2026-08-26T12:00:00+09:00");

    for (let attempt = 1; attempt < PROMOTION_CODE_MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(limit.recordFailure(now)).toMatchObject({
        failedAttempts: attempt,
        remainingAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS - attempt,
        isBlocked: false,
      });
    }

    expect(limit.recordFailure(now)).toEqual({
      failedAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS,
      remainingAttempts: 0,
      blockedUntil: now + PROMOTION_CODE_LOCKOUT_MS,
      isBlocked: true,
    });
    expect(limit.read(now + PROMOTION_CODE_LOCKOUT_MS - 1).isBlocked).toBe(true);
    expect(limit.read(now + PROMOTION_CODE_LOCKOUT_MS)).toEqual({
      failedAttempts: 0,
      remainingAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS,
      blockedUntil: null,
      isBlocked: false,
    });
  });

  it("同じtabのhelper再生成後も失敗回数を保持する", () => {
    const storage = new MemoryStorage();
    createPromotionCodeAttemptLimit(storage).recordFailure(1_000);

    expect(createPromotionCodeAttemptLimit(storage).read(2_000)).toMatchObject({
      failedAttempts: 1,
      remainingAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS - 1,
      isBlocked: false,
    });
  });

  it("storageが使えなくても同じinstanceのmemory内で制限する", () => {
    const limit = createPromotionCodeAttemptLimit(null);

    for (let attempt = 0; attempt < PROMOTION_CODE_MAX_FAILED_ATTEMPTS; attempt += 1) {
      limit.recordFailure(1_000);
    }

    expect(limit.read(2_000)).toMatchObject({
      failedAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS,
      remainingAttempts: 0,
      isBlocked: true,
    });
  });

  it("壊れた保存値を失敗回数として信用しない", () => {
    const storage = new MemoryStorage();
    storage.setItem("shiftori:setup:promotion-code-attempt-limit:v1", JSON.stringify({ code: "SECRET" }));

    expect(createPromotionCodeAttemptLimit(storage).read(0)).toEqual({
      failedAttempts: 0,
      remainingAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS,
      blockedUntil: null,
      isBlocked: false,
    });
  });

  it("上限回数なのに解除期限がない改ざん値をresetする", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "shiftori:setup:promotion-code-attempt-limit:v1",
      JSON.stringify({ version: 1, failedAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS, blockedUntil: null }),
    );

    expect(createPromotionCodeAttemptLimit(storage).recordFailure(1_000)).toMatchObject({
      failedAttempts: 1,
      remainingAttempts: PROMOTION_CODE_MAX_FAILED_ATTEMPTS - 1,
      isBlocked: false,
    });
  });

  it("resetで保存済み失敗回数を破棄する", () => {
    const storage = new MemoryStorage();
    const limit = createPromotionCodeAttemptLimit(storage);
    limit.recordFailure(0);

    expect(limit.reset()).toMatchObject({ failedAttempts: 0, remainingAttempts: 10, isBlocked: false });
    expect(createPromotionCodeAttemptLimit(storage).read(1)).toMatchObject({ failedAttempts: 0, isBlocked: false });
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
