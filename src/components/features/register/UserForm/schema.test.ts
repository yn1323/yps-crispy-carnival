import { describe, expect, it } from "vitest";
import { schema } from "./schema";

const validData = {
  userName: "有効なユーザー名",
};

const invalidDataList = [
  {
    name: "ユーザー名が短すぎる",
    data: {
      userName: "a",
    },
    error: "2〜20文字で入力してください",
  },
  {
    name: "ユーザー名が長すぎる",
    data: {
      userName: "a".repeat(21),
    },
    error: "2〜20文字で入力してください",
  },
];

describe("UserFormSchema", () => {
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
});
