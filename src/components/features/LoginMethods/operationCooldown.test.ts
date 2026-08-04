import { describe, expect, it } from "vitest";
import {
  createLoginMethodOperationCooldown,
  emailVerificationCooldownScope,
  GOOGLE_OAUTH_COOLDOWN_SCOPE,
  LOGIN_METHOD_OPERATION_COOLDOWN_MS,
} from "./operationCooldown";

describe("ログイン方法操作のcooldown", () => {
  it("30秒の絶対期限までは再試行を拒否し、期限ちょうどで再開する", () => {
    const cooldown = createLoginMethodOperationCooldown(new MemoryStorage());
    const scope = emailVerificationCooldownScope("email-1");

    expect(cooldown.claim("user-1", scope, 0)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(cooldown.claim("user-1", scope, LOGIN_METHOD_OPERATION_COOLDOWN_MS - 1)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(cooldown.claim("user-1", scope, LOGIN_METHOD_OPERATION_COOLDOWN_MS)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("同じtabのmanager再生成後も期限を保持し、actorと操作scopeは分離する", () => {
    const storage = new MemoryStorage();
    const first = createLoginMethodOperationCooldown(storage);

    expect(first.claim("user-1", GOOGLE_OAUTH_COOLDOWN_SCOPE, 1_000).allowed).toBe(true);

    const remounted = createLoginMethodOperationCooldown(storage);
    expect(remounted.claim("user-1", GOOGLE_OAUTH_COOLDOWN_SCOPE, 2_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 29,
    });
    expect(remounted.claim("user-2", GOOGLE_OAUTH_COOLDOWN_SCOPE, 2_000).allowed).toBe(true);
    expect(remounted.claim("user-1", emailVerificationCooldownScope("email-1"), 2_000).allowed).toBe(true);
    expect(remounted.claim("user-1", GOOGLE_OAUTH_COOLDOWN_SCOPE, 60_000).allowed).toBe(true);
  });

  it("壊れた保存値を信用せず、安全な形式へ置き換える", () => {
    const storage = new MemoryStorage();
    storage.setItem("shiftori:login-methods:operation-cooldown:v1", "{broken");

    const cooldown = createLoginMethodOperationCooldown(storage);

    expect(cooldown.claim("user-1", GOOGLE_OAUTH_COOLDOWN_SCOPE, 0).allowed).toBe(true);
    expect(cooldown.claim("user-1", GOOGLE_OAUTH_COOLDOWN_SCOPE, 1).allowed).toBe(false);
  });
});

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}
