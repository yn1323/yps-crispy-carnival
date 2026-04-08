import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DayEntry } from "@/src/components/features/StaffSubmit/DayCard";
import { ExpiredSubmitView } from "@/src/components/features/StaffSubmit/ExpiredSubmitView";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { clearSession, getStoredSession, type SessionInfo, storeSession } from "@/src/utils/staffSession";

export const Route = createFileRoute("/_unregistered/shifts/submit")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  component: ShiftSubmitRoute,
});

function ShiftSubmitRoute() {
  const { token } = Route.useSearch();
  const verifyToken = useMutation(api.staffAuth.mutations.verifyToken);

  const initialSession = getStoredSession();
  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const [expired, setExpired] = useState<{ recruitmentId: string | null } | null>(
    !token && !initialSession ? { recruitmentId: null } : null,
  );
  const [rateLimited, setRateLimited] = useState(false);
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
        } else if (result.status === "rate_limited") {
          setRateLimited(true);
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

  if (rateLimited) {
    return (
      <StaffLayout shopName="シフト提出">
        <Flex flex={1} align="center" justify="center" px={8}>
          <VStack gap={4}>
            <Icon boxSize={12} color="orange.500">
              <LuTriangleAlert />
            </Icon>
            <Text fontSize="lg" fontWeight="semibold" textAlign="center">
              アクセス制限中
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              しばらく時間を置いてから{"\n"}再度アクセスしてください
            </Text>
          </VStack>
        </Flex>
      </StaffLayout>
    );
  }

  if (expired) {
    return <ExpiredSubmitView shopName="シフト提出" />;
  }

  if (!session || verifying) {
    return <FullPageSpinner />;
  }

  return (
    <ErrorBoundary
      fallback={<ExpiredSubmitView shopName="シフト提出" />}
      onError={(error) => {
        if (error.message?.includes("ArgumentValidationError")) {
          clearSession(session.recruitmentId);
        }
      }}
    >
      <ShiftSubmitContent session={session} />
    </ErrorBoundary>
  );
}

function ShiftSubmitContent({ session }: { session: SessionInfo }) {
  const data = useQuery(api.shiftSubmission.queries.getSubmissionPageData, {
    sessionToken: session.sessionToken,
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });
  const submitMutation = useMutation(api.shiftSubmission.mutations.submitShiftRequests);

  if (data === undefined) {
    return <FullPageSpinner />;
  }

  if (data === null) {
    return <ExpiredSubmitView shopName="シフト提出" />;
  }

  const handleSubmit = async (entries: DayEntry[]) => {
    const requests = entries
      .filter((e) => e.isWorking)
      .map((e) => ({ date: e.date, startTime: e.startTime, endTime: e.endTime }));
    await submitMutation({
      sessionToken: session.sessionToken,
      recruitmentId: session.recruitmentId as Id<"recruitments">,
      requests,
    });
  };

  return <ShiftSubmitPage data={data} onSubmit={handleSubmit} />;
}
