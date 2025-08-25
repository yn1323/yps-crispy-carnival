import { describe, expect, it } from "vitest";
import { schema, submitFrequencyOptions } from "./schema";

const validData = {
  shopName: "有効な店舗名",
  openTime: "09:00",
  closeTime: "18:00",
  submitFrequency: "1w",
};

const invalidDataList = [
  {
    name: "店舗名が空",
    data: {
      shopName: "",
      openTime: "09:00",
      closeTime: "18:00",
      submitFrequency: "1w",
    },
    error: "店舗名を入力してください",
  },
  {
    name: "店舗名が短すぎる",
    data: {
      shopName: "a",
      openTime: "09:00",
      closeTime: "18:00",
      submitFrequency: "1w",
    },
    error: "2〜50文字で入力してください",
  },
  {
    name: "店舗名が長すぎる",
    data: {
      shopName: "a".repeat(51),
      openTime: "09:00",
      closeTime: "18:00",
      submitFrequency: "1w",
    },
    error: "2〜50文字で入力してください",
  },
  {
    name: "開店時間が不正な形式",
    data: {
      shopName: "有効な店舗名",
      openTime: "25:00",
      closeTime: "18:00",
      submitFrequency: "1w",
    },
    error: "時刻を入力してください",
  },
  {
    name: "閉店時間が不正な形式",
    data: {
      shopName: "有効な店舗名",
      openTime: "09:00",
      closeTime: "25:00",
      submitFrequency: "1w",
    },
    error: "時刻を入力してください",
  },
  {
    name: "提出頻度が不正な値",
    data: {
      shopName: "有効な店舗名",
      openTime: "09:00",
      closeTime: "18:00",
      submitFrequency: "invalid",
    },
    error: "必須選択です",
  },
];

describe("ShopFormSchema", () => {
  it("有効なデータはパスする", () => {
    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  invalidDataList.forEach(({ name, data, error }) => {
    it(`${name}場合はエラー`, () => {
      const result = schema.safeParse(data);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain(error);
    });
  });

  it("提出頻度のオプションが正しく設定されている", () => {
    expect(submitFrequencyOptions).toEqual([
      { label: "1週間ごと", value: "1w" },
      { label: "2週間ごと", value: "2w" },
      { label: "1ヶ月ごと", value: "1m" },
    ]);
  });
});
