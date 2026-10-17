// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mutate = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("convex/react", () => ({ useMutation: () => mutate }));

import { useSubmitShiftRequests } from "./useSubmitShiftRequests";

describe("希望提出の送信内容", () => {
  it("sessionとともに画面を開いた時点の募集の版と日付メモを送る", async () => {
    const { result } = renderHook(() =>
      useSubmitShiftRequests({ sessionToken: "session", recruitmentId: "recruitment" }, 4),
    );
    await act(async () =>
      result.current({
        submission: { kind: "dateOnly", workingDates: [] },
        dateNotes: [{ date: "2026-04-07", note: "17時以降なら入れます" }],
      }),
    );
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "session",
      accessKind: "submit",
      recruitmentId: "recruitment",
      expectedEditVersion: 4,
      submission: { kind: "dateOnly", workingDates: [] },
      dateNotes: [{ date: "2026-04-07", note: "17時以降なら入れます" }],
      acceptedLegal: undefined,
    });
  });
});
