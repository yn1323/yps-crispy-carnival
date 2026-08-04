// @vitest-environment jsdom

import type { EmailAddressResource, ExternalAccountResource, UserResource } from "@clerk/shared/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginMethodCapabilities } from "./types";

const mocks = vi.hoisted(() => ({
  runWithReverification: vi.fn(),
  isReverificationCancelledError: vi.fn(),
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

import { useLoginMethodsController } from "./useLoginMethodsController";

const ENABLED_CAPABILITIES: LoginMethodCapabilities = {
  connectGoogle: true,
  reconnectGoogle: true,
  disconnectGoogle: true,
  setPassword: true,
  changePassword: true,
  removePassword: true,
  removeEmailAddress: true,
};

beforeEach(() => {
  mocks.runWithReverification.mockReset();
  mocks.isReverificationCancelledError.mockReset();
  mocks.runWithReverification.mockImplementation(
    async (operation: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => operation(...args),
  );
  mocks.isReverificationCancelledError.mockReturnValue(false);
});

describe("useLoginMethodsController", () => {
  it("既存の未確認メールを再利用し、確認後にパスワード設定へ再開できる", async () => {
    const googleEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const pendingEmail = emailResource({
      id: "email-yahoo",
      emailAddress: "login@yahoo.co.jp",
      status: "unverified",
    });
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: googleEmail.id,
    });
    const { result } = renderController(user);

    act(() => result.current.openEmailPasswordSetup());
    await act(async () => result.current.startEmailVerification(" LOGIN@YAHOO.CO.JP "));

    expect(user.createEmailAddress).not.toHaveBeenCalled();
    expect(pendingEmail.prepareVerification).toHaveBeenCalledOnce();
    expect(result.current.emailPasswordDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: pendingEmail.id,
    });

    await act(async () => result.current.verifyEmailCode(" 123456 "));

    expect(pendingEmail.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(result.current.emailPasswordDialog).toMatchObject({ isOpen: true, step: "password" });

    await act(async () => result.current.updatePassword({ newPassword: "new-password", signOutOfOtherSessions: true }));

    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: undefined,
      newPassword: "new-password",
      signOutOfOtherSessions: true,
    });
    expect(result.current.emailPasswordDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "メールアドレスとパスワードを設定しました。",
    });
  });

  it("メール確認の応答だけ失敗してもreloadで確認済みならパスワード設定から再開する", async () => {
    const googleEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const pendingEmail = emailResource({
      id: "email-yahoo",
      emailAddress: "login@yahoo.co.jp",
      status: "unverified",
    });
    vi.mocked(pendingEmail.attemptVerification).mockImplementation(async () => {
      pendingEmail.verification.status = "verified";
      throw new Error("response lost");
    });
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: googleEmail.id,
    });
    const { result } = renderController(user);

    await act(async () => result.current.continueEmailVerification(pendingEmail.id));
    await act(async () => result.current.verifyEmailCode("123456"));

    expect(result.current.emailPasswordDialog).toMatchObject({
      isOpen: true,
      step: "password",
      targetEmailAddressId: pendingEmail.id,
    });
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "メールアドレスを確認しました。",
    });
  });

  it("既存の未確認メールはcode送信が成功するまで確認Dialogを開かない", async () => {
    let finishPreparation: (() => void) | undefined;
    const googleEmail = emailResource({
      id: "email-google",
      emailAddress: "google@gmail.com",
      status: "verified",
      linked: true,
    });
    const pendingEmail = emailResource({
      id: "email-yahoo",
      emailAddress: "login@yahoo.co.jp",
      status: "unverified",
    });
    vi.mocked(pendingEmail.prepareVerification).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPreparation = () => resolve(pendingEmail);
        }),
    );
    const user = userResource({
      emailAddresses: [googleEmail, pendingEmail],
      externalAccounts: [externalAccount({ id: "google-1", status: "verified" })],
      primaryEmailAddressId: googleEmail.id,
    });
    const { result } = renderController(user);

    act(() => {
      void result.current.continueEmailVerification(pendingEmail.id);
    });

    await waitFor(() => expect(pendingEmail.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" }));
    expect(result.current.emailPasswordDialog).toEqual({ isOpen: false });
    expect(result.current.emailPasswordState).toEqual({ status: "loading", message: null });

    await act(async () => finishPreparation?.());

    expect(result.current.emailPasswordDialog).toMatchObject({
      isOpen: true,
      step: "verification",
      targetEmailAddressId: pendingEmail.id,
    });
    expect(result.current.emailPasswordState).toEqual({ status: "success", message: "確認コードを送信しました。" });
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

    expect(result.current.emailPasswordDialog).toMatchObject({ isOpen: true, step: "password" });
    expect(result.current.emailPasswordState).toEqual({
      status: "error",
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
  });

  it("Google連携の連打をsingle-flightで止め、確認URLだけへ遷移する", async () => {
    let resolveCreation: ((resource: ExternalAccountResource) => void) | undefined;
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.createExternalAccount).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreation = resolve;
        }),
    );
    const navigate = vi.fn();
    const { result } = renderController(user, navigate);

    act(() => {
      void result.current.connectGoogle();
      void result.current.connectGoogle();
    });

    await waitFor(() => expect(user.createExternalAccount).toHaveBeenCalledOnce());
    await act(async () =>
      resolveCreation?.(
        externalAccount({
          id: "google-created",
          status: "unverified",
          redirectUrl: "https://accounts.example.test/authorize",
        }),
      ),
    );

    expect(user.createExternalAccount).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl: "/account/security?oauth=google",
    });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/authorize");
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
    expect(freshAccount.reauthorize).toHaveBeenCalledWith({ redirectUrl: "/account/security?oauth=google" });
    expect(navigate).toHaveBeenCalledWith("https://accounts.example.test/reauthorize");
  });

  it("Google OAuth帰還時はreload後にverifiedな追加を確認してquery処理を完了する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const verifiedGoogle = externalAccount({ id: "google-created", status: "verified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      primaryEmailAddressId: verifiedEmail.id,
    });
    vi.mocked(user.reload).mockImplementationOnce(async () => {
      user.externalAccounts = [verifiedGoogle];
      return user;
    });
    const onGoogleOAuthReturnHandled = vi.fn();
    const { result } = renderController(user, vi.fn(), {
      googleOAuthReturn: true,
      onGoogleOAuthReturnHandled,
    });

    await waitFor(() => expect(onGoogleOAuthReturnHandled).toHaveBeenCalledOnce());

    expect(user.reload).toHaveBeenCalledOnce();
    expect(result.current.viewModel.google.accounts).toHaveLength(1);
    expect(result.current.viewModel.google.accounts[0]).toMatchObject({
      id: verifiedGoogle.id,
      status: "connected",
    });
    expect(result.current.googleState).toEqual({ status: "success", message: "Google連携を確認しました。" });
  });

  it("Google OAuth帰還後もunverifiedなら完了扱いにせず再接続を案内する", async () => {
    const verifiedEmail = emailResource({ id: "email-1", emailAddress: "login@example.com", status: "verified" });
    const pendingGoogle = externalAccount({ id: "google-pending", status: "unverified" });
    const user = userResource({
      passwordEnabled: true,
      emailAddresses: [verifiedEmail],
      externalAccounts: [pendingGoogle],
      primaryEmailAddressId: verifiedEmail.id,
    });
    const onGoogleOAuthReturnHandled = vi.fn();
    const { result } = renderController(user, vi.fn(), {
      googleOAuthReturn: true,
      onGoogleOAuthReturnHandled,
    });

    await waitFor(() => expect(onGoogleOAuthReturnHandled).toHaveBeenCalledOnce());

    expect(user.reload).toHaveBeenCalledOnce();
    expect(result.current.googleState).toEqual({
      status: "error",
      message: "Google連携の確認が完了していません。再接続するか、最新の状態を読み込んでください。",
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
    expect(user.reload).toHaveBeenCalledTimes(3);
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
    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(result.current.googleState).toEqual({ status: "success", message: "Google連携を解除しました。" });
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
      message: "ほかのログイン方法を設定してから操作してください。",
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
    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(result.current.emailPasswordState).toEqual({ status: "success", message: "パスワードを削除しました。" });
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
    expect(user.reload).toHaveBeenCalledTimes(2);
    expect(result.current.emailPasswordState).toEqual({
      status: "success",
      message: "メールアドレスを削除しました。",
    });
  });
});

function renderController(
  user: UserResource,
  navigateToExternalVerification = vi.fn(),
  options: { googleOAuthReturn?: boolean; onGoogleOAuthReturnHandled?: () => void } = {},
) {
  return renderHook(() =>
    useLoginMethodsController({
      isLoaded: true,
      user,
      capabilities: ENABLED_CAPABILITIES,
      navigateToExternalVerification,
      ...options,
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
