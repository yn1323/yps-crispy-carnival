import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExpiredView } from "@/src/components/features/StaffView/ExpiredView";
import { ShiftViewPage } from "@/src/components/features/StaffView/ShiftViewPage";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";

type SessionInfo = {
  sessionToken: string;
  recruitmentId: string;
};

function getStoredSession(recruitmentId?: string): SessionInfo | null {
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

function storeSession(recruitmentId: string, sessionToken: string): void {
  localStorage.setItem(`yps_session_${recruitmentId}`, JSON.stringify({ sessionToken, recruitmentId }));
}

export const Route = createFileRoute("/_unregistered/shifts/view")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  component: ShiftViewRoute,
});

function ShiftViewRoute() {
  const { token } = Route.useSearch();
  const verifyToken = useMutation(api.staffAuth.mutations.verifyToken);

  // LSにセッションがあればそちらを優先（トークンはワンタイムのため再検証しない）
  const initialSession = getStoredSession();
  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const [expired, setExpired] = useState<{ recruitmentId: string | null } | null>(
    !token && !initialSession ? { recruitmentId: null } : null,
  );
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (!token || session || verifyingRef.current) return;

    verifyingRef.current = true;
    setVerifying(true);

    verifyToken({ token })
      .then((result) => {
        if (result.status === "ok") {
          storeSession(result.recruitmentId, result.sessionToken);
          setSession({ sessionToken: result.sessionToken, recruitmentId: result.recruitmentId });
        } else {
          setExpired({ recruitmentId: result.recruitmentId });
        }
      })
      .catch(() => {
        setExpired({ recruitmentId: null });
      })
      .finally(() => {
        verifyingRef.current = false;
        setVerifying(false);
      });
  }, [token, session, verifyToken]);

  if (expired) {
    return (
      <StaffLayout shopName="シフト閲覧">
        <ExpiredView recruitmentId={expired.recruitmentId} />
      </StaffLayout>
    );
  }

  if (!session || verifying) {
    return <FullPageSpinner />;
  }

  return <ShiftViewContent session={session} />;
}

function ShiftViewContent({ session }: { session: SessionInfo }) {
  const data = useQuery(api.staffAuth.queries.getShiftViewData, {
    sessionToken: session.sessionToken,
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) {
    return <FullPageSpinner />;
  }

  if (data === null) {
    return (
      <StaffLayout shopName="シフト閲覧">
        <ExpiredView recruitmentId={session.recruitmentId} />
      </StaffLayout>
    );
  }

  return (
    <StaffLayout shopName={data.shopName}>
      <ShiftViewPage
        periodLabel={data.periodLabel}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        staffs={data.staffs}
        assignments={data.assignments}
        timeRange={data.timeRange}
      />
    </StaffLayout>
  );
}
