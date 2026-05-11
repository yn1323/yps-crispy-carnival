// Storybook用の@clerk/clerk-reactモック
import type { ReactNode } from "react";

export const ClerkProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignInButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignUpButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignOutButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useAuth = () => ({ isSignedIn: false, isLoaded: true, userId: null });
export const useUser = () => ({ isSignedIn: false, isLoaded: true, user: null });
export const useClerk = () => ({
  handleRedirectCallback: async () => {},
});
export const useSignIn = () => ({
  isLoaded: true,
  signIn: {
    authenticateWithRedirect: async () => {},
    create: async () => ({ status: "complete", createdSessionId: "storybook_session" }),
    attemptFirstFactor: async () => ({ status: "needs_new_password", createdSessionId: null }),
    resetPassword: async () => ({ status: "complete", createdSessionId: "storybook_session" }),
  },
  setActive: async () => {},
});
export const useSignUp = () => ({
  isLoaded: true,
  signUp: {
    authenticateWithRedirect: async () => {},
    create: async () => ({
      status: "complete",
      createdSessionId: "storybook_session",
      unverifiedFields: [],
    }),
    prepareEmailAddressVerification: async () => {},
    attemptEmailAddressVerification: async () => ({ status: "complete", createdSessionId: "storybook_session" }),
  },
  setActive: async () => {},
});
