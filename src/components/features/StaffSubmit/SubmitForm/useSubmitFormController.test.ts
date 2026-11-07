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

  it("日付メモは出勤・休みの切替で消えず、希望と同じ提出で送る", async () => {
    const onSubmit = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useSubmitFormController({
        data: { ...submitStoryBaseData, existingDateNotes: [{ date: "2026-04-08", note: "保存済みのメモ" }] },
        onSubmit,
      }),
    );

    act(() => result.current.noteEditor.open("2026-04-07"));
    expect(result.current.noteEditor.date).toBe("2026-04-07");
    act(() => result.current.noteEditor.save("2026-04-07", " 17時以降なら入れます "));
    expect(result.current.noteEditor.date).toBeNull();
    act(() => result.current.handleSetWorking(0));
    act(() => result.current.handleClear(0));
    expect(result.current.days[0].note).toBe("17時以降なら入れます");

    await act(async () => result.current.handleSubmit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        submission: { kind: "time", requests: [] },
        dateNotes: [
          { date: "2026-04-07", note: "17時以降なら入れます" },
          { date: "2026-04-08", note: "保存済みのメモ" },
        ],
      },
      false,
    );
  });

  it("空のメモで完了するとその日のメモを削除する", () => {
    const { result } = renderHook(() =>
      useSubmitFormController({
        data: { ...submitStoryBaseData, existingDateNotes: [{ date: "2026-04-08", note: "保存済みのメモ" }] },
        onSubmit: vi.fn(async () => {}),
      }),
    );

    act(() => result.current.noteEditor.save("2026-04-08", "  "));

    expect(result.current.days[1].note).toBeUndefined();
  });

  it("提出済みの人は送信内容が保存済みと変わった間だけ未送信の変更を示す", () => {
    const { result } = renderHook(() =>
      useSubmitFormController({
        data: { ...submitStoryBaseData, hasSubmitted: true, existingDateNotes: [] },
        onSubmit: vi.fn(async () => {}),
      }),
    );
    expect(result.current.hasUnsentChanges).toBe(false);

    act(() => result.current.noteEditor.save("2026-04-07", "17時以降なら入れます"));
    expect(result.current.hasUnsentChanges).toBe(true);

    act(() => result.current.noteEditor.save("2026-04-07", ""));
    expect(result.current.hasUnsentChanges).toBe(false);
  });

  it("未提出の人には未送信の変更を示さない", () => {
    const { result } = renderHook(() =>
      useSubmitFormController({ data: submitStoryBaseData, onSubmit: vi.fn(async () => {}) }),
    );

    act(() => result.current.noteEditor.save("2026-04-07", "17時以降なら入れます"));

    expect(result.current.hasUnsentChanges).toBe(false);
  });
});
