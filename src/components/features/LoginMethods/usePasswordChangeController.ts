import { useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import type { UserResource } from "@clerk/shared/types";
import { useState } from "react";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { toLoginMethodsUserSnapshot } from "./adapter";
import { getPasswordChangeErrorMessage } from "./loginMethodErrorPresentation";
import type { LoginMethodOperationRunner } from "./migrationTypes";
import type { PasswordChangeValues } from "./passwordSchema";
import type { LoginMethodOnNeedsReverification, LoginMethodOperationOptions } from "./reverificationTypes";
import { buildLoginMethodsViewModel } from "./script";

export type PasswordChangeState =
  | { isOpen: false; status: "idle"; message: null }
  | { isOpen: true; status: "idle" | "loading" | "error"; message: string | null };

export type PasswordChangeController = {
  state: PasswordChangeState;
  open: () => void;
  close: (force?: boolean) => void;
  changePassword: (values: PasswordChangeValues) => Promise<boolean | undefined>;
};

type Options = {
  isLoaded: boolean;
  user: UserResource | null | undefined;
  getCurrentActorId: () => string | null;
  onNeedsReverification: LoginMethodOnNeedsReverification;
  runOperation: LoginMethodOperationRunner;
};

const CLOSED_STATE: PasswordChangeState = { isOpen: false, status: "idle", message: null };
const PASSWORD_CHANGE_REVERIFICATION_OPTIONS: LoginMethodOperationOptions = {
  preferredFirstFactorStrategy: "password",
};

export function usePasswordChangeController({
  isLoaded,
  user,
  getCurrentActorId,
  onNeedsReverification,
  runOperation,
}: Options): PasswordChangeController {
  const actorUserId = user?.id ?? null;
  const [state, setState] = useState<PasswordChangeState>(CLOSED_STATE);

  const reloadUser = async () => {
    if (!isLoaded || !user || !actorUserId || user.id !== actorUserId || getCurrentActorId() !== actorUserId) {
      throw new Error("Unauthenticated");
    }
    await user.reload();
    if (user.id !== actorUserId || getCurrentActorId() !== actorUserId) throw new Error("Unauthenticated");
    return user;
  };

  const updatePasswordWithReverification = useReverification(
    async ({ currentPassword, newPassword }: PasswordChangeValues) => {
      const currentUser = await reloadUser();
      const currentViewModel = buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(currentUser));
      if (!currentViewModel.emailPassword.canChangePassword) return "unavailable" as const;

      const updatedUser = await currentUser.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: true,
      });
      if (updatedUser.id !== actorUserId || !updatedUser.passwordEnabled) return "unavailable" as const;
      return "updated" as const;
    },
    { onNeedsReverification },
  );

  const { run: changePassword } = useSingleFlight(async (values: PasswordChangeValues) =>
    runOperation(async () => {
      setState({ isOpen: true, status: "loading", message: null });
      try {
        const result = await updatePasswordWithReverification(values);
        if (result == null) {
          setState((current) => (current.isOpen ? { isOpen: true, status: "idle", message: null } : CLOSED_STATE));
          return false;
        }
        if (result === "unavailable") {
          setState((current) =>
            current.isOpen
              ? {
                  isOpen: true,
                  status: "error",
                  message: "パスワードを変更できません。最新のログイン方法を確認してください。",
                }
              : CLOSED_STATE,
          );
          return false;
        }

        setState(CLOSED_STATE);
        showSuccessToast({ title: "パスワードを変更しました" });
        return true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          setState((current) => (current.isOpen ? { isOpen: true, status: "idle", message: null } : CLOSED_STATE));
          return false;
        }
        setState((current) =>
          current.isOpen
            ? { isOpen: true, status: "error", message: getPasswordChangeErrorMessage(error) }
            : CLOSED_STATE,
        );
        return false;
      }
    }, PASSWORD_CHANGE_REVERIFICATION_OPTIONS),
  );

  const canOpen = user
    ? buildLoginMethodsViewModel(toLoginMethodsUserSnapshot(user)).emailPassword.canChangePassword
    : false;

  return {
    state,
    open: () => {
      if (!canOpen) return;
      setState({ isOpen: true, status: "idle", message: null });
    },
    close: (force = false) => {
      if (state.isOpen && state.status === "loading" && !force) return;
      setState(CLOSED_STATE);
    },
    changePassword: async (values) => (await changePassword(values)) ?? false,
  };
}
