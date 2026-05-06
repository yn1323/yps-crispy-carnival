type SessionInfo = {
  sessionToken: string;
  recruitmentId: string;
};

export type { SessionInfo };

export function getStoredSession(recruitmentId: string): SessionInfo | null {
  try {
    const val = localStorage.getItem(`yps_session_${recruitmentId}`);
    if (!val) return null;

    const session = JSON.parse(val) as SessionInfo;
    if (session.recruitmentId === recruitmentId) return session;
  } catch {
    // ignore
  }
  return null;
}

export function storeSession(recruitmentId: string, sessionToken: string): void {
  localStorage.setItem(`yps_session_${recruitmentId}`, JSON.stringify({ sessionToken, recruitmentId }));
}

export function clearSession(recruitmentId: string): void {
  localStorage.removeItem(`yps_session_${recruitmentId}`);
}
