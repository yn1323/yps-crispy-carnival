// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();
  mocks.showSuccessToast.mockReset();
  mocks.runWithReverification.mockImplementation(
    async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => operation(...args),
  );
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("useLoginMethodsController", () => {
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

  it.each([
    { label: "Googleのみ", expectedState: "googleOnly", passwordEnabled: false, withGoogle: true },
    { label: "パスワードのみ", expectedState: "passwordOnly", passwordEnabled: true, withGoogle: false },
    { label: "Googleとパスワード", expectedState: "googleAndPassword", passwordEnabled: true, withGoogle: true },
  ] as const)("$labelでも既存の確認済みメールへPrimaryを変更し、旧メールを保持する", async (condition) => {
    const primaryEmail = emailResource({
      id: "email-primary",
      emailAddress: "login@example.com",
      status: "verified",
      linked: condition.withGoogle,
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
    expect(user.emailAddresses).toEqual([primaryEmail, targetEmail]);
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
    expect(targetEmail.destroy).not.toHaveBeenCalled();
    expect(user.passwordEnabled).toBe(condition.passwordEnabled);
    expect(user.externalAccounts).toEqual(externalAccounts);
    if (googleAccount) expect(user.externalAccounts[0]).toBe(googleAccount);
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({
      title: "メインのメールアドレスを変更しました",
      description: "以前のメールアドレスも登録されたままです。",
    });
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

  it("未確認メールはコード成功までPrimaryを維持し、確認後も旧メールを保持する", async () => {
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
    expect(user.emailAddresses).toEqual([primaryEmail, pendingEmail]);
    expect(primaryEmail.destroy).not.toHaveBeenCalled();
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

  it("Primary更新の応答を失ってもreloadで不変条件を確認できれば成功へ収束する", async () => {
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
    expect(user.reload).toHaveBeenCalledTimes(3);
    expect(user.primaryEmailAddressId).toBe(targetEmail.id);
    expect(user.passwordEnabled).toBe(false);
    expect(user.externalAccounts).toEqual([googleAccount]);
    expect(user.emailAddresses).toEqual([primaryEmail, targetEmail]);
    expect(result.current.emailChangeDialog).toEqual({ isOpen: false });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
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
      message: "このメールアドレスでは変更を続けられません。別のメールアドレスを入力してください。",
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
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "確認済みメールアドレスとパスワードを設定してから操作してください。",
    });
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("Googleとパスワードの両方があればlinked確認済みメールをfallbackとして解除できる", async () => {
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
    });
    const { result } = renderController(user);

    expect(result.current.viewModel.methodState).toBe("googleAndPassword");
    await act(async () => result.current.disconnectGoogle(account.id));

    expect(account.destroy).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["reload", "reload", "destroy", "reload"]);
    expect(user.passwordEnabled).toBe(true);
    expect(user.emailAddresses).toEqual([linkedEmail]);
    expect(user.externalAccounts).toEqual([]);
    expect(result.current.googleState).toEqual({ status: "idle", message: null });
    expect(mocks.showSuccessToast).toHaveBeenCalledWith({ title: "Google連携を解除しました" });
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
    mocks.runWithReverification.mockImplementationOnce(
      async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => {
        user.passwordEnabled = false;
        return operation(...args);
      },
    );
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

function renderController(user: UserResource, getCurrentActorId: () => string | null = () => user.id) {
  return renderHook(() =>
    useLoginMethodsController({
      isLoaded: true,
      user,
      getCurrentActorId,
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

function externalAccount({ id, status }: { id: string; status: "verified" | "unverified" }) {
  const resource = {
    id,
    provider: "google",
    emailAddress: "google@gmail.com",
    verification: {
      status,
    },
    destroy: vi.fn(async () => undefined),
  };
  return resource as unknown as ExternalAccountResource;
}
