// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  saveMutation: vi.fn(),
  navigate: vi.fn(),
  resetBlocker: vi.fn(),
  proceedBlocker: vi.fn(),
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  saveMutationRef: Symbol("saveOrganizationStaffOrder"),
}));

let blockerOptions: {
  shouldBlockFn: () => boolean;
  enableBeforeUnload: () => boolean;
};
let blockerStatus: "idle" | "blocked";

vi.mock("convex/react", () => ({ useMutation: mocks.useMutation }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useBlocker: (options: typeof blockerOptions) => {
    blockerOptions = options;
    return {
      status: blockerStatus,
      reset: mocks.resetBlocker,
      proceed: mocks.proceedBlocker,
    };
  },
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    appOrganization: {
      staffOrderMutations: { saveOrganizationStaffOrder: mocks.saveMutationRef },
    },
  },
}));
vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
  showErrorToast: mocks.showErrorToast,
}));
vi.mock("@/src/components/templates/Animation", () => ({
  Animation: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/components/ui/Dialog", () => ({
  Dialog: ({
    title,
    isOpen,
    closeLabel,
    submitLabel,
    isSubmitDisabled,
    preventClose,
    onClose,
    onSubmit,
    children,
  }: {
    title: string;
    isOpen: boolean;
    closeLabel: string;
    submitLabel: string;
    isSubmitDisabled?: boolean;
    preventClose?: boolean;
    onClose: () => void;
    onSubmit: () => void;
    children: ReactNode;
  }) =>
    isOpen ? (
      <section role="alertdialog" aria-label={title} data-prevent-close={String(Boolean(preventClose))}>
        {children}
        <button type="button" onClick={onClose} disabled={preventClose}>
          {closeLabel}
        </button>
        <button type="button" onClick={onSubmit} disabled={isSubmitDisabled || preventClose}>
          {submitLabel}
        </button>
      </section>
    ) : null,
}));
vi.mock("./StaffOrderEditorView", () => ({
  StaffOrderEditorView: ({
    people,
    canWrite,
    writeDisabledReason,
    isDirty,
    isSaving,
    hasServerConflict,
    onOrderChange,
    onReloadLatest,
    onSave,
  }: {
    people: Array<{ personId: string; name: string }>;
    canWrite: boolean;
    writeDisabledReason?: string;
    isDirty: boolean;
    isSaving: boolean;
    hasServerConflict: boolean;
    onOrderChange: (people: Array<{ personId: string; name: string }>) => void;
    onReloadLatest: () => void;
    onSave: () => void;
  }) => (
    <section aria-label="スタッフ並び順editor">
      <output data-testid="draft-order">{people.map((person) => person.personId).join(",")}</output>
      <output data-testid="can-write">{String(canWrite)}</output>
      {writeDisabledReason && <output data-testid="write-disabled-reason">{writeDisabledReason}</output>}
      {hasServerConflict && <output>スタッフ情報が更新されました</output>}
      <button type="button" disabled={!canWrite || isSaving} onClick={() => onOrderChange([...people].reverse())}>
        順番を逆にする
      </button>
      <button type="button" disabled={isSaving} onClick={onReloadLatest}>
        最新の内容を読み込む
      </button>
      <button type="button" disabled={!canWrite || !isDirty || isSaving || hasServerConflict} onClick={onSave}>
        並び順を保存
      </button>
      <output data-testid="saving">{String(isSaving)}</output>
    </section>
  ),
  StaffOrderEditorStateView: ({ state }: { state: { kind: string; availability?: string } }) => (
    <output data-testid="editor-state">{state.kind === "unavailable" ? state.availability : state.kind}</output>
  ),
}));

import { ChakraProvider } from "@/src/providers/ChakraProvider";
import { StaffOrderEditor, type StaffOrderEditorSnapshot } from ".";

const people = [
  { personId: "person-a", name: "山田 花子", email: "a@example.com", shopNames: ["本店"] },
  { personId: "person-b", name: "佐藤 太郎", email: "b@example.com", shopNames: ["本店"] },
] as never;

