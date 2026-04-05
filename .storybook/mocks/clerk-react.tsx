// Storybook用の@clerk/clerk-reactモック
import type { ReactNode } from "react";

export const ClerkProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignInButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const SignOutButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useAuth = () => ({ isSignedIn: false, isLoaded: true, userId: null });
export const useUser = () => ({ isSignedIn: false, isLoaded: true, user: null });
