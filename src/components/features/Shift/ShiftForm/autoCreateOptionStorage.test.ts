// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTO_CREATE_AI_OPTION_STORAGE_KEY,
  AUTO_CREATE_BREAK_OPTION_STORAGE_KEY,
  readAutoCreateIncludesBreaks,
  readAutoCreateUsesAi,
  storeAutoCreateIncludesBreaks,
  storeAutoCreateUsesAi,
} from "./autoCreateOptionStorage";

describe("自動作成の「休憩時間も自動作成する」を、端末に覚える", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("まだ選んだことのない端末では、休憩も作る状態から始める", () => {
    expect(readAutoCreateIncludesBreaks()).toBe(true);
  });

  it("外したことを覚えると、読み直しても外した状態を返す", () => {
    storeAutoCreateIncludesBreaks(false);

    expect(readAutoCreateIncludesBreaks()).toBe(false);
    expect(window.localStorage.getItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY)).toBe("false");
  });

  it("入れ直したことを覚えると、休憩も作る状態を返す", () => {
    storeAutoCreateIncludesBreaks(false);
    storeAutoCreateIncludesBreaks(true);

    expect(readAutoCreateIncludesBreaks()).toBe(true);
    expect(window.localStorage.getItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY)).toBe("true");
  });

  it("知らない値が入っている端末では、休憩も作る状態から始める", () => {
    window.localStorage.setItem(AUTO_CREATE_BREAK_OPTION_STORAGE_KEY, "0");

    expect(readAutoCreateIncludesBreaks()).toBe(true);
  });
});

describe("自動作成の「連絡事項に合わせてAIで手直しする」を、端末に覚える", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("まだ選んだことのない端末では、AIを使わない状態から始める", () => {
    expect(readAutoCreateUsesAi()).toBe(false);
  });

  it("入れたことを覚えると、読み直しても入れた状態を返す", () => {
    storeAutoCreateUsesAi(true);

    expect(readAutoCreateUsesAi()).toBe(true);
    expect(window.localStorage.getItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY)).toBe("true");
  });

  it("外し直したことを覚えると、AIを使わない状態を返す", () => {
    storeAutoCreateUsesAi(true);
    storeAutoCreateUsesAi(false);

    expect(readAutoCreateUsesAi()).toBe(false);
    expect(window.localStorage.getItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY)).toBe("false");
  });

  it("知らない値が入っている端末では、AIを使わない状態から始める", () => {
    window.localStorage.setItem(AUTO_CREATE_AI_OPTION_STORAGE_KEY, "1");

    expect(readAutoCreateUsesAi()).toBe(false);
  });

  it("休憩の選択とは別に覚える", () => {
    storeAutoCreateUsesAi(true);
    storeAutoCreateIncludesBreaks(false);

    expect(readAutoCreateUsesAi()).toBe(true);
    expect(readAutoCreateIncludesBreaks()).toBe(false);
  });
});
