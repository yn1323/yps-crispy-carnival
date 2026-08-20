import { throwIfClerkOperationFailed } from "./clerkOperations";

export type ResettableOAuthAttempt = {
  reset: () => Promise<{ error: unknown | null }>;
};

type ResetOAuthAttemptsParams = {
  signIn: ResettableOAuthAttempt;
  signUp: ResettableOAuthAttempt;
};

export async function resetOAuthAttempts({ signIn, signUp }: ResetOAuthAttemptsParams): Promise<void> {
  throwIfClerkOperationFailed(await signIn.reset());
  throwIfClerkOperationFailed(await signUp.reset());
}
