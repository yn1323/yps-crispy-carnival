import { Box, Flex, HStack, Icon, Text } from "@chakra-ui/react";
import { type ComponentProps, type ElementType, Fragment, type ReactNode } from "react";
import { Dialog } from "@/src/components/ui/Dialog";

export type StepperDialogStep<TStep extends string = string> = {
  value: TStep;
  label: string;
  icon?: ElementType;
  title?: ReactNode;
  description?: ReactNode;
};

type StepperDialogProps = Omit<
  ComponentProps<typeof Dialog>,
  "hideFooter" | "maxW" | "maxH" | "contentProps" | "bodyProps"
> & {
  maxW?: ComponentProps<typeof Dialog>["maxW"];
  maxH?: ComponentProps<typeof Dialog>["maxH"];
  minH?: ComponentProps<typeof Dialog>["maxH"];
  contentProps?: ComponentProps<typeof Dialog>["contentProps"];
  bodyProps?: ComponentProps<typeof Dialog>["bodyProps"];
};

type StepperDialogStepsProps<TStep extends string> = {
  steps: readonly StepperDialogStep<TStep>[];
  currentStep: TStep;
};

type StepperDialogContentProps<TStep extends string> = StepperDialogStepsProps<TStep> & {
  children: ReactNode;
  actions: ReactNode;
};

type StepperDialogStepTitleProps = {
  icon?: ElementType;
  title?: ReactNode;
  description?: ReactNode;
};

const renderStepDescription = (description: ReactNode) => {
  if (typeof description === "string") {
    return (
      <Text mt={1} fontSize="sm" color="fg.muted" lineHeight={1.7} whiteSpace="pre-line">
        {description}
      </Text>
    );
  }

  return (
    <Box mt={1} fontSize="sm" color="fg.muted" lineHeight={1.7}>
      {description}
    </Box>
  );
};

export const StepperDialog = ({
  children,
  maxW = { base: "100vw", md: "760px" },
  maxH = { base: "100dvh", md: "90dvh" },
  minH = { base: "100dvh", md: "min(480px, 90dvh)" },
  contentProps,
  bodyProps,
  ...dialogProps
}: StepperDialogProps) => (
  <Dialog
    {...dialogProps}
    hideFooter
    maxW={maxW}
    maxH={maxH}
    contentProps={{
      h: { base: "100dvh", md: "auto" },
      minH,
      borderRadius: { base: 0, md: "l3" },
      overflow: "hidden",
      my: { base: 0, md: "var(--dialog-base-margin)" },
      ...contentProps,
    }}
    bodyProps={{
      p: 0,
      display: "flex",
      flexDirection: "column",
      minH: 0,
      overflowY: "hidden",
      ...bodyProps,
    }}
  >
    {children}
  </Dialog>
);

export const StepperDialogSteps = <TStep extends string>({ steps, currentStep }: StepperDialogStepsProps<TStep>) => {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.value === currentStep),
    0,
  );

  return (
    <Flex align="center" w="full" px={{ base: 4, md: 0 }}>
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <Fragment key={step.value}>
            <HStack gap={2} flexShrink={0} minW={0}>
              <Flex
                w="24px"
                h="24px"
                borderRadius="full"
                align="center"
                justify="center"
                bg={isCurrent || isDone ? "teal.500" : "gray.100"}
                color={isCurrent || isDone ? "white" : "gray.500"}
                fontSize="xs"
                fontWeight="bold"
                flexShrink={0}
              >
                {isDone ? "✓" : index + 1}
              </Flex>
              <Text
                display={{ base: isCurrent ? "block" : "none", md: "block" }}
                fontSize="sm"
                fontWeight={isCurrent ? "bold" : "semibold"}
                color={isCurrent ? "gray.900" : isDone ? "teal.700" : "gray.500"}
                whiteSpace="nowrap"
              >
                {step.label}
              </Text>
            </HStack>
            {index < steps.length - 1 && (
              <Box flex={1} minW={{ base: 3, md: 8 }} h="1px" bg={isDone ? "teal.300" : "gray.200"} mx={4} />
            )}
          </Fragment>
        );
      })}
    </Flex>
  );
};

export const StepperDialogStepTitle = ({ icon, title, description }: StepperDialogStepTitleProps) => (
  <HStack gap={3} align="flex-start">
    {icon && (
      <Flex w="36px" h="36px" borderRadius="full" bg="teal.50" color="teal.600" align="center" justify="center">
        <Icon as={icon} boxSize={5} />
      </Flex>
    )}
    <Box>
      {typeof title === "string" ? (
        <Text fontSize="md" fontWeight="bold" color="gray.900">
          {title}
        </Text>
      ) : (
        title
      )}
      {description && renderStepDescription(description)}
    </Box>
  </HStack>
);

export const StepperDialogActionBar = ({ children }: { children: ReactNode }) => (
  <Box
    position={{ base: "sticky", md: "static" }}
    bottom={0}
    px={{ base: 4, md: 6 }}
    py={4}
    bg="white"
    borderTopWidth={1}
    borderColor="border.default"
  >
    <Flex justify="space-between" gap={3}>
      {children}
    </Flex>
  </Box>
);

export const StepperDialogContent = <TStep extends string>({
  steps,
  currentStep,
  children,
  actions,
}: StepperDialogContentProps<TStep>) => {
  const currentStepDetail = steps.find((step) => step.value === currentStep);
  const shouldShowStepTitle = Boolean(
    currentStepDetail?.icon || currentStepDetail?.title || currentStepDetail?.description,
  );

  return (
    <Flex flex={1} minH={0} direction="column">
      <Box px={{ base: 0, md: 6 }} pt={{ base: 2, md: 0 }} pb={4}>
        <StepperDialogSteps steps={steps} currentStep={currentStep} />
      </Box>

      <Box flex={1} minH={0} overflowY="auto" px={{ base: 4, md: 8 }} pb={{ base: 4, md: 6 }}>
        <Flex direction="column" gap={5}>
          {shouldShowStepTitle && (
            <StepperDialogStepTitle
              icon={currentStepDetail?.icon}
              title={currentStepDetail?.title}
              description={currentStepDetail?.description}
            />
          )}
          {children}
        </Flex>
      </Box>

      <StepperDialogActionBar key={currentStep}>{actions}</StepperDialogActionBar>
    </Flex>
  );
};
