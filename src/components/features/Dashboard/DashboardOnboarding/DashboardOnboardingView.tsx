import { Box, Heading, HStack, Stack } from "@chakra-ui/react";
import { LuSparkles } from "react-icons/lu";
import { OnboardingCallout } from "./OnboardingCallout";
import type {
  DashboardOnboardingStage,
  DashboardOnboardingState,
} from "./OnboardingCallout/deriveDashboardOnboardingState";

type Props = {
  state: Extract<DashboardOnboardingState, { kind: "visible" }>;
  onDismiss: (stage: DashboardOnboardingStage) => void;
};

export function DashboardOnboardingView({ state, onDismiss }: Props) {
  return (
    <Stack as="section" aria-label="シフトリへようこそ！" gap={{ base: 3, lg: 4 }}>
      <HStack gap={2.5} align="center">
        <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0} color="fg.muted">
          <LuSparkles />
        </Box>
        <Heading as="h2" textStyle="sectionTitle" color="gray.900">
          シフトリへようこそ！
        </Heading>
      </HStack>
      <OnboardingCallout state={state} showLabel={false} onDismiss={onDismiss} />
    </Stack>
  );
}
