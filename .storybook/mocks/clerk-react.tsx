// Storybook用の@clerk/reactモック
import type { ReactNode } from "react";

const noSignInErrors = {
  fields: { identifier: null, password: null, code: null },
  raw: null,
  global: null,
};

const noSignUpErrors = {
  fields: {
    firstName: null,
    lastName: null,
    emailAddress: null,
    phoneNumber: null,
    password: null,
    username: null,
    code: null,
    captcha: null,
    legalAccepted: null,
  },
  raw: null,
  global: null,
};

const createSignInMock = () => {
  const signIn = {
    status: "needs_identifier",
    createdSessionId: null as string | null,
    supportedSecondFactors: [],
    existingSession: undefined,
    isTransferable: false,
    password: async () => {
      signIn.status = "complete";
      signIn.createdSessionId = "storybook_session";
      return { error: null };
    },
    sso: async () => ({ error: null }),
    create: async () => ({ error: null }),
    mfa: {
      sendEmailCode: async () => ({ error: null }),
      verifyEmailCode: async () => {
        signIn.status = "complete";
        signIn.createdSessionId = "storybook_session";
        return { error: null };
      },
    },
    resetPasswordEmailCode: {
      sendCode: async () => ({ error: null }),
      verifyCode: async () => {
        signIn.status = "needs_new_password";
        return { error: null };
      },
      submitPassword: async () => {
        signIn.status = "complete";
        signIn.createdSessionId = "storybook_session";
        return { error: null };
      },
    },
    finalize: async () => ({ error: null }),
    reset: async () => {
      signIn.status = "needs_identifier";
      signIn.createdSessionId = null;
      return { error: null };
    },
  };

  return signIn;
};

const createSignUpMock = () => {
  const signUp = {
    status: "missing_requirements",
    createdSessionId: null as string | null,
    unverifiedFields: ["email_address"],
    missingFields: [],
    existingSession: undefined,
    isTransferable: false,
    password: async () => ({ error: null }),
    sso: async () => ({ error: null }),
    create: async () => ({ error: null }),
    verifications: {
      sendEmailCode: async () => ({ error: null }),
      verifyEmailCode: async () => {
        signUp.status = "complete";
        signUp.createdSessionId = "storybook_session";
        return { error: null };
      },
    },
    finalize: async () => ({ error: null }),
    reset: async () => {
      signUp.status = "missing_requirements";
      signUp.createdSessionId = null;
      return { error: null };
    },
  };

  return signUp;
};

export const ClerkProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignInButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignUpButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignIn = () => <div />;
export const SignUp = () => <div />;
export const SignOutButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useAuth = () => ({
  isSignedIn: false,
  isLoaded: true,
  userId: null,
  getToken: async () => "storybook-session-token",
});
export const useUser = () => ({ isSignedIn: false, isLoaded: true, user: null });
export const useClerk = () => ({
  loaded: true,
  handleRedirectCallback: async () => {},
  setActive: async () => {},
  signOut: async () => {},
});
export const useReverification = <TArgs extends unknown[], TResult>(fetcher: (...args: TArgs) => Promise<TResult>) =>
  fetcher;
export const useSignIn = () => ({
  signIn: createSignInMock(),
  errors: noSignInErrors,
  fetchStatus: "idle" as const,
});
export const useSignUp = () => ({
  signUp: createSignUpMock(),
  errors: noSignUpErrors,
  fetchStatus: "idle" as const,
});
