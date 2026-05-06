import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { clearSession, getStoredSession, type SessionInfo, storeSession } from "@/src/utils/staffSession";

type StaffSessionState =
  | { status: "loading" }
  | { status: "rateLimited" }
  | { status: "expired"; recruitmentId: string | null }
  | { status: "networkError"; retry: () => void }
  | { status: "authenticated"; session: SessionInfo; clearSession: () => void };

export function useStaffSession(token: string | undefined): StaffSessionState {
  const verifyToken = useMutation(api.staffAuth.mutations.verifyToken);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [expired, setExpired] = useState<{ recruitmentId: string | null } | null>(
    !token ? { recruitmentId: null } : null,
  );
  const [rateLimited, setRateLimited] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const verifyingTokenRef = useRef<string | null>(null);

  const verify = useCallback(() => {
    if (!token || verifyingTokenRef.current === token) return;

    const verifyingToken = token;
    verifyingTokenRef.current = verifyingToken;
    setSession(null);
    setExpired(null);
    setRateLimited(false);
    setNetworkError(false);

    verifyToken({ token: verifyingToken })
      .then((result) => {
        if (verifyingTokenRef.current !== verifyingToken) return;

        if (result.status === "ok") {
          storeSession(result.recruitmentId, result.sessionToken);
          setSession({ sessionToken: result.sessionToken, recruitmentId: result.recruitmentId });
        } else if (result.status === "rate_limited") {
          setRateLimited(true);
        } else {
          if (result.recruitmentId) {
            const storedSession = getStoredSession(result.recruitmentId);
            if (storedSession) {
              setSession(storedSession);
              return;
            }
          }
          setExpired({ recruitmentId: result.recruitmentId });
        }
      })
      .catch(() => {
        if (verifyingTokenRef.current !== verifyingToken) return;
        setNetworkError(true);
      })
      .finally(() => {
        if (verifyingTokenRef.current === verifyingToken) {
          verifyingTokenRef.current = null;
        }
      });
  }, [token, verifyToken]);

  useEffect(() => {
    if (!token) {
      setSession(null);
      setExpired({ recruitmentId: null });
      setRateLimited(false);
      setNetworkError(false);
      return;
    }
    verify();
  }, [token, verify]);

  const retry = useCallback(() => {
    verify();
  }, [verify]);

  if (rateLimited) return { status: "rateLimited" };
  if (networkError) return { status: "networkError", retry };
  if (expired) return { status: "expired", recruitmentId: expired.recruitmentId };
  if (!session) return { status: "loading" };

  return {
    status: "authenticated",
    session,
    clearSession: () => clearSession(session.recruitmentId),
  };
}
