import { atom } from "jotai";

export type AccountEmailChangeSession = {
  clerkUserId: string;
  source: "app" | "recovery";
};

// primary更新からConvex同期・旧メール削除まで、AuthGuardによる途中の画面差し替えを防ぐ。
export const accountEmailChangeSessionAtom = atom<AccountEmailChangeSession | null>(null);
