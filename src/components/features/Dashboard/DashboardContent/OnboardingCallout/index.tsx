import { Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuMapPinned, LuX } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { type EventData, Tour, type TourHandle, type TourStep } from "@/src/components/ui/Tour";
import type { DashboardOnboardingStage, DashboardOnboardingState } from "./deriveDashboardOnboardingState";

type Props = {
  state: Extract<DashboardOnboardingState, { kind: "visible" }>;
  showLabel?: boolean;
  onDismiss: (stage: DashboardOnboardingStage) => void;
};

const TOUR_BUTTON_LABEL = "ガイド";

const STEP_VISUAL = {
  create_recruitment: { bg: "teal.600", shadow: "teal.100" },
  submit_self: { bg: "orange.500", shadow: "orange.100" },
  review_submission: { bg: "blue.600", shadow: "blue.100" },
  add_staff: { bg: "purple.600", shadow: "purple.100" },
} satisfies Record<DashboardOnboardingStage, { bg: string; shadow: string }>;

export function OnboardingCallout({ state, showLabel = true, onDismiss }: Props) {
  const [runTour, setRunTour] = useState(false);
  const tourRef = useRef<TourHandle>(null);
  const step = buildTourStep(state);

  useEffect(() => {
    if (!runTour || !state.tour) return;

    const targetSelector = `[data-tour="${state.tour.target}"]`;
    const stopTourOnTargetClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(targetSelector)) return;
      tourRef.current?.skip();
      setRunTour(false);
    };

    document.addEventListener("click", stopTourOnTargetClick, true);
    return () => document.removeEventListener("click", stopTourOnTargetClick, true);
  }, [runTour, state]);

  const stepVisual = STEP_VISUAL[state.stage];

  const handleDismiss = () => {
    tourRef.current?.skip();
    setRunTour(false);
    onDismiss(state.stage);
  };

  const handleTourEvent = (data: EventData) => {
    if (data.type === "tour:end" || data.type === "error:target_not_found") {
      setRunTour(false);
    }
  };

  return (
    <>
      <Box
        aria-live="polite"
        bg="teal.50/55"
        borderRadius="xl"
        borderWidth="1px"
        borderColor="teal.100"
        boxShadow="xs"
        px={{ base: 4, md: 5, lg: 6 }}
        py={{ base: 3.5, md: 5 }}
        pe={{ base: 11, md: 16, lg: 20 }}
        position="relative"
      >
        <IconButton
          aria-label="シフトリへようこそを閉じる"
          variant="ghost"
          colorPalette="gray"
          size="sm"
          position="absolute"
          top={{ base: 2.5, md: "50%" }}
          insetEnd={{ base: 2.5, md: 3 }}
          transform={{ base: "none", md: "translateY(-50%)" }}
          onClick={handleDismiss}
        >
          <LuX />
        </IconButton>

        <Flex gap={{ base: 3, md: 5 }} align={{ base: "flex-start", md: "center" }} direction="row">
          <Flex
            boxSize={{ base: "48px", md: "60px" }}
            borderRadius="full"
            bg={stepVisual.bg}
            color="white"
            align="center"
            justify="center"
            flexShrink={0}
            boxShadow={`0 0 0 6px var(--chakra-colors-${stepVisual.shadow.replace(".", "-")})`}
            alignSelf={{ base: "flex-start", md: "center" }}
          >
            <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="black" lineHeight={1}>
              {state.progressLabel}
            </Text>
          </Flex>

          <Flex
            gap={{ base: 2.5, md: 5 }}
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            flex={1}
            minW={0}
          >
            <Stack gap={{ base: 2.5, md: 2 }} minW={0} flex={1}>
              {showLabel && (
                <HStack gap={2.5} wrap="wrap">
                  <Text fontSize="sm" fontWeight="bold" color="teal.800">
                    シフトリへようこそ！
                  </Text>
                </HStack>
              )}
              <Stack gap={1}>
                <Text fontSize={{ base: "md", md: "lg" }} fontWeight="bold" color="gray.900" lineHeight="short">
                  {state.title}
                </Text>
                <Text fontSize="sm" color="gray.700" lineHeight="tall">
                  {state.description}
                </Text>
              </Stack>
            </Stack>

            {step && (
              <Flex justify="flex-end" flexShrink={0} alignSelf={{ base: "stretch", md: "center" }}>
                <Button variant="solid" colorPalette="teal" size="sm" gap={1.5} onClick={() => setRunTour(true)}>
                  <LuMapPinned />
                  {TOUR_BUTTON_LABEL}
                </Button>
              </Flex>
            )}
          </Flex>
        </Flex>
      </Box>

      {step && (
        <Tour
          ref={tourRef}
          run={runTour}
          steps={[step]}
          onEvent={handleTourEvent}
          tooltipComponent={SpotlightOnlyTooltip}
          options={{ skipScroll: false, scrollOffset: 96, spotlightRadius: 10 }}
        />
      )}
    </>
  );
}

function buildTourStep(state: DashboardOnboardingState): TourStep | null {
  if (state.kind !== "visible" || !state.tour) return null;
  return {
    target: `[data-tour="${state.tour.target}"]`,
    placement: state.tour.placement,
    content: "",
    disableFocusTrap: true,
    floatingOptions: { hideArrow: true },
  };
}

const SpotlightOnlyTooltip = () => null;
