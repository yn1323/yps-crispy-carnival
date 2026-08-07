// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runWithReverification: vi.fn(),
  isReverificationCancelledError: vi.fn(),
  showErrorToast: vi.fn(),
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
  showErrorToast: mocks.showErrorToast,
  showSuccessToast: mocks.showSuccessToast,
}));

import type { LoginMethodOperationOptions } from "./reverificationTypes";
import { useLoginMethodsController } from "./useLoginMethodsController";

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();
  mocks.showErrorToast.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.runWithReverification.mockImplementation(
    async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => operation(...args),
  );
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("useLoginMethodsController", () => {
  it("メールアドレス変更の各操作でメールコードを本人確認方式として優先する", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const targetEmail = emailResource({ id: "email-target", emailAddress: "next@example.com", status: "unverified" });
    const user = userResource({
      emailAddresses: [primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const runOperation = vi.fn(
      async <T,>(operation: () => Promise<T>, _options?: LoginMethodOperationOptions): Promise<T | undefined> =>
        operation(),
    );
    const { result } = renderController(
      user,
      () => user.id,
      runOperation as unknown as <T>(
        operation: () => Promise<T>,
        options?: LoginMethodOperationOptions,
      ) => Promise<T | undefined>,
    );

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange(targetEmail.emailAddress));
    await act(async () => result.current.verifyLoginEmailCode("123456"));

    expect(runOperation).toHaveBeenNthCalledWith(1, expect.any(Function), {
      preferredFirstFactorStrategy: "email_code",
    });
    expect(runOperation).toHaveBeenNthCalledWith(2, expect.any(Function), {
      preferredFirstFactorStrategy: "email_code",
    });
  });

  it("reload中にcurrent Userが切り替わればメール変更の副作用を開始しない", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const user = userResource({ emailAddresses: [primaryEmail], primaryEmailAddressId: primaryEmail.id });
    let currentActorId = user.id;
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      currentActorId = "user-switched";
      return user;
    });
    const { result } = renderController(user, () => currentActorId);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("PrimaryメールがGoogleにlinkedしていればDialogを開かず解除をSnackbarで促す", () => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
      linked: true,
    });
    const googleAccount = externalAccount({
      id: "google-1",
      status: "verified",
      emailAddress: primaryEmail.emailAddress,
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());

    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showErrorToast).toHaveBeenCalledOnce();
    expect(mocks.showErrorToast.mock.calls[0]?.[0]).toEqual(
      new Error(
        "このメールアドレスはGoogleログインと連携されています。先にGoogle連携を解除してから、メールアドレスを変更してください。",
      ),
    );
  });

  it("Dialog表示後にPrimaryメールがGoogleへlinkedされてもメール追加を開始しない", async () => {
    const primaryEmail = emailResource({ id: "email-primary", emailAddress: "login@example.com", status: "verified" });
    const googleAccount = externalAccount({
      id: "google-1",
      status: "verified",
      emailAddress: primaryEmail.emailAddress,
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    Object.assign(primaryEmail, { linkedTo: [{ id: "link-primary", type: "oauth_google" }] });

    await act(async () => result.current.startLoginEmailChange("next@example.com"));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showErrorToast).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "Googleのみ", expectedState: "googleOnly", passwordEnabled: false, withGoogle: true },
    { label: "パスワードのみ", expectedState: "passwordOnly", passwordEnabled: true, withGoogle: false },
    { label: "Googleとパスワード", expectedState: "googleAndPassword", passwordEnabled: true, withGoogle: true },
  ] as const)("$labelでもGoogle非linkedの旧Primaryだけを削除する", async (condition) => {
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
    const googleAccount = condition.withGoogle ? externalAccount({ id: "google-1", status: "verified" }) : null;
    const externalAccounts = googleAccount ? [googleAccount] : [];
    const user = userResource({
      passwordEnabled: condition.passwordEnabled,
      emailAddresses: [primaryEmail, targetEmail],
      externalAccounts,
      primaryEmailAddressId: primaryEmail.id,
    });
    const operationOrder: string[] = [];
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      operationOrder.push("set-primary");
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      return user;
    });
    vi.mocked(primaryEmail.destroy).mockImplementation(async () => {
      operationOrder.push("delete-previous");
      user.emailAddresses = [targetEmail];
    });
    const { result } = renderController(user);

    expect(result.current.viewModel.methodState).toBe(condition.expectedState);
    act(() => result.current.openLoginEmailChange());
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });

    await act(async () => result.current.startLoginEmailChange(" NEXT@EXAMPLE.COM "));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(targetEmail.prepareVerification).not.toHaveBeenCalled();
    expect(user.update).toHaveBeenCalledOnce();
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: targetEmail.id });
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.emailAddresses).toEqual([targetEmail]);
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(operationOrder).toEqual(["set-primary", "delete-previous"]);
    expect(user.passwordEnabled).toBe(condition.passwordEnabled);
    expect(user.externalAccounts).toEqual(externalAccounts);
    if (googleAccount) expect(user.externalAccounts[0]).toBe(googleAccount);
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "メインのメールアドレスを変更しました",
    });
  });

  it("直前の旧Primaryだけを削除し、ほかのEmailAddressは推測削除しない", async () => {
    const historicalEmail = emailResource({
      id: "email-historical",
      emailAddress: "historical@example.com",
      status: "verified",
    });
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
      emailAddresses: [historicalEmail, primaryEmail, targetEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange(targetEmail.emailAddress));

    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.emailAddresses).toEqual([historicalEmail, targetEmail]);
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(historicalEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
  });

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

  it("未確認メールはコード成功までPrimaryを維持し、確認後に直前の旧メールを削除する", async () => {
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
    expect(user.primaryEmailAddressId).toBe(primaryEmail.id);
    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: pendingEmail.id,
    });

    await act(async () => result.current.verifyLoginEmailCode(" 123456 "));

    expect(pendingEmail.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: pendingEmail.id });
    expect(user.primaryEmailAddressId).toBe(pendingEmail.id);
    expect(user.emailAddresses).toEqual([pendingEmail]);
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("初回送信と再送は同じメールのcooldownを共有し、30秒後にだけ再送する", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
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

    await act(async () => result.current.startLoginEmailChange(pendingEmail.emailAddress));
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();

    await act(async () => result.current.resendLoginEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    });

    now.mockReturnValue(1_030_000);
    await act(async () => result.current.resendLoginEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledTimes(2);
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "新しい確認コードを送りました。",
    });

    now.mockRestore();
  });

  it("初回送信の応答を失っても同じメールのcooldownを維持する", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
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
    vi.mocked(pendingEmail.prepareVerification).mockRejectedValueOnce(new Error("response lost"));
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, pendingEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange(pendingEmail.emailAddress));
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: pendingEmail.id,
    });

    await act(async () => result.current.resendLoginEmailCode());
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailPasswordState.message).toContain("あと30秒");

    now.mockRestore();
  });

  it("確認コードが失敗した場合は旧Primaryを維持し、再試行できるDialogを残す", async () => {
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
    vi.mocked(pendingEmail.attemptVerification).mockRejectedValue({
      errors: [{ code: "form_code_incorrect" }],
    });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, pendingEmail],
      primaryEmailAddressId: primaryEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange(pendingEmail.emailAddress));
    await act(async () => result.current.verifyLoginEmailCode("000000"));

    expect(user.primaryEmailAddressId).toBe(primaryEmail.id);
    expect(user.update).not.toHaveBeenCalled();
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: pendingEmail.id,
    });
    expect(result.current.emailPasswordState.status).toBe("error");
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("Primary更新の応答を失っても旧メール削除まで完了して成功へ収束する", async () => {
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
    const googleAccount = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: false,
      emailAddresses: [primaryEmail, targetEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(user.update).mockImplementation(async ({ primaryEmailAddressId }) => {
      user.primaryEmailAddressId = primaryEmailAddressId ?? null;
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange(targetEmail.emailAddress));

    expect(user.update).toHaveBeenCalledOnce();
    expect(user.reload).toHaveBeenCalledTimes(6);
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.passwordEnabled).toBe(false);
    expect(user.externalAccounts).toEqual([googleAccount]);
    expect(user.emailAddresses).toEqual([targetEmail]);
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
  });

  it("旧メール削除の応答を失っても不在と既存ログイン方法を確認して成功へ収束する", async () => {
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
    const googleAccount = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(primaryEmail.destroy).mockImplementation(async () => {
      user.emailAddresses = [targetEmail];
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.startLoginEmailChange(targetEmail.emailAddress));

    expect(user.update).toHaveBeenCalledOnce();
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.emailAddresses).toEqual([targetEmail]);
    expect(user.passwordEnabled).toBe(true);
    expect(user.externalAccounts).toEqual([googleAccount]);
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "メインのメールアドレスを変更しました",
    });
  });

  it("旧メールを削除できなければ成功扱いにせず旧Primaryへ戻す", async () => {
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
    const googleAccount = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [primaryEmail, targetEmail],
      externalAccounts: [googleAccount],
      primaryEmailAddressId: primaryEmail.id,
    });
    vi.mocked(primaryEmail.destroy).mockRejectedValue(new Error("delete failed"));
    const { result } = renderController(user);

    act(() => result.current.openLoginEmailChange());
    await act(async () => result.current.startLoginEmailChange(targetEmail.emailAddress));

    expect(user.update).toHaveBeenNthCalledWith(1, { primaryEmailAddressId: targetEmail.id });
    expect(user.update).toHaveBeenNthCalledWith(2, { primaryEmailAddressId: primaryEmail.id });
    expect(primaryEmail.destroy).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(primaryEmail.id);
    expect(user.emailAddresses).toEqual([primaryEmail, targetEmail]);
    expect(user.passwordEnabled).toBe(true);
    expect(user.externalAccounts).toEqual([googleAccount]);
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message:
        "以前のログイン用メールアドレスを削除できなかったため、変更を完了していません。時間をおいてもう一度お試しください。",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("EmailAddress作成の応答を失っても追加済みresourceから確認待ちへ復旧する", async () => {
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

    await act(async () => result.current.startLoginEmailChange(createdEmail.emailAddress));

    expect(user.createEmailAddress).toHaveBeenCalledOnce();
    expect(user.primaryEmailAddressId).toBe(primaryEmail.id);
    expect(createdEmail.destroy).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: createdEmail.id,
    });
    expect(result.current.emailPasswordState.status).toBe("error");
  });

  it("変更確定の連打はsingle-flightでClerk更新を1回に抑える", async () => {
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
    let releaseReload!: () => void;
    const reloadGate = new Promise<void>((resolve) => {
      releaseReload = resolve;
    });
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      await reloadGate;
      return user;
    });
    const { result } = renderController(user);

    let firstOperation!: Promise<unknown>;
    act(() => {
      firstOperation = result.current.startLoginEmailChange(targetEmail.emailAddress);
    });
    await waitFor(() => expect(user.reload).toHaveBeenCalledOnce());

    let duplicateResult: unknown;
    await act(async () => {
      duplicateResult = await result.current.startLoginEmailChange(targetEmail.emailAddress);
    });
    expect(duplicateResult).toBeUndefined();

    releaseReload();
    await act(async () => firstOperation);

    expect(user.update).toHaveBeenCalledOnce();
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
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

    expect(user.update).not.toHaveBeenCalled();
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "このメールアドレスに変更できません。\n別のメールアドレスを入力してください。",
    });
    expect(result.current.emailPasswordState.message).not.toContain("occupied@example.com");
  });

  it("Googleのみでは代替ログイン方法がないためGoogleを解除しない", async () => {
    const googleEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: false,
      emailAddresses: [googleEmail],
      externalAccounts: [account],
      primaryEmailAddressId: googleEmail.id,
    });
    const { result } = renderController(user);

    expect(result.current.viewModel.methodState).toBe("googleOnly");
    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).not.toHaveBeenCalled();
    expect(user.externalAccounts).toEqual([account]);
    expect(result.current.googleState).toEqual({ status: "idle", message: null });
    expect(mocks.showErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "メールアドレス未設定時はGoogle認証を解除できません。先にメールアドレスとパスワードを設定してください。",
      }),
    );
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("Googleとパスワードの両方があれば解除でき、link解消後はメール変更を開始できる", async () => {
    const linkedEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [linkedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: linkedEmail.id,
    });
    const callOrder: string[] = [];
    vi.mocked(user.reload).mockImplementation(async () => {
      callOrder.push("reload");
      return user;
    });
    vi.mocked(account.destroy).mockImplementation(async () => {
      callOrder.push("destroy");
      user.externalAccounts = [];
      Object.assign(linkedEmail, { linkedTo: [] });
    });
    const runOperation = vi.fn(
      async <T,>(operation: () => Promise<T>, _options?: LoginMethodOperationOptions): Promise<T | undefined> =>
        operation(),
    );
    const { result } = renderController(
      user,
      () => user.id,
      runOperation as unknown as <T>(
        operation: () => Promise<T>,
        options?: LoginMethodOperationOptions,
      ) => Promise<T | undefined>,
    );

    expect(result.current.viewModel.methodState).toBe("googleAndPassword");
    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["reload", "reload", "destroy", "reload"]);
    expect(runOperation).toHaveBeenCalledWith(expect.any(Function), {
      preferredFirstFactorStrategy: "password",
    });
    expect(user.passwordEnabled).toBe(true);
    expect(user.emailAddresses).toEqual([linkedEmail]);
    expect(user.externalAccounts).toEqual([]);
    expect(result.current.googleState).toEqual({ status: "idle", message: null });
    expect(mocks.runWithReverification).toHaveBeenCalledOnce();
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "Google連携を解除しました" });

    act(() => result.current.openLoginEmailChange());
    expect(result.current.emailChangeDialog).toMatchObject({ isOpen: true, step: "input" });
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it("Google解除直前のreloadでfallbackが消えた場合は破棄要求を送らない", async () => {
    const linkedEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [linkedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: linkedEmail.id,
    });
    let reloadCount = 0;
    vi.mocked(user.reload).mockImplementation(async () => {
      reloadCount += 1;
      if (reloadCount === 2) user.passwordEnabled = false;
      return user;
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(account.destroy).not.toHaveBeenCalled();
    expect(user.externalAccounts).toEqual([account]);
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "ログイン方法の状態が変わったため、Google連携を解除していません。",
    });
  });

  it("Google解除の応答を失ってもfallbackと対象消失をreloadで確認して成功へ収束する", async () => {
    const linkedEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const account = externalAccount({ id: "google-1", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [linkedEmail],
      externalAccounts: [account],
      primaryEmailAddressId: linkedEmail.id,
    });
    vi.mocked(account.destroy).mockImplementation(async () => {
      user.externalAccounts = [];
      throw new Error("response lost");
    });
    const { result } = renderController(user);

    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(user.passwordEnabled).toBe(true);
    expect(user.emailAddresses).toEqual([linkedEmail]);
    expect(user.externalAccounts).toEqual([]);
    expect(result.current.googleState).toEqual({ status: "idle", message: null });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "Google連携を解除しました" });
  });
});

