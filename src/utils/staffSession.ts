type SessionInfo = {
  sessionToken: string;
  recruitmentId: string;
  accessKind: StaffAccessKind;
};

export type StaffAccessKind = "submit" | "view";

export type { SessionInfo };

function sessionKey(recruitmentId: string, accessKind: StaffAccessKind): string {
  return `yps_session_${accessKind}_${recruitmentId}`;
}

export function getStoredSession(recruitmentId: string, accessKind: StaffAccessKind): SessionInfo | null {
  try {
    const val = localStorage.getItem(sessionKey(recruitmentId, accessKind));
    if (!val) return null;

    const session = JSON.parse(val) as SessionInfo;
    if (session.recruitmentId === recruitmentId && session.accessKind === accessKind) return session;
  } catch {
    // localStorage はユーザー操作や古い形式の値で壊れ得るため、復旧は再ログイン導線に任せる。
  }
  return null;
}

export function getLegacySubmitSession(recruitmentId: string): SessionInfo | null {
  try {
    const val = localStorage.getItem(`yps_session_${recruitmentId}`);
    if (!val) return null;

    const session = JSON.parse(val) as Omit<SessionInfo, "accessKind">;
    if (session.recruitmentId === recruitmentId) return { ...session, accessKind: "submit" };
  } catch {
    // accessKind 導入前の値は提出用にだけ救済する。読めない値は再認証に任せる。
  }
  return null;
}

export function storeSession(recruitmentId: string, sessionToken: string, accessKind: StaffAccessKind): void {
  localStorage.setItem(
    sessionKey(recruitmentId, accessKind),
    JSON.stringify({ sessionToken, recruitmentId, accessKind }),
  );
}

export function clearSession(recruitmentId: string, accessKind: StaffAccessKind): void {
  localStorage.removeItem(sessionKey(recruitmentId, accessKind));
}
