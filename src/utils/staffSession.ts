type SessionInfo = {
  sessionToken: string;
  recruitmentId: string;
};

export type { SessionInfo };

export function getStoredSession(recruitmentId?: string): SessionInfo | null {
  try {
    if (recruitmentId) {
      const val = localStorage.getItem(`yps_session_${recruitmentId}`);
      if (val) return JSON.parse(val) as SessionInfo;
      return null;
    }
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("yps_session_")) {
        const val = localStorage.getItem(key);
        if (val) return JSON.parse(val) as SessionInfo;
      }
    }
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
