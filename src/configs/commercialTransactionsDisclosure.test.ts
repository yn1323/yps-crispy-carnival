import { describe, expect, it } from "vitest";
import { resolveCommercialTransactionsDisclosure } from "./commercialTransactionsDisclosure";

const VALID_DISCLOSURE = {
  name: "山田 太郎",
  address: "〒150-0000\\n東京都渋谷区テスト1-2-3",
  phoneNumber: "03-1234-5678",
} as const;

describe("commercial transactions disclosure environment", () => {
  it("Productionの3項目を正規化する", () => {
    expect(
      resolveCommercialTransactionsDisclosure("production", {
        ...VALID_DISCLOSURE,
        name: ` ${VALID_DISCLOSURE.name} `,
      }),
    ).toEqual({
      ...VALID_DISCLOSURE,
      address: "〒150-0000\n東京都渋谷区テスト1-2-3",
    });
  });

  it.each([
    ["name", "VITE_COMMERCIAL_TRANSACTIONS_NAME"],
    ["address", "VITE_COMMERCIAL_TRANSACTIONS_ADDRESS"],
    ["phoneNumber", "VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER"],
  ] as const)("Productionで%sが空ならbuildを拒否する", (field, environmentVariable) => {
    expect(() =>
      resolveCommercialTransactionsDisclosure("production", {
        ...VALID_DISCLOSURE,
        [field]: " ",
      }),
    ).toThrow(environmentVariable);
  });

  it("Production以外は未設定箇所を明示する", () => {
    expect(resolveCommercialTransactionsDisclosure("local", {})).toEqual({
      name: "【環境変数未設定：名前】",
      address: "【環境変数未設定：住所】",
      phoneNumber: "【環境変数未設定：電話番号】",
    });
  });
});
