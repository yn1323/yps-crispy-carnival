// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { submitStoryBaseData } from "../fixtures";
import { useSubmitFormController } from "./useSubmitFormController";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useSubmitFormController", () => {
  it("提出期限後の確認中に行われた連続送信を1回にまとめる", async () => {
    const gate = deferred();
    const onSubmit = vi.fn(() => gate.promise);
    const { result } = renderHook(() =>
      useSubmitFormController({
        data: { ...submitStoryBaseData, isBeforeDeadline: false, hasSubmitted: false },
        onSubmit,
      }),
    );

    act(() => result.current.handleSubmit());
    await waitFor(() => expect(result.current.lateSubmitDialog.isOpen).toBe(true));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleLateSubmitConfirm();
      second = result.current.handleLateSubmitConfirm();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.isLateSubmitting).toBe(true));

    await act(async () => {
      gate.resolve();
      await Promise.all([first, second]);
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.lateSubmitDialog.isOpen).toBe(false));
    await waitFor(() => expect(result.current.isLateSubmitting).toBe(false));
  });
});
