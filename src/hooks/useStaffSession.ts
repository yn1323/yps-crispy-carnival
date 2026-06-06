import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  clearSession,
  getStoredSession,
  type SessionInfo,
  type StaffAccessKind,
  type StaffLinkUnavailableReason,
  storeSession,
} from "@/src/utils/staffSession";

type StaffSessionState =
  | { status: "loading" }
  | { status: "rateLimited" }
  | { status: "expired"; recruitmentId: string | null; reason: StaffLinkUnavailableReason }
  | { status: "networkError"; retry: () => void }
  | { status: "authenticated"; session: SessionInfo; clearSession: () => void };

const DEFAULT_EXPIRED_REASON: StaffLinkUnavailableReason = "invalid_link";

export function useStaffSession(token: string | undefined, accessKind: StaffAccessKind): StaffSessionState {
  const verifyToken = useMutation(api.staffAuth.mutations.verifyToken);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [expired, setExpired] = useState<{ recruitmentId: string | null; reason: StaffLinkUnavailableReason } | null>(
    !token ? { recruitmentId: null, reason: DEFAULT_EXPIRED_REASON } : null,
  );
  const [rateLimited, setRateLimited] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const verifyingRequestKeyRef = useRef<string | null>(null);

  const verify = useCallback(() => {
    if (!token) return;

    const verifyingToken = token;
    const requestKey = `${accessKind}:${verifyingToken}`;
    if (verifyingRequestKeyRef.current === requestKey) return;

    verifyingRequestKeyRef.current = requestKey;
    setSession(null);
    setExpired(null);
    setRateLimited(false);
    setNetworkError(false);

    verifyToken({ token: verifyingToken, accessKind })
      .then((result) => {
        if (verifyingRequestKeyRef.current !== requestKey) return;

        if (result.status === "ok") {
          storeSession(result.recruitmentId, result.sessionToken, accessKind);
          setSession({ sessionToken: result.sessionToken, recruitmentId: result.recruitmentId, accessKind });
        } else if (result.status === "rate_limited") {
          setRateLimited(true);
        } else {
          const reason = result.reason ?? DEFAULT_EXPIRED_REASON;
          if (result.recruitmentId && accessKind === "view" && reason === "invalid_link") {
            const storedSession = getStoredSession(result.recruitmentId, accessKind);
            if (storedSession) {
              setSession(storedSession);
              return;
            }
          }
          setExpired({ recruitmentId: result.recruitmentId, reason });
        }
      })
      .catch(() => {
        if (verifyingRequestKeyRef.current !== requestKey) return;
        setNetworkError(true);
      })
      .finally(() => {
        if (verifyingRequestKeyRef.current === requestKey) {
          verifyingRequestKeyRef.current = null;
        }
      });
  }, [accessKind, token, verifyToken]);

  useEffect(() => {
    if (!token) {
      verifyingRequestKeyRef.current = null;
      setSession(null);
      setExpired({ recruitmentId: null, reason: DEFAULT_EXPIRED_REASON });
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
  if (expired) return { status: "expired", recruitmentId: expired.recruitmentId, reason: expired.reason };
  if (!session) return { status: "loading" };

  return {
    status: "authenticated",
    session,
    clearSession: () => clearSession(session.recruitmentId, accessKind),
  };
}
