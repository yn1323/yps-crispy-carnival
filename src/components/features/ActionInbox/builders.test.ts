import { describe, expect, it, vi } from "vitest";
import {
  buildActionInboxAction,
  buildNotificationFailureActionInboxItem,
  buildStaffRegistrationActionInboxItem,
  type NotificationFailureActionInboxData,
} from "./builders";
import type { ActionInboxAction, ActionInboxActionContext } from "./types";

describe("buildActionInboxAction", () => {
  it("操作不可なら実行関数と成功・失敗時の契約を公開しない", () => {
    const action = buildActionInboxAction({
      enabled: false,
      label: "再送する",
      emphasis: "primary",
      disabledReason: "現在は再送できません。",
      onClick: vi.fn(),
      removesItemOnSuccess: true,
      successMessage: "再送しました。",
      failureMessage: "再送できませんでした。",
    });

    expect(action).toEqual({
      label: "再送する",
      emphasis: "primary",
      disabled: true,
      disabledReason: "現在は再送できません。",
    });
  });

  it("通常操作へ任意の操作元contextをそのまま渡す", async () => {
    const onClick = vi.fn();
    const action = buildActionInboxAction({
      enabled: true,
      label: "取り消す",
      emphasis: "danger",
      disabledReason: "現在は取り消せません。",
      onClick,
    });
    const context = { triggerElement: {} as HTMLElement } satisfies ActionInboxActionContext;

    expect(action).toEqual({ label: "取り消す", emphasis: "danger", onClick });
    if (action.disabled) throw new Error("Action should be enabled");
    await action.onClick(context);
    expect(onClick).toHaveBeenCalledExactlyOnceWith(context);
  });

  it("成功時に項目を削除する操作へ既定成功文と任意の失敗文を設定する", () => {
    const action = buildActionInboxAction({
      enabled: true,
      label: "承認する",
      disabledReason: "現在は承認できません。",
      onClick: vi.fn(),
      removesItemOnSuccess: true,
      failureMessage: "承認できませんでした。",
    });

    expect(action).toEqual({
      label: "承認する",
      emphasis: undefined,
      onClick: expect.any(Function),
      removesItemOnSuccess: true,
      successMessage: "承認するを受け付けました。",
      failureMessage: "承認できませんでした。",
    });
  });
});

