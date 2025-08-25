import { getEnv } from "./index";

describe("getEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("環境変数の値を適切に返すこと", () => {
    // テスト実行環境の環境変数に依存するテストになりますが
    // 単純に関数の実行結果を検証します
    const env = getEnv();
    expect(typeof env.NEXT_PUBLIC_IS_LOCAL).toBe("boolean");
    expect(typeof env.IS_LOCAL).toBe("boolean");
  });
});
