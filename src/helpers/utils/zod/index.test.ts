import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodEnum } from "./index";

describe("zodEnum", () => {
  it("配列を[T, ...T[]]型に変換すること", () => {
    // テスト用の配列
    const fruits = ["apple", "banana", "orange"];

    // zodEnumを使って配列を変換
    const enumArray = zodEnum(fruits);

    // 元の配列と同じ内容であることを確認
    expect(enumArray).toEqual(fruits);

    // zodのenum型として使えることをテスト
    const FruitSchema = z.object({
      type: z.enum(enumArray),
    });

    // 有効なデータを検証
    const valid = { type: "apple" };
    expect(() => FruitSchema.parse(valid)).not.toThrow();

    // 無効なデータを検証
    const invalid = { type: "grape" };
    expect(() => FruitSchema.parse(invalid)).toThrow();
  });

  it("空の配列が渡された場合エラーを投げないこと", () => {
    // 空の配列を渡すと [T, ...T[]] 型定義に反するが、
    // この関数ではキャストして処理するため例外は発生しない
    const emptyArray: string[] = [];
    expect(() => zodEnum(emptyArray)).not.toThrow();
  });
});
