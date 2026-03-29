import { Container, Flex, Spinner } from "@chakra-ui/react";
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
      <Container maxW="1024px" px={4} pb={8} w="100%">
        <Flex justify="center" align="center" minH="200px">
          <Spinner />
        </Flex>
      </Container>
    );
  }

  if (data === null) return null;

  return (
    <Container maxW="1024px" px={4} pb={8} w="100%">
      <Animation>
        <DashboardContent shop={data.shop} recruitments={data.recruitments} staffs={data.staffs} />
      </Animation>
    </Container>
  );
}