describe("ActionInbox builders", () => {
  it("スタッフ登録申請を対応ページと同じ表示・操作契約へ変換する", async () => {
    const approve = vi.fn();
    const reject = vi.fn();
    const item = buildStaffRegistrationActionInboxItem(
      {
        id: "staffRegistration:registration-1",
        applicantName: "山田花子",
        shopName: "yn1323店舗",
        createdAt: new Date(2026, 7, 14, 10, 30).getTime(),
        canApprove: true,
        approveDisabledReason: null,
        canReject: true,
      },
      { approve, reject },
    );

    expect(item).toEqual({
      id: "staffRegistration:registration-1",
      category: "staff",
      statusLabel: "承認待ち",
      title: "山田花子さんからスタッフ登録申請が届いています",
      metadata: [
        { label: "yn1323店舗", icon: "shop" },
        { label: "申請 2026/8/14 10:30", icon: "clock" },
      ],
      actions: [
        { label: "却下する", emphasis: "danger", onClick: reject },
        {
          label: "承認する",
          emphasis: "primary",
          onClick: approve,
          removesItemOnSuccess: true,
          successMessage: "山田花子さんのスタッフ登録申請を承認しました。",
          failureMessage: "スタッフ登録申請を承認できませんでした。申請の状態を確認して、もう一度お試しください。",
        },
      ],
    });

    await runEnabledAction(getAction(item.actions, "却下する"));
    await runEnabledAction(getAction(item.actions, "承認する"));
    expect(reject).toHaveBeenCalledExactlyOnceWith();
    expect(approve).toHaveBeenCalledExactlyOnceWith();
  });

  it("スタッフ登録申請の操作不可理由を既存契約どおり表示する", () => {
    const item = buildStaffRegistrationActionInboxItem(
      {
        id: "staffRegistration:registration-1",
        applicantName: "山田花子",
        shopName: "yn1323店舗",
        createdAt: new Date(2026, 7, 14, 10, 30).getTime(),
        canApprove: false,
        approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
        canReject: false,
      },
      { approve: vi.fn(), reject: vi.fn() },
    );

    expect(item.actions).toEqual([
      {
        label: "却下する",
        emphasis: "danger",
        disabled: true,
        disabledReason: "現在のアカウントまたは契約状態では却下できません。",
      },
      {
        label: "承認する",
        emphasis: "primary",
        disabled: true,
        disabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
      },
    ]);
  });

  it("通知失敗を対応ページと同じ表示・操作契約へ変換する", async () => {
    const retry = vi.fn();
    const resolve = vi.fn();
    const item = buildNotificationFailureActionInboxItem(createNotificationData({ channel: "email" }), {
      retry,
      resolve,
    });

    expect(item).toEqual({
      id: "notificationFailure:failure-1",
      category: "notification",
      statusLabel: "送信失敗",
      title: "田中さんへシフト募集通知を送れませんでした",
      metadata: [
        { label: "yn1323店舗", icon: "shop" },
        { label: "メール", icon: "mail" },
        { label: "2026/8/14 09:20", icon: "clock" },
      ],
      actions: [
        { label: "再送せず破棄する", emphasis: "danger", onClick: resolve },
        {
          label: "再送する",
          emphasis: "primary",
          onClick: retry,
          removesItemOnSuccess: true,
          successMessage: "田中さんへのシフト募集通知の再送を受け付けました。",
          failureMessage: "シフト募集通知を再送できませんでした。",
        },
      ],
    });

    await runEnabledAction(getAction(item.actions, "再送せず破棄する"));
    await runEnabledAction(getAction(item.actions, "再送する"));
    expect(resolve).toHaveBeenCalledExactlyOnceWith();
    expect(retry).toHaveBeenCalledExactlyOnceWith();
  });

  it("通知チャネルの欠損とLINE表示、操作不可理由を保つ", () => {
    const withoutChannel = buildNotificationFailureActionInboxItem(createNotificationData(), {
      retry: vi.fn(),
      resolve: vi.fn(),
    });
    const line = buildNotificationFailureActionInboxItem(createNotificationData({ channel: "line" }), {
      retry: vi.fn(),
      resolve: vi.fn(),
    });
    const disabled = buildNotificationFailureActionInboxItem(
      createNotificationData({ canRetry: false, canResolve: false }),
      { retry: vi.fn(), resolve: vi.fn() },
    );

    expect(withoutChannel.metadata).toEqual([
      { label: "yn1323店舗", icon: "shop" },
      { label: "2026/8/14 09:20", icon: "clock" },
    ]);
    expect(line.metadata).toEqual([
      { label: "yn1323店舗", icon: "shop" },
      { label: "LINE" },
      { label: "2026/8/14 09:20", icon: "clock" },
    ]);
    expect(disabled.actions).toEqual([
      {
        label: "再送せず破棄する",
        emphasis: "danger",
        disabled: true,
        disabledReason: "現在のアカウントまたは契約状態では変更できません。",
      },
      {
        label: "再送する",
        emphasis: "primary",
        disabled: true,
        disabledReason: "連絡先または対象の状態を確認してください。",
      },
    ]);
  });
});

function createNotificationData(
  overrides: Partial<NotificationFailureActionInboxData> = {},
): NotificationFailureActionInboxData {
  return {
    id: "notificationFailure:failure-1",
    staffName: "田中",
    shopName: "yn1323店舗",
    notificationKindLabel: "シフト募集通知",
    lastFailedAt: new Date(2026, 7, 14, 9, 20).getTime(),
    canRetry: true,
    canResolve: true,
    ...overrides,
  };
}

async function runEnabledAction(action: ActionInboxAction) {
  if (action.disabled) throw new Error(`${action.label} is disabled`);
  await action.onClick();
}

function getAction(actions: readonly ActionInboxAction[], label: string) {
  const action = actions.find((candidate) => candidate.label === label);
  if (!action) throw new Error(`Missing ${label} action`);
  return action;
}
