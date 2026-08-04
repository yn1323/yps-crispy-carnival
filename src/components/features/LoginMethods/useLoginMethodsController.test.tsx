// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginMethodCapabilities } from "./types";

const mocks = vi.hoisted(() => ({
  runWithReverification: vi.fn(),
  isReverificationCancelledError: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useReverification:
    (operation: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      mocks.runWithReverification(operation, args),
}));

vi.mock("@clerk/react/errors", () => ({
  isReverificationCancelledError: mocks.isReverificationCancelledError,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

import { useLoginMethodsController } from "./useLoginMethodsController";

const ENABLED_CAPABILITIES: LoginMethodCapabilities = {
  connectGoogle: true,
  reconnectGoogle: true,
  disconnectGoogle: true,
  setPassword: true,
  changePassword: true,
  removePassword: true,
  removeEmailAddress: true,
  replaceGoogleAccount: true,
};

beforeEach(() => {
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.runWithReverification.mockImplementation(
    async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => operation(...args),
  );
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("useLoginMethodsController", () => {
  it("現在のメールと正規化後に同じ入力ではClerkへ副作用を送らない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange(" LOGIN@EXAMPLE.COM "));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.prepareVerification).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "現在とは異なるメールアドレスを入力してください。",
    });
  });

  it("既存の確認済みメールは確認画面を挟まずprimaryへ設定する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange(" NEXT@EXAMPLE.COM "));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(targetEmail.prepareVerification).not.toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: targetEmail.id });
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({ status: "idle", message: null });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "メインのメールアドレスを変更しました",
      description: "以前のメールアドレスも登録されたままです。",
    });
  });

  it("未確認メールはコード確認後にそのままprimaryへ設定する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const pendingEmail = emailResource({
      id: "email-pending",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, pendingEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(pendingEmail.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "verification" });

    await act(async () => result.current.verifyLoginEmailCode(" 123456 "));

    expect(pendingEmail.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: pendingEmail.id });
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(pendingEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("メール確認の応答を失ってもreloadでverifiedならprimary変更へ収束する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const pendingEmail = emailResource({
      id: "email-pending",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    vi.mocked(pendingEmail.attemptVerification).mockImplementation(async () => {
      pendingEmail.verification.status = "verified";
      throw new Error("response lost");
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, pendingEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.continueLoginEmailChange(pendingEmail.id));
    await act(async () => result.current.verifyLoginEmailCode("123456"));

    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: pendingEmail.id });
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("変更先が存在しない場合だけEmailAddressを1回作成し、確認待ちから再開する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const createdEmail = emailResource({
      id: "email-created",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.createEmailAddress).mockImplementation(async ({ email }) => {
      expect(email).toBe("next@example.com");
      user.emailAddresses = [primaryEmail, createdEmail];
      return createdEmail;
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange(" NEXT@EXAMPLE.COM "));

    expect(user.createEmailAddress).toHaveBeenCalledOnce();
    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "next@example.com" });
    expect(createdEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: createdEmail.id,
    });
  });

  it("別accountとのメール衝突は登録有無を列挙しない文言へ正規化する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.createEmailAddress).mockRejectedValue({
      errors: [{ code: "form_identifier_exists", longMessage: "Email address is used by another user" }],
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange("occupied@example.com"));

    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "このメールアドレスでは変更を続けられません。別のメールアドレスを入力してください。",
    });
  });

  it("本人再確認中に別tabが同じメールを作成した場合はそのresourceを再利用する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const concurrentEmail = emailResource({
      id: "email-concurrent",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.emailAddresses = [primaryEmail, concurrentEmail];
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(concurrentEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: concurrentEmail.id,
    });
  });

  it("メール追加の本人再確認中にprimaryが変わった場合は最新のメールを変更元として表示する", async () => {
    const initialPrimary = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const concurrentPrimary = emailResource({
      id: "email-concurrent-primary",
      emailAddress: "alternate@example.com",
      status: "verified",
    });
    const createdEmail = emailResource({
      id: "email-created",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [initialPrimary, concurrentPrimary],
      primaryEmailAddressId: initialPrimary.id,
    });
    vi.mocked(user.createEmailAddress).mockImplementation(async () => {
      user.emailAddresses = [initialPrimary, concurrentPrimary, createdEmail];
      return createdEmail;
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.primaryEmailAddressId = concurrentPrimary.id;
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.update).not.toHaveBeenCalled();
    expect(createdEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      currentMaskedEmail: "alternate@example.com",
      targetEmailAddressId: createdEmail.id,
    });
  });

  it("メール追加の本人再確認中にパスワード方式が消えた場合はEmailAddressを作成しない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const googleAccount = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.passwordEnabled = false;
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "ログイン方法の状態が変わりました。最新の状態を読み込んでください。",
    });
  });

  it("EmailAddress作成の応答を失ってもresourceを残し、コード再送から再開する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const createdEmail = emailResource({
      id: "email-created",
      emailAddress: "next@example.com",
      status: "unverified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.createEmailAddress).mockImplementation(async () => {
      user.emailAddresses = [primaryEmail, createdEmail];
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.createEmailAddress).toHaveBeenCalledOnce();
    expect(createdEmail.destroy).not.toHaveBeenCalled();
    expect(createdEmail.prepareVerification).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: createdEmail.id,
    });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "確認コードの送信結果を確認できません。必要な場合は確認コードを再送してください。",
    });

    await act(async () => result.current.resendLoginEmailCode());

    expect(user.createEmailAddress).toHaveBeenCalledOnce();
    expect(createdEmail.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "新しい確認コードを送りました。",
    });
  });

  it("再確認待ちの間に変更先resourceが消えた場合はIDを代替解決せずfail-closedにする", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const sameAddressWithDifferentId = emailResource({
      id: "email-replacement",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.emailAddresses = [primaryEmail, sameAddressWithDifferentId];
        return operation(...args);
      },
    );

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(user.primaryEmailAddressId).toBe(primaryEmail.id);
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(sameAddressWithDifferentId.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "変更先のメールアドレスの確認状態が変わりました。最新の状態を読み込んでください。",
    });
  });

  it("メイン切替の本人再確認中にパスワード方式が消えた場合は更新要求を送らない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.passwordEnabled = false;
        return operation(...args);
      },
    );

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "変更先のメールアドレスの確認状態が変わりました。最新の状態を読み込んでください。",
    });
  });

  it("本人再確認中に未確認になったtargetはprimary IDと一致しても成功扱いしない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.primaryEmailAddressId = targetEmail.id;
        targetEmail.verification.status = "unverified";
        return operation(...args);
      },
    );

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "変更先のメールアドレスの確認状態が変わりました。最新の状態を読み込んでください。",
    });
  });

  it("確定前に未確認targetがprimaryになっていても成功扱いしない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    user.primaryEmailAddressId = targetEmail.id;
    targetEmail.verification.status = "unverified";

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(mocks.runWithReverification).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "メールアドレスの変更を再開できません。最新の状態を読み込んでください。",
    });
  });

  it("primary更新の応答を失ってもreloadで対象IDを確認できれば成功へ収束する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({ status: "idle", message: null });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("primary更新の応答喪失後にtargetが未確認なら成功へ収束しない", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      targetEmail.verification.status = "unverified";
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "認証に失敗しました。\n入力内容を確認してください。",
    });
  });

  it("別tabで対象がすでにprimaryになっていれば更新を再送せず成功へ収束する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    user.primaryEmailAddressId = targetEmail.id;
    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({ status: "idle", message: null });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("変更確定の連打をsingle-flightで止める", async () => {
    let finishUpdate: (() => void) | undefined;
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.update).mockImplementation(
      ({ primaryEmailAddressId }) =>
        new Promise((resolve) => {
          finishUpdate = () => {
            user.primaryEmailAddressId = primaryEmailAddressId ?? null;
            resolve(user);
          };
        }),
    );
    const { result } = renderController(user);

    let firstConfirmation: Promise<unknown> | undefined;
    act(() => {
      firstConfirmation = result.current.continueLoginEmailChange(targetEmail.id);
      void result.current.continueLoginEmailChange(targetEmail.id);
    });

    await waitFor(() => expect(user.update).toHaveBeenCalledOnce());
    await act(async () => {
      finishUpdate?.();
      await firstConfirmation;
    });

    expect(user.update).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
  });

  it("再確認をキャンセルした場合は変更先確認Dialogを保持する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    const cancelled = new Error("reverification cancelled");
    mocks.runWithReverification.mockRejectedValueOnce(cancelled);
    mocks.isReverificationCancelledError.mockImplementation((error) => error === cancelled);

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({ status: "idle", message: null });
  });

  it("本人再確認の期限切れでは旧状態を成功扱いにせず変更先確認Dialogを保持する", async () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
    });
    const targetEmail = emailResource({
      id: "email-target",
      emailAddress: "next@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    mocks.runWithReverification.mockRejectedValueOnce({ errors: [{ code: "form_code_expired" }] });

    await act(async () => result.current.continueLoginEmailChange(targetEmail.id));

    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "確認コードの有効期限が切れています。\nもう一度お試しください。",
    });
  });

  it("既存パスワードの変更失敗をpasswordEnabledだけで成功扱いしない", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.updatePassword).mockRejectedValue({ errors: [{ code: "form_password_incorrect" }] });
    const { result } = renderController(user);

    act(() => result.current.openPasswordChange());
    await act(async () =>
      result.current.updatePassword({
        currentPassword: "wrong-password",
        newPassword: "new-password",
        signOutOfOtherSessions: false,
      }),
    );

    expect(result.current.emailPasswordDialog).toEqual({ isOpen: true });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
  });

  it("Google再接続はreload後に同じIDのresourceを解決し直す", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const staleAccount = externalAccount({ id: "google-pending", status: "unverified" });
    const freshAccount = externalAccount({
      id: "google-pending",
      status: "unverified",
      redirectUrl: "https://accounts.example.test/reauthorize",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [staleAccount],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      user.externalAccounts = [freshAccount];
      return user;
    });
    const navigate = vi.fn();
    const { result } = renderController(user, navigate);

    await act(async () => result.current.reconnectGoogle(staleAccount.id));

    expect(staleAccount.reauthorize).not.toHaveBeenCalled();
    expect(freshAccount.reauthorize).toHaveBeenCalledWith({ redirectUrl: "/account/security" });
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/reauthorize");
  });

  it("Google再接続の本人再確認中に対象が接続済みになった場合は再認可要求を送らない", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const pendingAccount = externalAccount({ id: "google-pending", status: "unverified" });
    const verifiedAccount = externalAccount({ id: "google-pending", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [pendingAccount],
      primaryEmailAddressId: verifiedEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.externalAccounts = [verifiedAccount];
        return operation(...args);
      },
    );
    const navigate = vi.fn();
    const { result } = renderController(user, navigate);

    await act(async () => result.current.reconnectGoogle(pendingAccount.id));

    expect(pendingAccount.reauthorize).not.toHaveBeenCalled();
    expect(verifiedAccount.reauthorize).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.googleState).toEqual({
      status: "success",
      message: "Google連携を確認しました。パスワードを残すか確認してください。自動では削除していません。",
    });
  });

  it("Google解除の確認前と実行直前にそれぞれreloadして代替手段を再判定する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(account.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
    });
    const { result } = renderController(user);

    await act(async () => result.current.prepareGoogleDisconnect(account.id));

    expect(user.reload).toHaveBeenCalledOnce();
    expect(account.destroy).not.toHaveBeenCalled();

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledTimes(4);
    expect(result.current.googleState).toEqual({ status: "success", message: "Google連携を解除しました。" });
  });

  it("Google解除はreload後の代替手段を再判定し、新しいresourceだけを破棄する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const staleAccount = externalAccount({ id: "google-1", status: "verified" });
    const freshAccount = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [staleAccount],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      user.externalAccounts = [freshAccount];
      return user;
    });
    vi.mocked(freshAccount.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(staleAccount.id));

    expect(staleAccount.destroy).not.toHaveBeenCalled();
    expect(freshAccount.destroy).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledTimes(3);
    expect(result.current.googleState).toEqual({ status: "success", message: "Google連携を解除しました。" });
  });

  it("Google解除後に確認済みの非linkedメールとパスワードが残った場合だけ成功へ収束する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(account.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
      user.passwordEnabled = false;
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "Google連携は解除されましたが、代わりのログイン方法を確認できません。画面を再読み込みしてください。",
    });
  });

  it("Google解除の応答を失っても安全な代替手段と対象消失を確認できれば成功へ収束する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(account.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(result.current.googleState).toEqual({ status: "success", message: "Google連携を解除しました。" });
  });

  it("Google解除の本人再確認中に代替手段が消えた場合は破棄要求を送らない", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.passwordEnabled = false;
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).not.toHaveBeenCalled();
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "Google連携の状態が変わりました。最新の状態を読み込んでください。",
    });
  });

  it("代替手段がないGoogleはcapabilityが有効でも破棄しない", async () => {
    const googleEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      emailAddresses: [googleEmail],
      externalAccounts: [account],
      primaryEmailAddressId: googleEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).not.toHaveBeenCalled();
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "Googleと接続していない確認済みメールアドレスとパスワードを設定してから操作してください。",
    });
  });

  it("Googleが代替手段として利用可能な場合だけremovePasswordへ引数objectを渡す", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.removePassword).mockImplementation(async () => {
      user.passwordEnabled = false;
      return user;
    });
    const { result } = renderController(user);

    await act(async () => result.current.removePassword(" current-password "));

    expect(user.removePassword).toHaveBeenCalledWith({ currentPassword: "current-password" });
    expect(user.reload).toHaveBeenCalledTimes(3);
    expect(result.current.emailPasswordState).toEqual({ status: "success", message: "パスワードを削除しました。" });
  });

  it("パスワード削除の確認Dialogを開く前にreloadしてGoogleを再判定する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const { result } = renderController(user);

    let canRemove: boolean | undefined;
    await act(async () => {
      canRemove = await result.current.preparePasswordRemoval();
    });

    expect(canRemove).toBe(true);
    expect(user.reload).toHaveBeenCalledOnce();
    expect(user.removePassword).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "Googleログインの最新の状態を確認しました。",
    });
  });

  it("パスワード削除の確認前にGoogleが利用不可ならDialogを開かずcard errorを残す", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const { result } = renderController(user);

    let canRemove: boolean | undefined;
    await act(async () => {
      canRemove = await result.current.preparePasswordRemoval();
    });

    expect(canRemove).toBe(false);
    expect(user.removePassword).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "ほかのログイン方法を設定してから操作してください。",
    });
  });

  it("パスワード削除後にverified Googleが残らなければ成功表示へ収束しない", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.removePassword).mockImplementation(async () => {
      user.passwordEnabled = false;
      user.externalAccounts = [];
      return user;
    });
    const { result } = renderController(user);

    await act(async () => result.current.removePassword("current-password"));

    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "パスワードは削除されましたが、代わりのGoogleログインを確認できません。画面を再読み込みしてください。",
    });
  });

  it("パスワード削除の応答を失ってもverified Googleと削除済み状態を確認できれば成功へ収束する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.removePassword).mockImplementation(async () => {
      user.passwordEnabled = false;
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.removePassword("current-password"));

    expect(result.current.emailPasswordState).toEqual({ status: "success", message: "パスワードを削除しました。" });
  });

  it("パスワード削除の本人再確認中にGoogleが未確認になった場合は削除要求を送らない", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const verifiedGoogle = externalAccount({ id: "google-1", status: "verified" });
    const pendingGoogle = externalAccount({ id: "google-1", status: "unverified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [verifiedGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.externalAccounts = [pendingGoogle];
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.removePassword("current-password"));

    expect(user.removePassword).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "ほかのログイン方法の状態が変わったため、パスワードを削除していません。",
    });
  });

  it("linkedまたはprimaryのEmailAddressはClerkへ削除要求を送らない", async () => {
    const primaryLinkedEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const alternateEmail = emailResource({ id: "email-other", emailAddress: "login@example.com", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryLinkedEmail, alternateEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: primaryLinkedEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.removeEmailAddress(primaryLinkedEmail.id));

    expect(primaryLinkedEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "Googleと接続中のため、メールアドレスだけを削除できません。",
    });
  });

  it("EmailAddress削除はreload後に同じIDを解決し直し、primaryとlinkedでない対象だけを破棄する", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const staleSecondary = emailResource({
      id: "email-secondary",
      emailAddress: "old@example.com",
      status: "verified",
    });
    const freshSecondary = emailResource({
      id: "email-secondary",
      emailAddress: "old@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, staleSecondary],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      user.emailAddresses = [primaryEmail, freshSecondary];
      return user;
    });
    vi.mocked(freshSecondary.destroy).mockImplementation(async () => {
      user.emailAddresses = [primaryEmail];
    });
    const { result } = renderController(user);

    await act(async () => result.current.removeEmailAddress(staleSecondary.id));

    expect(staleSecondary.destroy).not.toHaveBeenCalled();
    expect(freshSecondary.destroy).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledTimes(3);
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "メールアドレスを削除しました。",
    });
  });

  it("EmailAddress削除後にverifiedなログイン方法が残らなければ成功表示へ収束しない", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const secondaryEmail = emailResource({
      id: "email-secondary",
      emailAddress: "old@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, secondaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(secondaryEmail.destroy).mockImplementation(async () => {
      user.emailAddresses = [];
    });
    const { result } = renderController(user);

    await act(async () => result.current.removeEmailAddress(secondaryEmail.id));

    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "メールアドレスは削除されましたが、代わりのログイン方法を確認できません。画面を再読み込みしてください。",
    });
  });

  it("EmailAddress削除の応答を失っても代替ログイン方法と対象消失を確認できれば成功へ収束する", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const secondaryEmail = emailResource({
      id: "email-secondary",
      emailAddress: "old@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, secondaryEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(secondaryEmail.destroy).mockImplementation(async () => {
      user.emailAddresses = [primaryEmail];
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.removeEmailAddress(secondaryEmail.id));

    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "メールアドレスを削除しました。",
    });
  });

  it("EmailAddress削除の本人再確認中に対象がprimaryになった場合は破棄要求を送らない", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const secondaryEmail = emailResource({
      id: "email-secondary",
      emailAddress: "old@example.com",
      status: "verified",
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, secondaryEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: primaryEmail.id,
    });
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.primaryEmailAddressId = secondaryEmail.id;
        return operation(...args);
      },
    );
    const { result } = renderController(user);

    await act(async () => result.current.removeEmailAddress(secondaryEmail.id));

    expect(secondaryEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "メールアドレスの状態が変わったため、削除していません。最新の状態を確認してください。",
    });
  });
});

