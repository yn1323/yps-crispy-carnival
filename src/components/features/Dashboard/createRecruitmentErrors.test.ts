import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  CREATE_RECRUITMENT_DUPLICATE_ERROR_CODE,
  CREATE_RECRUITMENT_DUPLICATE_ERROR_MESSAGE,
  getCreateRecruitmentErrorMessage,
} from "./createRecruitmentErrors";

describe("getCreateRecruitmentErrorMessage", () => {
  it("重複募集エラーコードをフロントの表示文言に変換する", () => {
    expect(getCreateRecruitmentErrorMessage({ data: CREATE_RECRUITMENT_DUPLICATE_ERROR_CODE })).toBe(
      CREATE_RECRUITMENT_DUPLICATE_ERROR_MESSAGE,
    );
  });

  it("ConvexErrorの重複募集エラーコードを表示文言に変換する", () => {
    expect(getCreateRecruitmentErrorMessage(new ConvexError(CREATE_RECRUITMENT_DUPLICATE_ERROR_CODE))).toBe(
      CREATE_RECRUITMENT_DUPLICATE_ERROR_MESSAGE,
    );
  });

  it("募集作成固有ではないエラーは既存の共通エラー表示に委ねる", () => {
    expect(getCreateRecruitmentErrorMessage(new Error("network error"))).toBeNull();
    expect(getCreateRecruitmentErrorMessage({ data: "締切日は今日以降にしてください" })).toBeNull();
  });
});
