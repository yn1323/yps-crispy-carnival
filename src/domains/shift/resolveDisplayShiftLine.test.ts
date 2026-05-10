import { describe, expect, test } from "vitest";
import { resolveDisplayShiftLine } from "./resolveDisplayShiftLine";

const request = { startTime: "10:00", endTime: "18:00" };
const assignment = { startTime: "12:00", endTime: "20:00" };

describe("resolveDisplayShiftLine", () => {
  test.each([
    {
      name: "下書き保存前 + 希望あり: 希望を緑ライン表示",
      input: {
        hasDraftSaved: false,
        savedAssignment: null,
        wasSubmittedAtDraft: false,
        currentRequest: request,
      },
      expected: { type: "request", start: "10:00", end: "18:00" },
    },
    {
      name: "下書き保存前 + 希望なし: 緑ラインなし",
      input: {
        hasDraftSaved: false,
        savedAssignment: null,
        wasSubmittedAtDraft: false,
        currentRequest: null,
      },
      expected: { type: "none" },
    },
    {
      name: "下書き保存後 + 保存済み実シフトあり + 希望あり: 実シフトを優先",
      input: {
        hasDraftSaved: true,
        savedAssignment: assignment,
        wasSubmittedAtDraft: true,
        currentRequest: request,
      },
      expected: { type: "assignment", start: "12:00", end: "20:00" },
    },
    {
      name: "下書き保存後 + 保存済み実シフトあり + 希望なし: 実シフトを表示",
      input: {
        hasDraftSaved: true,
        savedAssignment: assignment,
        wasSubmittedAtDraft: false,
        currentRequest: null,
      },
      expected: { type: "assignment", start: "12:00", end: "20:00" },
    },
    {
      name: "下書き保存後 + 保存時未提出 + 実シフトなし + 希望あり: 希望を緑ライン表示",
      input: {
        hasDraftSaved: true,
        savedAssignment: null,
        wasSubmittedAtDraft: false,
        currentRequest: request,
      },
      expected: { type: "request", start: "10:00", end: "18:00" },
    },
    {
      name: "下書き保存後 + 保存時提出済み + 実シフトなし + 希望あり: 緑ラインなし",
      input: {
        hasDraftSaved: true,
        savedAssignment: null,
        wasSubmittedAtDraft: true,
        currentRequest: request,
      },
      expected: { type: "none" },
    },
  ])("$name", ({ input, expected }) => {
    expect(resolveDisplayShiftLine(input)).toEqual(expected);
  });
});
