// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { UserDetailData, UserDetailPanel, UserMembershipChangeInput } from "./types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  historyBack: vi.fn(),
  changeMemberships: vi.fn(),
  updateProfile: vi.fn(),
  useLineActions: vi.fn(),
  removalOptions: undefined as undefined | { onPersonRemoved: (personId: string) => void },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
}));

vi.mock("./UserDetailView", () => ({
  UserDetailView: ({
    activePanel,
    actions,
  }: {
    activePanel?: UserDetailPanel;
    actions: {
      onBack: () => void;
      onOpenBasic: () => void;
      onOpenLine: () => void;
      onOpenAddShop: () => void;
      onOpenShop: (shopId: string) => void;
      onClosePanel: () => void;
      onUpdateProfile: (data: { name: string; email: string }) => void | Promise<void>;
      onChangeMemberships: (input: UserMembershipChangeInput) => void;
    };
  }) => (
    <div>
      <output data-testid="active-panel">{activePanel ?? "closed"}</output>
      <button type="button" onClick={actions.onBack}>
        戻る
      </button>
      <button type="button" onClick={actions.onOpenBasic}>
        スタッフ情報を開く
      </button>
      <button type="button" onClick={actions.onOpenLine}>
        LINE連携を開く
      </button>
      <button type="button" onClick={actions.onOpenAddShop}>
        店舗追加を開く
      </button>
      <button type="button" onClick={() => actions.onOpenShop("shop-b")}>
        店舗別設定を開く
      </button>
      <button type="button" onClick={actions.onClosePanel}>
        閉じる
      </button>
      <button type="button" onClick={() => actions.onUpdateProfile({ name: "更新後", email: "updated@example.com" })}>
        スタッフ情報を保存
      </button>
      <button type="button" onClick={() => actions.onChangeMemberships(membershipChangeInput)}>
        所属店舗を変更する
      </button>
    </div>
  ),
}));

vi.mock("./useUserProfileUpdate", () => ({
  useUserProfileUpdate: () => ({ isUpdating: false, update: mocks.updateProfile }),
}));
vi.mock("./useUserLineActions", () => ({ useUserLineActions: mocks.useLineActions }));
vi.mock("./useUserMembershipActions", () => ({
  useUserMembershipActions: () => ({
    isChangingMemberships: false,
    onChangeMemberships: mocks.changeMemberships,
  }),
}));
vi.mock("./useUserRemovalActions", () => ({
  useUserRemovalActions: (options: { onPersonRemoved: (personId: string) => void }) => {
    mocks.removalOptions = options;
    return {
      dialog: null,
      isRemoving: false,
      onRequestRemovePerson: vi.fn(),
      onConfirmRemoval: vi.fn(),
      onCloseDialog: vi.fn(),
    };
  },
}));

import { UserDetail } from ".";

const organizationId = "organization-a" as Id<"organizations">;
const data = {
  person: { id: "person-1", name: "田中 花子", email: "hanako@example.com" },
  isSelf: false,
  canWrite: true,
  line: { actionShopId: "shop-a" },
  shops: [{ shopId: "shop-a" }],
  memberships: [],
} as unknown as UserDetailData;
const membershipChangeInput = {
  shopId: "shop-c",
  desiredShopIds: ["shop-c"],
  expectedMembershipFingerprint: "membership-fingerprint",
  removalPreviews: [],
  requestId: "change-request",
} as unknown as UserMembershipChangeInput;

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.historyBack.mockReset();
  mocks.changeMemberships.mockReset();
  mocks.updateProfile.mockReset();
  mocks.useLineActions.mockReset();
  mocks.changeMemberships.mockResolvedValue(false);
  mocks.updateProfile.mockResolvedValue(false);
  mocks.useLineActions.mockReturnValue({
    authorizeUrl: null,
    showQr: false,
    isQrLoading: false,
    isSendingInvite: false,
    isDisconnecting: false,
    onShowQr: vi.fn(),
    onSendInvite: vi.fn(),
    onDisconnect: vi.fn(),
  });
  mocks.removalOptions = undefined;
});

describe("UserDetail", () => {
  it("panelをlocal stateで開き、canonical組織scopeの店舗別設定へ遷移する", () => {
    render(<UserDetail data={data} organizationId={organizationId} />);

    fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を開く" }));
    expect(screen.getByTestId("active-panel").textContent).toBe("basic");
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "店舗別設定を開く" }));
    expect(mocks.navigate).toHaveBeenNthCalledWith(1, {
      to: "/staff/$personId/shops/$shopId",
      params: { personId: "person-1", shopId: "shop-b" },
      search: { org: organizationId },
    });
  });

  it("スタッフ情報の更新に成功した場合だけ編集中panelを閉じる", async () => {
    mocks.updateProfile.mockResolvedValueOnce(true);
    render(<UserDetail data={data} organizationId={organizationId} />);
    fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を開く" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を保存" }));
    });
    expect(screen.getByTestId("active-panel").textContent).toBe("closed");

    fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を開く" }));
    mocks.updateProfile.mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を保存" }));
    });
    expect(screen.getByTestId("active-panel").textContent).toBe("basic");
  });

  it("書き込みCapabilityがない場合は所属変更panelを開かずmutationも呼ばない", () => {
    render(<UserDetail data={{ ...data, canWrite: false }} organizationId={organizationId} />);

    fireEvent.click(screen.getByRole("button", { name: "店舗追加を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "所属店舗を変更する" }));

    expect(screen.getByTestId("active-panel").textContent).toBe("closed");
    expect(mocks.changeMemberships).not.toHaveBeenCalled();
  });

  it("所属変更中に別panelへ移った場合は古い完了応答で閉じない", async () => {
    let resolveChange: ((value: boolean) => void) | undefined;
    const change = new Promise<boolean>((resolve) => {
      resolveChange = resolve;
    });
    mocks.changeMemberships.mockReturnValue(change);
    render(<UserDetail data={data} organizationId={organizationId} />);

    fireEvent.click(screen.getByRole("button", { name: "店舗追加を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "所属店舗を変更する" }));
    fireEvent.click(screen.getByRole("button", { name: "スタッフ情報を開く" }));
    await act(async () => {
      resolveChange?.(true);
      await change;
    });

    expect(screen.getByTestId("active-panel").textContent).toBe("basic");
  });

  it("人物切替前の削除完了応答では遷移しない", () => {
    const { rerender } = render(<UserDetail data={data} organizationId={organizationId} />);
    const previousRemovalCallback = mocks.removalOptions?.onPersonRemoved;
    const nextData = {
      ...data,
      person: { ...data.person, id: "person-2" as UserDetailData["person"]["id"] },
    };

    rerender(<UserDetail data={nextData} organizationId={organizationId} />);
    previousRemovalCallback?.("person-1");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("他人の削除後は同じ組織のstaff一覧へ戻る", () => {
    render(<UserDetail data={data} organizationId={organizationId} />);

    mocks.removalOptions?.onPersonRemoved("person-1");

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/staff",
      search: { org: organizationId },
      replace: true,
    });
  });

  it("本人削除後は削除済みorgを外してcanonical Dashboardを再解決する", () => {
    render(<UserDetail data={{ ...data, isSelf: true }} organizationId={organizationId} />);

    mocks.removalOptions?.onPersonRemoved("person-1");

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", search: {}, replace: true });
  });

  it("戻る操作は現在のブラウザ履歴へ戻る", () => {
    render(<UserDetail data={data} organizationId={organizationId} />);

    fireEvent.click(screen.getByRole("button", { name: "戻る" }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
