import { describe, expect, it } from "vitest";
import { isNumber, makeQueryParamsString } from "./index";

describe("makeQueryParamsString", () => {
  it("クエリパラメータを文字列に変換すること", () => {
    const params = {
      id: "123",
      name: "test",
      category: "example",
    };

    const result = makeQueryParamsString(params);
    expect(result).toBe("id=123&name=test&category=example");
  });

  it("空の値を持つパラメータは除外すること", () => {
    const params = {
      id: "123",
      name: "",
      category: "example",
    };

    const result = makeQueryParamsString(params);
    expect(result).toBe("id=123&category=example");
  });

  it("すべてのパラメータが空の場合、空文字列を返すこと", () => {
    const params = {
      id: "",
      name: "",
    };

    const result = makeQueryParamsString(params);
    expect(result).toBe("");
  });
});

describe("isNumber", () => {
  it("数字のみの文字列の場合、trueを返すこと", () => {
    expect(isNumber("123")).toBe(true);
    expect(isNumber("0")).toBe(true);
    expect(isNumber("9876543210")).toBe(true);
  });

  it("数字以外の文字を含む場合、falseを返すこと", () => {
    expect(isNumber("123a")).toBe(false);
    expect(isNumber("abc")).toBe(false);
    expect(isNumber("1.23")).toBe(false);
    expect(isNumber("-123")).toBe(false);
    expect(isNumber(" 123")).toBe(false);
    expect(isNumber("123 ")).toBe(false);
  });

  it("空文字列の場合、trueを返すこと", () => {
    expect(isNumber("")).toBe(true);
  });
});
