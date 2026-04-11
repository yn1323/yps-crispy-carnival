import { describe, expect, test } from "vitest";
import { uniqueBy } from "./index";

describe("uniqueBy", () => {
  test("単一キーで重複を除外できる", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 1, name: "c" },
    ];

    const result = uniqueBy(items, ["id"]);

    expect(result).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
  });

  test("複数キーで重複を除外できる", () => {
    const items = [
      { id: 1, name: "a", email: "a@example.com" },
      { id: 2, name: "b", email: "b@example.com" },
      { id: 1, name: "a", email: "a@example.com" },
      { id: 1, name: "a", email: "different@example.com" },
    ];

    const result = uniqueBy(items, ["id", "name"]);

    expect(result).toEqual([
      { id: 1, name: "a", email: "a@example.com" },
      { id: 2, name: "b", email: "b@example.com" },
    ]);
  });

  test("重複がない場合は全て返す", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ];

    const result = uniqueBy(items, ["id"]);

    expect(result).toEqual(items);
  });

  test("空配列の場合は空配列を返す", () => {
    const items: { id: number; name: string }[] = [];

    const result = uniqueBy(items, ["id"]);

    expect(result).toEqual([]);
  });

  test("最初に出現した要素を残す", () => {
    const items = [
      { id: 1, name: "first" },
      { id: 1, name: "second" },
      { id: 1, name: "third" },
    ];

    const result = uniqueBy(items, ["id"]);

    expect(result).toEqual([{ id: 1, name: "first" }]);
  });

  test("文字列キーでも正しく動作する", () => {
    const items = [
      { code: "A", value: 1 },
      { code: "B", value: 2 },
      { code: "A", value: 3 },
    ];

    const result = uniqueBy(items, ["code"]);

    expect(result).toEqual([
      { code: "A", value: 1 },
      { code: "B", value: 2 },
    ]);
  });

  test("複数キーで部分一致は重複とみなさない", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 1, name: "b" },
      { id: 2, name: "a" },
    ];

    const result = uniqueBy(items, ["id", "name"]);

    expect(result).toEqual([
      { id: 1, name: "a" },
      { id: 1, name: "b" },
      { id: 2, name: "a" },
    ]);
  });
});