const readyEditor: StaffOrderEditorSnapshot = {
  people,
  orderFingerprint: "a".repeat(64),
  canWrite: true,
  availability: "ready",
};

const renderEditor = (editor: StaffOrderEditorSnapshot = readyEditor) =>
  render(
    <ChakraProvider>
      <StaffOrderEditor
        organizationId={"organization-1" as never}
        editor={editor}
        filteredShopName="本店"
        returnShopFilter={"shop-1" as never}
      />
    </ChakraProvider>,
  );

const rerenderEditor = (rerender: ReturnType<typeof render>["rerender"], editor: StaffOrderEditorSnapshot) =>
  rerender(
    <ChakraProvider>
      <StaffOrderEditor
        organizationId={"organization-1" as never}
        editor={editor}
        filteredShopName="本店"
        returnShopFilter={"shop-1" as never}
      />
    </ChakraProvider>,
  );

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  blockerStatus = "idle";
  mocks.useMutation.mockReset();
  mocks.saveMutation.mockReset();
  mocks.navigate.mockReset();
  mocks.resetBlocker.mockReset();
  mocks.proceedBlocker.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.useMutation.mockReturnValue(mocks.saveMutation);
  mocks.navigate.mockResolvedValue(undefined);
  mocks.saveMutation.mockResolvedValue({
    changed: true,
    revision: 1,
    orderFingerprint: "b".repeat(64),
  });
});

