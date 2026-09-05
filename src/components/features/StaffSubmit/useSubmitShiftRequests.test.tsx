// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mutate = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("convex/react", () => ({ useMutation: () => mutate }));

import { useSubmitShiftRequests } from "./useSubmitShiftRequests";

describe("希望提出の送信内容", () => {
  it("sessionとともに画面を開いた時点の募集の版を送る", async () => {
    const { result } = renderHook(() =>
      useSubmitShiftRequests({ sessionToken: "session", recruitmentId: "recruitment" }, 4),
    );
    await act(async () => result.current({ kind: "dateOnly", workingDates: [] }));
    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      sessionToken: "session",
      accessKind: "submit",
      recruitmentId: "recruitment",
      expectedEditVersion: 4,
      submission: { kind: "dateOnly", workingDates: [] },
      acceptedLegal: undefined,
    });
  });
});
