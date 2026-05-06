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

  const initialSession = getStoredSession();
  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const [expired, setExpired] = useState<{ recruitmentId: string | null } | null>(
    !token && !initialSession ? { recruitmentId: null } : null,
  );
  const [rateLimited, setRateLimited] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);

  const verify = useCallback(() => {
    if (!token || session || verifyingRef.current) return;

    verifyingRef.current = true;
    setVerifying(true);

    verifyToken({ token })
      .then((result) => {
        if (result.status === "ok") {
          storeSession(result.recruitmentId, result.sessionToken);
          setSession({ sessionToken: result.sessionToken, recruitmentId: result.recruitmentId });
        } else if (result.status === "rate_limited") {
          setRateLimited(true);
        } else {
          setExpired({ recruitmentId: result.recruitmentId });
        }
      })
      .catch(() => {
        setNetworkError(true);
      })
      .finally(() => {
        verifyingRef.current = false;
        setVerifying(false);
      });
  }, [token, session, verifyToken]);

  useEffect(() => {
    verify();
  }, [verify]);

  const retry = useCallback(() => {
    setNetworkError(false);
    verify();
  }, [verify]);

  if (rateLimited) return { status: "rateLimited" };
  if (networkError) return { status: "networkError", retry };
  if (expired) return { status: "expired", recruitmentId: expired.recruitmentId };
  if (!session || verifying) return { status: "loading" };

  return {
    status: "authenticated",
    session,
    clearSession: () => clearSession(session.recruitmentId),
  };
}