function renderController(user: UserResource, navigateToExternalVerification = vi.fn()) {
  return renderHook(() =>
    useLoginMethodsController({
      isLoaded: true,
      user,
      capabilities: ENABLED_CAPABILITIES,
      navigateToExternalVerification,
    }),
  );
}

function userResource({
  passwordEnabled = false,
  emailAddresses = [],
  externalAccounts = [],
  primaryEmailAddressId = null,
}: {
  passwordEnabled?: boolean;
  emailAddresses?: EmailAddressResource[];
  externalAccounts?: ExternalAccountResource[];
  primaryEmailAddressId?: string | null;
}) {
  const user = {
    passwordEnabled,
    emailAddresses,
    externalAccounts,
    primaryEmailAddressId,
    reload: vi.fn(async () => user),
    createExternalAccount: vi.fn(),
    createEmailAddress: vi.fn(),
    update: vi.fn(async ({ primaryEmailAddressId }: { primaryEmailAddressId?: string | null }) => {
      if (primaryEmailAddressId !== undefined) user.primaryEmailAddressId = primaryEmailAddressId;
      return user;
    }),
    updatePassword: vi.fn(async () => {
      user.passwordEnabled = true;
      return user;
    }),
    removePassword: vi.fn(),
  };
  return user as unknown as UserResource;
}

function emailResource({
  id,
  emailAddress,
  status,
  linked = false,
}: {
  id: string;
  emailAddress: string;
  status: "verified" | "unverified";
  linked?: boolean;
}) {
  const resource = {
    id,
    emailAddress,
    verification: { status },
    linkedTo: linked ? [{ id: `link-${id}`, type: "oauth_google" }] : [],
    prepareVerification: vi.fn(async () => resource),
    attemptVerification: vi.fn(async () => {
      resource.verification.status = "verified" as const;
      return resource;
    }),
    destroy: vi.fn(async () => undefined),
  };
  return resource as unknown as EmailAddressResource;
}

function externalAccount({
  id,
  status,
  redirectUrl,
}: {
  id: string;
  status: "verified" | "unverified";
  redirectUrl?: string;
}) {
  const resource = {
    id,
    provider: "google",
    emailAddress: "google@gmail.com",
    verification: {
      status,
      externalVerificationRedirectURL: redirectUrl ? new URL(redirectUrl) : null,
    },
    reauthorize: vi.fn(async () => resource),
    destroy: vi.fn(async () => undefined),
  };
  return resource as unknown as ExternalAccountResource;
}
