import { Box, Text } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <Box p={4}>
      <Text fontSize="xl" fontWeight="bold">
        ダッシュボード
      </Text>
      <Text color="gray.500" mt={2}>
        v3構築中...
      </Text>
    </Box>
  );
}
