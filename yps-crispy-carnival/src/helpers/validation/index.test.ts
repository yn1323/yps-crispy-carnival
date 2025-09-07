import { describe, expect, it } from "vitest";
import { z } from "zod";
import { betweenLength, select, time } from "@/src/helpers/validation";

describe("Validations", () => {
  it("betweenLength", () => {
    const zodSchema = z.string().superRefine(betweenLength(5, 10));

    expect(zodSchema.safeParse("12345").success).toBeTruthy();
    expect(zodSchema.safeParse("123456").success).toBeTruthy();
    expect(zodSchema.safeParse("1234567890").success).toBeTruthy();
    expect(zodSchema.safeParse("12345678901").error?.errors[0].message).toStrictEqual("5〜10文字で入力してください");
    expect(zodSchema.safeParse("12345678901").success).toBeFalsy();
  });
  it("time", () => {
    const zodSchema = z.string().superRefine(time(5));

    expect(zodSchema.safeParse("00:00").success).toBeTruthy();
    expect(zodSchema.safeParse("24:00").success).toBeFalsy();
    expect(zodSchema.safeParse("04:60").success).toBeFalsy();
    expect(zodSchema.safeParse("23:55").success).toBeTruthy();
    expect(zodSchema.safeParse("23:49").success).toBeFalsy();
    expect(zodSchema.safeParse("23:51").error?.errors[0].message).toStrictEqual("5分単位で入力してください");
    expect(zodSchema.safeParse("aaa").success).toBeFalsy();
    expect(zodSchema.safeParse("aaa").error?.errors[0].message).toStrictEqual("時刻を入力してください");
  });
  it("select", () => {
    const options = [
      { value: "1", label: "Option 1" },
      { value: "2", label: "Option 2" },
      { value: "3", label: "Option 3", selected: true },
    ] as {
      value: string;
      label: string;
      selected?: boolean;
    }[];

    const zodSchema = z.string().superRefine(select({ options, forceSelect: true }));

    expect(zodSchema.safeParse("1").success).toBeTruthy();
    expect(zodSchema.safeParse("2").success).toBeTruthy();
    expect(zodSchema.safeParse("3").success).toBeTruthy();
    expect(zodSchema.safeParse("").error?.errors[0].message).toStrictEqual("必須項目です");
    expect(zodSchema.safeParse("4").error?.errors[0].message).toStrictEqual("必須選択です");
  });
});