describe("StaffOrderEditor controller", () => {
  it("直接URLでスタッフが1名の場合は理由を示して並び替え操作を無効にする", () => {
    renderEditor({
      ...readyEditor,
      people: readyEditor.people.slice(0, 1),
    });

    expect(screen.getByTestId("can-write").textContent).toBe("false");
    expect(screen.getByTestId("write-disabled-reason").textContent).toBe("2名以上のスタッフがいると並び替えできます。");
    expect((screen.getByRole("button", { name: "順番を逆にする" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "並び順を保存" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("保存成功時はblockerを解除してから元の店舗filter付き一覧へ移動する", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));

    expect(blockerOptions.shouldBlockFn()).toBe(true);
    expect(blockerOptions.enableBeforeUnload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "並び順を保存" }));

    await waitFor(() =>
      expect(mocks.saveMutation).toHaveBeenCalledWith({
        organizationId: "organization-1",
        orderedPersonIds: ["person-b", "person-a"],
        expectedOrderFingerprint: "a".repeat(64),
      }),
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/staff",
        search: { org: "organization-1", shopFilter: "shop-1" },
      }),
    );
    expect(mocks.resetBlocker).toHaveBeenCalled();
    expect(mocks.resetBlocker.mock.invocationCallOrder[0]).toBeLessThan(mocks.navigate.mock.invocationCallOrder[0]);
    expect(blockerOptions.shouldBlockFn()).toBe(false);
  });

  it("保存中の連打を1回にまとめる", async () => {
    let resolveSave: ((value: { changed: boolean; revision: number; orderFingerprint: string }) => void) | undefined;
    mocks.saveMutation.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));
    const saveButton = screen.getByRole("button", { name: "並び順を保存" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(mocks.saveMutation).toHaveBeenCalledOnce();
    resolveSave?.({ changed: true, revision: 2, orderFingerprint: "c".repeat(64) });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
  });

  it("保存失敗時はdraftと離脱guardを保持して再試行できる", async () => {
    mocks.saveMutation.mockRejectedValueOnce(new Error("save failed"));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));
    fireEvent.click(screen.getByRole("button", { name: "並び順を保存" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledOnce());
    expect(screen.getByTestId("draft-order").textContent).toBe("person-b,person-a");
    expect(blockerOptions.shouldBlockFn()).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "並び順を保存" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("dirty中の同一集合reorderはdraftを保持して競合にし、明示reload後だけ最新fingerprintで保存する", async () => {
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));

    const latestEditor = {
      ...readyEditor,
      orderFingerprint: "d".repeat(64),
    };
    rerenderEditor(rerender, latestEditor);

    expect(screen.getByTestId("draft-order").textContent).toBe("person-b,person-a");
    expect(await screen.findByText("スタッフ情報が更新されました")).not.toBeNull();
    expect((screen.getByRole("button", { name: "並び順を保存" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "最新の内容を読み込む" }));
    await waitFor(() => expect(screen.getByTestId("draft-order").textContent).toBe("person-a,person-b"));
    expect(screen.queryByText("スタッフ情報が更新されました")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));
    fireEvent.click(screen.getByRole("button", { name: "並び順を保存" }));
    await waitFor(() =>
      expect(mocks.saveMutation).toHaveBeenLastCalledWith({
        organizationId: "organization-1",
        orderedPersonIds: ["person-b", "person-a"],
        expectedOrderFingerprint: "d".repeat(64),
      }),
    );
  });

  it("dirty中のスタッフ追加はdraftを消さず、明示reloadで最新集合へ切り替える", async () => {
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));

    rerenderEditor(rerender, {
      ...readyEditor,
      people: [
        { personId: "person-c", name: "鈴木 美咲", email: "c@example.com", shopNames: ["駅前店"] },
        ...readyEditor.people,
      ] as never,
      orderFingerprint: "e".repeat(64),
    });

    expect(screen.getByTestId("draft-order").textContent).toBe("person-b,person-a");
    expect(await screen.findByText("スタッフ情報が更新されました")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "最新の内容を読み込む" }));
    await waitFor(() => expect(screen.getByTestId("draft-order").textContent).toBe("person-c,person-a,person-b"));
  });

  it.each([
    ["empty", { ...readyEditor, people: [], orderFingerprint: "f".repeat(64) }],
    [
      "legacyDataIncomplete",
      {
        ...readyEditor,
        people: [],
        orderFingerprint: "0".repeat(64),
        canWrite: false,
        writeDisabledReason: "スタッフ情報を確認してください。",
        availability: "legacyDataIncomplete" as const,
      },
    ],
  ])("dirty中にlatestが%sになっても明示reloadまではeditorを維持する", async (expectedState, latestEditor) => {
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));

    rerenderEditor(rerender, latestEditor);
    expect(screen.getByLabelText("スタッフ並び順editor")).not.toBeNull();
    expect(screen.getByTestId("draft-order").textContent).toBe("person-b,person-a");
    expect(await screen.findByText("スタッフ情報が更新されました")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "最新の内容を読み込む" }));
    await waitFor(() => expect(screen.getByTestId("editor-state").textContent).toBe(expectedState));
  });

  it("保存中に戻っても保存を続け、変更破棄を無効にしてからreset後に移動する", async () => {
    let resolveSave: ((value: { changed: boolean; revision: number; orderFingerprint: string }) => void) | undefined;
    mocks.saveMutation.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { rerender } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "順番を逆にする" }));
    fireEvent.click(screen.getByRole("button", { name: "並び順を保存" }));
    await waitFor(() => expect(screen.getByTestId("saving").textContent).toBe("true"));

    blockerStatus = "blocked";
    rerenderEditor(rerender, readyEditor);

    const dialog = screen.getByRole("alertdialog", { name: "並び順を保存しています" });
    expect(dialog.getAttribute("data-prevent-close")).toBe("true");
    expect(screen.getByText("保存処理は中断せずに続いています。完了するとスタッフ一覧へ移動します。")).not.toBeNull();
    const discardButton = screen.getByRole("button", { name: "保存完了後に移動" }) as HTMLButtonElement;
    expect(discardButton.disabled).toBe(true);
    fireEvent.click(discardButton);
    expect(mocks.proceedBlocker).not.toHaveBeenCalled();
    expect(mocks.saveMutation).toHaveBeenCalledOnce();

    resolveSave?.({ changed: true, revision: 2, orderFingerprint: "1".repeat(64) });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    expect(mocks.resetBlocker.mock.invocationCallOrder[0]).toBeLessThan(mocks.navigate.mock.invocationCallOrder[0]);
  });
});
