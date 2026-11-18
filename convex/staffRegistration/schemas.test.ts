import { describe, expect, it } from "vitest";
import { STAFF_REGISTRATION_VERIFICATION_CODE_INPUT_MAX_LENGTH } from "../constants";
import { verificationCodeSchema } from "./schemas";

describe("verificationCodeSchema", () => {
  it.each([
    ["半角", "123456"],
    ["全角", "１２３４５６"],
    ["全角と半角の混在", "12３４56"],
    ["前後と途中の半角空白", " 123 456 "],
    ["全角空白", "123　456"],
    ["半角ハイフン", "123-456"],
    ["全角ハイフン", "１２３－４５６"],
    ["長音記号", "123ー456"],
    ["改行やタブ", "123\t456\n"],
  ])("%sの入力を半角数字6桁へそろえる", (_label, input) => {
    expect(verificationCodeSchema.parse(input)).toBe("123456");
  });

  it("先頭の0を落とさない", () => {
    expect(verificationCodeSchema.parse("０01 234")).toBe("001234");
  });

  it.each([
    ["空", "", "確認コードを入力してください"],
    ["空白だけ", " 　 ", "確認コードを入力してください"],
    ["5桁", "12345", "6桁の数字を入力してください"],
    ["7桁", "1234567", "6桁の数字を入力してください"],
    ["英字まじり", "12345a", "6桁の数字を入力してください"],
    ["漢数字", "一二三四五六", "6桁の数字を入力してください"],
  ])("%sは最初のエラーで理由を伝える", (_label, input, message) => {
    const result = verificationCodeSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("正規化の前に、入力の長さを上限で止める", () => {
    const withinLimit = `123456${" ".repeat(STAFF_REGISTRATION_VERIFICATION_CODE_INPUT_MAX_LENGTH - 6)}`;

    expect(verificationCodeSchema.parse(withinLimit)).toBe("123456");
    expect(verificationCodeSchema.safeParse(`${withinLimit} `).success).toBe(false);
  });
});
