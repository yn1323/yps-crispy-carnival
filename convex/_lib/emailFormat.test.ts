import { describe, expect, it } from "vitest";
import { formatResendFrom, formatResendSubject } from "./emailFormat";

describe("emailFormat", () => {
  it("Resendの送信元表示名にアプリ名と店舗名を含める", () => {
    expect(formatResendFrom("居酒屋たなか", "noreply@shiftori.app")).toBe(
      "【シフトリ】居酒屋たなか <noreply@shiftori.app>",
    );
  });

  it("Resendの件名にアプリ名と店舗名を含める", () => {
    expect(formatResendSubject("居酒屋たなか", "4月前半 シフト希望の提出をお願いします")).toBe(
      "【シフトリ：居酒屋たなか】4月前半 シフト希望の提出をお願いします",
    );
  });
});
