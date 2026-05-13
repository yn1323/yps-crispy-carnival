import { Box } from "@chakra-ui/react";
import { ShiftoriDemoFlow } from "@/src/components/features/Demo/ShiftoriDemoFlow";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

export function DemoFlowRoutePage() {
  return (
    <Box bg="gray.50" minH="100dvh" color="fg">
      <Header variant="public" showLinks={false} showLogin={false} />

      <Box as="main" pt={HEADER_HEIGHT}>
        <ShiftoriDemoFlow />
      </Box>
    </Box>
  );
}
