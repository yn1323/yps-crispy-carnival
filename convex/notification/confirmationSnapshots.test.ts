import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  buildConfirmationSnapshotSignature,
  canonicalizeConfirmationSnapshotAssignments,
  confirmationSnapshotMatchesAssignments,
  hasValidConfirmationSnapshotSignature,
  normalizeConfirmationSnapshotAssignments,
} from "./confirmationSnapshots";

const positionId = "position" as Id<"positions">;

describe("confirmationSnapshots", () => {
  it("既存のempty optionId signatureは維持しつつ、time方式の意味比較ではpresenceを区別する", () => {
    const withoutOption = [{ date: "2026-08-10", startTime: "10:00", endTime: "18:00", positionId }];
    const withEmptyOption = [{ ...withoutOption[0], optionId: "" }];

    expect(normalizeConfirmationSnapshotAssignments(withEmptyOption)).toEqual(withoutOption);
    expect(buildConfirmationSnapshotSignature(withEmptyOption)).toBe(buildConfirmationSnapshotSignature(withoutOption));
    expect(
      hasValidConfirmationSnapshotSignature({
        assignments: withEmptyOption,
        signature: buildConfirmationSnapshotSignature(withoutOption),
      }),
    ).toBe(true);
    expect(
      confirmationSnapshotMatchesAssignments(
        {
          assignments: withEmptyOption,
          signature: buildConfirmationSnapshotSignature(withEmptyOption),
        },
        withoutOption,
        true,
      ),
    ).toBe(false);
    expect(
      confirmationSnapshotMatchesAssignments(
        {
          assignments: withEmptyOption,
          signature: buildConfirmationSnapshotSignature(withEmptyOption),
        },
        withEmptyOption,
        true,
      ),
    ).toBe(true);
  });

  it("unexpected optionIdつきの隣接区間はtime方式でも統合しない", () => {
    const assignments = [
      { date: "2026-08-10", startTime: "10:00", endTime: "12:00", positionId, optionId: "" },
      { date: "2026-08-10", startTime: "12:00", endTime: "18:00", positionId },
    ];

    expect(canonicalizeConfirmationSnapshotAssignments(assignments)).toEqual(assignments);
  });

  it("empty optionIdとmissingが同時刻にあっても入力順に依存しない", () => {
    const missingOption = { date: "2026-08-10", startTime: "10:00", endTime: "12:00", positionId };
    const emptyOption = { ...missingOption, optionId: "" };
    const canonicalAssignments = [missingOption, emptyOption];

    expect(canonicalizeConfirmationSnapshotAssignments([emptyOption, missingOption])).toEqual(canonicalAssignments);
    expect(canonicalizeConfirmationSnapshotAssignments(canonicalAssignments)).toEqual(canonicalAssignments);
    expect(
      confirmationSnapshotMatchesAssignments(
        {
          assignments: [emptyOption, missingOption],
          signature: buildConfirmationSnapshotSignature([emptyOption, missingOption]),
        },
        canonicalAssignments,
        true,
      ),
    ).toBe(true);
  });

  describe("休憩", () => {
    const withoutBreaks = { date: "2026-08-10", startTime: "10:00", endTime: "18:00", positionId };
    // 休憩の導入前に保存したsnapshotのsignature。fieldの並びも含めて、この文字列のまま保つ。
    const legacySignature = '[{"date":"2026-08-10","startTime":"10:00","endTime":"18:00","positionId":"position"}]';
    const lunch = { startTime: "12:00", endTime: "13:00" };
    const tea = { startTime: "15:00", endTime: "15:15" };

    it("休憩のない割当のsignatureは、休憩の導入前と同じ文字列のままである", () => {
      expect(buildConfirmationSnapshotSignature([withoutBreaks])).toBe(legacySignature);
      expect(buildConfirmationSnapshotSignature([{ ...withoutBreaks, breaks: [] }])).toBe(legacySignature);
      expect(
        buildConfirmationSnapshotSignature([
          { date: "2026-08-10", startTime: "10:00", endTime: "18:00", positionId, optionId: "early" },
        ]),
      ).toBe(
        '[{"date":"2026-08-10","startTime":"10:00","endTime":"18:00","positionId":"position","optionId":"early"}]',
      );
    });

    it.each([
      { name: "時間指定", canonicalizeTime: true },
      { name: "時間指定以外", canonicalizeTime: false },
    ])("$name: 休憩の導入前に保存したsnapshotは、休憩のない現在の割当と一致し続ける", ({ canonicalizeTime }) => {
      const legacySnapshot = { assignments: [withoutBreaks], signature: legacySignature };

      expect(hasValidConfirmationSnapshotSignature(legacySnapshot)).toBe(true);
      expect(confirmationSnapshotMatchesAssignments(legacySnapshot, [withoutBreaks], canonicalizeTime)).toBe(true);
      expect(
        confirmationSnapshotMatchesAssignments(legacySnapshot, [{ ...withoutBreaks, breaks: [] }], canonicalizeTime),
      ).toBe(true);
    });

    it.each([
      { name: "時間指定", canonicalizeTime: true },
      { name: "時間指定以外", canonicalizeTime: false },
    ])("$name: 休憩を足す・変える・消すと、snapshotが一致しなくなる", ({ canonicalizeTime }) => {
      const legacySnapshot = { assignments: [withoutBreaks], signature: legacySignature };
      const withLunch = [{ ...withoutBreaks, breaks: [lunch] }];
      const lunchSnapshot = { assignments: withLunch, signature: buildConfirmationSnapshotSignature(withLunch) };

      expect(lunchSnapshot.signature).not.toBe(legacySignature);
      expect(confirmationSnapshotMatchesAssignments(legacySnapshot, withLunch, canonicalizeTime)).toBe(false);
      expect(
        confirmationSnapshotMatchesAssignments(
          lunchSnapshot,
          [{ ...withoutBreaks, breaks: [{ startTime: "12:00", endTime: "12:45" }] }],
          canonicalizeTime,
        ),
      ).toBe(false);
      expect(
        confirmationSnapshotMatchesAssignments(
          lunchSnapshot,
          [{ ...withoutBreaks, breaks: [lunch, tea] }],
          canonicalizeTime,
        ),
      ).toBe(false);
      expect(confirmationSnapshotMatchesAssignments(lunchSnapshot, [withoutBreaks], canonicalizeTime)).toBe(false);
      expect(confirmationSnapshotMatchesAssignments(lunchSnapshot, withLunch, canonicalizeTime)).toBe(true);
    });

    it.each([
      { name: "時間指定", canonicalizeTime: true },
      { name: "時間指定以外", canonicalizeTime: false },
    ])("$name: 休憩の並び順が違うだけでは、snapshotは不一致にならない", ({ canonicalizeTime }) => {
      const ordered = [{ ...withoutBreaks, breaks: [lunch, tea] }];
      const reversed = [{ ...withoutBreaks, breaks: [tea, lunch] }];
      const snapshot = { assignments: ordered, signature: buildConfirmationSnapshotSignature(ordered) };

      expect(buildConfirmationSnapshotSignature(reversed)).toBe(snapshot.signature);
      expect(normalizeConfirmationSnapshotAssignments(reversed)).toEqual(ordered);
      expect(confirmationSnapshotMatchesAssignments(snapshot, reversed, canonicalizeTime)).toBe(true);
    });

    it("時間指定では、隣接する区間に分かれた休憩つきの割当も、統合した割当と同じ内容として比べる", () => {
      const merged = [{ ...withoutBreaks, breaks: [lunch, tea] }];
      const split = [
        { ...withoutBreaks, startTime: "14:00", endTime: "18:00", breaks: [tea] },
        { ...withoutBreaks, startTime: "10:00", endTime: "14:00", breaks: [lunch] },
      ];

      expect(canonicalizeConfirmationSnapshotAssignments(split)).toEqual(merged);
      expect(
        confirmationSnapshotMatchesAssignments(
          { assignments: merged, signature: buildConfirmationSnapshotSignature(merged) },
          split,
          true,
        ),
      ).toBe(true);
    });
  });
});
