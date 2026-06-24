import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LuTriangleAlert, LuWifiOff } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftViewPage } from "@/src/components/features/StaffView/ShiftViewPage";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { useStaffSession } from "@/src/hooks/useStaffSession";

type Props = {
  token: string | undefined;
};

export function StaffShiftViewRoutePage({ token }: Props) {
  const state = useStaffSession(token, "view");

  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "rateLimited") {
    return (
      <StaffLayout shopName="シフト閲覧">
        <StaffCenteredContent>
          <Empty
            icon={LuTriangleAlert}
            title="アクセスが集中しています"
            description={"少し時間をおいて、\nもう一度お試しください。"}
            tone="warning"
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }
  if (state.status === "networkError") {
    return (
      <StaffLayout shopName="シフト閲覧">
        <StaffCenteredContent>
          <Empty
            icon={LuWifiOff}
            title="ページを開けませんでした"
            description={
              "通信が切れた可能性があります。\nもう一度読み込むか、Safari・Chrome・Edgeなどのブラウザで開いてください。"
            }
            tone="warning"
            action={
              <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={state.retry}>
                再試行する
              </Button>
            }
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }
  if (state.status === "expired") {
    return (
      <StaffLayout shopName="シフト閲覧">
        <StaffCenteredContent>
          <Empty
            icon={LuTriangleAlert}
            title={"このリンクの有効期限が\n切れています"}
            description={"下のボタンから新しいリンクを\n発行してください"}
            tone="warning"
            action={
              state.recruitmentId ? (
                <Link to="/shifts/reissue" search={{ recruitmentId: state.recruitmentId }}>
                  <Button colorPalette="teal" size="md" borderRadius="lg" px={6}>
                    リンクを再発行する
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <StaffLayout shopName="シフト閲覧">
          <StaffCenteredContent>
            <Empty
              icon={LuTriangleAlert}
              title={"このリンクの有効期限が\n切れています"}
              description={"下のボタンから新しいリンクを\n発行してください"}
              tone="warning"
              action={
                <Link to="/shifts/reissue" search={{ recruitmentId: state.session.recruitmentId }}>
                  <Button colorPalette="teal" size="md" borderRadius="lg" px={6}>
                    リンクを再発行する
                  </Button>
                </Link>
              }
            />
          </StaffCenteredContent>
        </StaffLayout>
      }
      onError={(error) => {
        if (error.message?.includes("ArgumentValidationError")) {
          state.clearSession();
        }
      }}
    >
      <ShiftViewContent session={state.session} />
    </ErrorBoundary>
  );
}

function ShiftViewContent({ session }: { session: { sessionToken: string; recruitmentId: string } }) {
  const data = useQuery(api.shiftView.queries.getShiftViewData, {
    sessionToken: session.sessionToken,
    accessKind: "view",
    recruitmentId: session.recruitmentId as Id<"recruitments">,
  });

  if (data === undefined) return <FullPageSpinner />;

  if (data === null) {
    return (
      <StaffLayout shopName="シフト閲覧">
        <StaffCenteredContent>
          <Empty
            icon={LuTriangleAlert}
            title={"このリンクの有効期限が\n切れています"}
            description={"下のボタンから新しいリンクを\n発行してください"}
            tone="warning"
            action={
              <Link to="/shifts/reissue" search={{ recruitmentId: session.recruitmentId }}>
                <Button colorPalette="teal" size="md" borderRadius="lg" px={6}>
                  リンクを再発行する
                </Button>
              </Link>
            }
          />
        </StaffCenteredContent>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout shopName={data.shopName}>
      <ShiftViewPage
        periodLabel={data.periodLabel}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        shopClosedDates={data.shopClosedDates}
        submissionPattern={data.submissionPattern}
        staffs={data.staffs}
        positions={data.positions}
        assignments={data.assignments}
        timeRange={data.timeRange}
      />
    </StaffLayout>
  );
}
