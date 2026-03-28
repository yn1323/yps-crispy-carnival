import { Flex, Spinner } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardContent } from "@/src/components/features/Dashboard/DashboardContent";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const data = useQuery(api.dashboard.queries.getDashboardData);

  if (data === undefined) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner />
      </Flex>
    );
  }

  if (data === null) return null;

  return (
    <Animation>
      <DashboardContent shop={data.shop} recruitments={data.recruitments} staffs={data.staffs} />
    </Animation>
  );
}