function renderController(
  user: UserResource,
  getCurrentActorId: () => string | null = () => user.id,
  runOperation?: <T>(operation: () => Promise<T>, options?: LoginMethodOperationOptions) => Promise<T | undefined>,
) {
  return renderHook(() =>
    useLoginMethodsController({
      isLoaded: true,
      user,
      getCurrentActorId,
      runOperation,
    }),
  );
}

function userResource({
  id = "user-current",
  passwordEnabled = false,
  emailAddresses = [],
  externalAccounts = [],
  primaryEmailAddressId = null,
}: {
  id?: string;
  passwordEnabled?: boolean;
  emailAddresses?: EmailAddressResource[];
  externalAccounts?: ExternalAccountResource[];
  primaryEmailAddressId?: string | null;
}) {
  const user = {
    id,
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
  };
  for (const emailAddress of emailAddresses) {
    vi.mocked(emailAddress.destroy).mockImplementation(async () => {
      user.emailAddresses = user.emailAddresses.filter((candidate) => candidate.id !== emailAddress.id);
    });
  }
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
  emailAddress = "google@gmail.com",
}: {
  id: string;
  status: "verified" | "unverified";
  emailAddress?: string;
}) {
  const resource = {
    id,
    provider: "google",
    emailAddress,
    verification: {
      status,
    },
    destroy: vi.fn(async () => undefined),
  };
  return resource as unknown as ExternalAccountResource;
}
