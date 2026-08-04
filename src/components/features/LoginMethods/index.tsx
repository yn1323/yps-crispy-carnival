import { useUser } from "@clerk/react";
import { LoginMethodsView } from "./LoginMethodsView";
import { DISABLED_LOGIN_METHOD_CAPABILITIES } from "./script";
import { useLoginMethodsController } from "./useLoginMethodsController";

type LoginMethodsProps = {
  googleOAuthReturn?: boolean;
  onGoogleOAuthReturnHandled?: () => void;
};

export function LoginMethods({ googleOAuthReturn, onGoogleOAuthReturnHandled }: LoginMethodsProps) {
  const { isLoaded, user } = useUser();
  const controller = useLoginMethodsController({
    isLoaded,
    user,
    // Clerk instanceで成立性を確認した操作だけを、個別のgateとして後から有効化する。
    capabilities: DISABLED_LOGIN_METHOD_CAPABILITIES,
    googleOAuthReturn,
    onGoogleOAuthReturnHandled,
  });

  return <LoginMethodsView controller={controller} />;
}

export { LoginMethodsView } from "./LoginMethodsView";
export type { LoginMethodsController, LoginMethodsViewModel } from "./types";
