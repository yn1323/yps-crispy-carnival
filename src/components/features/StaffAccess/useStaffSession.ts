import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { StaffAccessKind, StaffLinkUnavailableReason } from "@/src/domains/staffAccess";
import type { StaffLinkInvalidReason } from "@/src/domains/webMeasurement";
import { setStaffMeasurementIdentity, trackAppError, trackProductEvent } from "@/src/lib/webMeasurement";
import { clearSession, getStoredSession, type SessionInfo, storeSession } from "./sessionStorage";

export type StaffSessionState =
  | { status: "loading" }
  | { status: "rateLimited" }
  | { status: "expired"; recruitmentId: string | null; reason: StaffLinkUnavailableReason }
  | { status: "networkError"; retry: () => void }
  | { status: "authenticated"; session: SessionInfo; clearSession: () => void };

const DEFAULT_EXPIRED_REASON: StaffLinkUnavailableReason = "invalid_link";

/** serverは失敗理由をまとめて返すため、画面が知っている範囲で計測用の理由へ分ける。 */
function getStaffLinkInvalidReason(
  recruitmentId: string | null,
  reason: StaffLinkUnavailableReason,
): StaffLinkInvalidReason {
  if (reason !== "invalid_link") return reason;
  return recruitmentId ? "rejected" : "unknown_link";
}

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
          setStaffMeasurementIdentity({ recruitmentId: result.recruitmentId });
          setSession({ sessionToken: result.sessionToken, recruitmentId: result.recruitmentId, accessKind });
        } else if (result.status === "rate_limited") {
          trackProductEvent({ kind: "staff_link_invalid", reason: "rate_limited", accessKind });
          setRateLimited(true);
        } else {
          const reason = result.reason ?? DEFAULT_EXPIRED_REASON;
          if (result.recruitmentId && (reason === "recruitment_deleted" || reason === "submission_closed")) {
            clearSession(result.recruitmentId, accessKind);
          }
          if (result.recruitmentId && accessKind === "view" && reason === "invalid_link") {
            const storedSession = getStoredSession(result.recruitmentId, accessKind);
            if (storedSession) {
              setStaffMeasurementIdentity({ recruitmentId: storedSession.recruitmentId });
              setSession(storedSession);
              return;
            }
          }
          trackProductEvent({
            kind: "staff_link_invalid",
            reason: getStaffLinkInvalidReason(result.recruitmentId, reason),
            accessKind,
          });
          setExpired({ recruitmentId: result.recruitmentId, reason });
        }
      })
      .catch((error: unknown) => {
        if (verifyingRequestKeyRef.current !== requestKey) return;
        trackAppError("screen", error);
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
      trackProductEvent({ kind: "staff_link_invalid", reason: "no_token", accessKind });
      verifyingRequestKeyRef.current = null;
      setSession(null);
      setExpired({ recruitmentId: null, reason: DEFAULT_EXPIRED_REASON });
      setRateLimited(false);
      setNetworkError(false);
      return;
    }
    verify();
  }, [accessKind, token, verify]);

  useEffect(() => () => setStaffMeasurementIdentity(null), []);

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
