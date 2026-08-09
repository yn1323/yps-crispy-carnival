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
});
