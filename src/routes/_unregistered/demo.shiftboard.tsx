import { Box, Flex, Text } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { DemoShiftBoardPage } from "@/src/components/features/ShiftBoard/DemoShiftBoardPage";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_unregistered/demo/shiftboard")({
  head: () => ({
    meta: buildMeta({
      title: "デモ シフトボード",
      description: "シフトリを登録なしで試せるデモページ",
      noindex: true,
    }),
  }),
  component: DemoShiftBoardRoute,
});

function DemoShiftBoardRoute() {
  return (
    <>
      <Box display={{ base: "none", lg: "block" }} h="100dvh">
        <DemoShiftBoardPage />
      </Box>
      <Flex display={{ base: "flex", lg: "none" }} h="100dvh" align="center" justify="center" px={6}>
        <Text fontSize="lg" color="gray.500" textAlign="center">
          SP Coming Soon...
        </Text>
      </Flex>
    </>
  );
}
