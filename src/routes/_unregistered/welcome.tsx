import { Box, Text } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_unregistered/welcome")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box p={8}>
      <Text>Welcome</Text>
    </Box>
  );
}
