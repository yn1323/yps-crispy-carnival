import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type AccountEmailChangeSession = {
  clerkUserId: string;
  source: "app" | "recovery";
};

export type AccountEmailCleanupSession = {
  clerkUserId: string;
  kind: "oldPrimary" | "rolledBackTarget";
  emailAddressId: string;
  primaryEmailAddressId: string;
};

// primary更新からConvex同期・旧メール削除まで、AuthGuardによる途中の画面差し替えを防ぐ。
export const accountEmailChangeSessionAtom = atom<AccountEmailChangeSession | null>(null);

const accountEmailCleanupStorage = {
  getItem: (key: string, initialValue: AccountEmailCleanupSession | null) => {
    if (typeof window === "undefined") return initialValue;

    try {
      const rawValue = window.sessionStorage.getItem(key);
      if (!rawValue) return initialValue;
      const value: unknown = JSON.parse(rawValue);
      return isAccountEmailCleanupSession(value) ? value : initialValue;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: AccountEmailCleanupSession | null) => {
    if (typeof window === "undefined") return;

    try {
      if (value === null) {
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // sessionStorageが使えない環境でも、現在の画面状態だけは進められるようにする。
    }
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;

    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // sessionStorageが使えない環境でも、現在の画面状態だけは進められるようにする。
    }
  },
};

// Convex同期後のClerk EmailAddress削除だけは、再読み込み後にも復旧できるようタブ単位で保持する。
// メールアドレス自体は保存せず、現在のClerk resourceとの照合に使うIDだけを保持する。
export const accountEmailCleanupSessionAtom = atomWithStorage<AccountEmailCleanupSession | null>(
  "account-email-cleanup-session",
  null,
  accountEmailCleanupStorage,
  { getOnInit: true },
);

function isAccountEmailCleanupSession(value: unknown): value is AccountEmailCleanupSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.clerkUserId === "string" &&
    candidate.clerkUserId.length > 0 &&
    (candidate.kind === "oldPrimary" || candidate.kind === "rolledBackTarget") &&
    typeof candidate.emailAddressId === "string" &&
    candidate.emailAddressId.length > 0 &&
    typeof candidate.primaryEmailAddressId === "string" &&
    candidate.primaryEmailAddressId.length > 0
  );
}
