import { Box, Text } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_unregistered/welcome")({
  head: () => ({
    meta: buildMeta({ title: "Welcome", noindex: true }),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box p={8}>
      <Text>Welcome</Text>
    </Box>
  );
}
