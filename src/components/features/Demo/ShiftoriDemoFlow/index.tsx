import { Box, Flex, Heading, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { LuChevronRight, LuUserPlus } from "react-icons/lu";
import { CreateRecruitmentForm } from "@/src/components/features/Dashboard/CreateRecruitmentForm/index.tsx";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import type { SubmitShiftSelectionInput } from "@/src/components/features/StaffSubmit/SubmitFormView";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { ShiftData } from "@/src/domains/shift/types";
import { DemoHighlightStyles } from "./DemoHighlightStyles";
import {
  buildDemoShifts,
  DEFAULT_RECRUITMENT,
  type DemoStep,
  dates,
  FORM_ID,
  POSITIONS,
  STAFFS,
  STEPS,
  SUBMISSION_DATA,
  stepIndexById,
  TIME_RANGE,
} from "./demoData";
import { buildDemoConfirmationEmailHtml, DemoEmailPreview } from "./emailPreview";

export type { DemoStep } from "./demoData";

type Props = {
  initialStep?: DemoStep;
};

export const ShiftoriDemoFlow = ({ initialStep = "recruit" }: Props) => {
  const [step, setStep] = useState<DemoStep>(initialStep);
  const [confirmed, setConfirmed] = useState(initialStep === "share");
  const [shifts, setShifts] = useState<ShiftData[]>(() => buildDemoShifts());
  const currentStepIndex = stepIndexById.get(step) ?? 0;
  const current = STEPS[currentStepIndex];

  const handleRecruitmentSubmit = () => {
    setStep("submit");
  };

  const handleStaffSubmit = async (_submission: SubmitShiftSelectionInput) => {
    setStep("adjust");
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setStep("share");
  };

  const handleReset = () => {
    setStep("recruit");
    setConfirmed(false);
    setShifts(buildDemoShifts());
  };

  const handleStepSelect = (nextStep: DemoStep) => {
    if (nextStep === "recruit") {
      handleReset();
      return;
    }

    setStep(nextStep);
    setConfirmed(nextStep === "share");
  };

  return (
    <Box bg="gray.50" minH="720px" color="fg" data-demo-step={step}>
      <DemoHighlightStyles />
      <Box maxW="1280px" mx="auto" px={{ base: 3, lg: 5 }} py={{ base: 3, lg: 4 }}>
        <Stack gap={3}>
          <DemoHeader
            currentStep={step}
            title={current.title}
            description={current.description}
            onStepSelect={handleStepSelect}
          />

          {step === "recruit" && <RecruitStep onSubmit={handleRecruitmentSubmit} />}
          {step === "submit" && <SubmitStep onSubmit={handleStaffSubmit} />}
          {step === "adjust" && (
            <AdjustStep shifts={shifts} isConfirmed={confirmed} onShiftsChange={setShifts} onConfirm={handleConfirm} />
          )}
          {step === "share" && <ShareStep shifts={shifts} onReplay={handleReset} />}
        </Stack>
      </Box>
    </Box>
  );
};

const DemoHeader = ({
  currentStep,
  title,
  description,
  onStepSelect,
}: {
  currentStep: DemoStep;
  title: string;
  description: string;
  onStepSelect: (step: DemoStep) => void;
}) => (
  <Box bg="white" borderBottomWidth="1px" borderColor="border.muted" px={{ base: 4, lg: 5 }} py={3}>
    <Flex
      gap={4}
      direction={{ base: "column", lg: "row" }}
      justify="space-between"
      align={{ base: "stretch", lg: "center" }}
    >
      <Stack gap={1}>
        <Heading as="h1" size="sm" fontWeight="bold">
          {title}
        </Heading>
        <Text color="fg.muted" fontSize={{ base: "xs", md: "sm" }} lineHeight={1.7}>
          {description}
        </Text>
      </Stack>
      <Stepper currentStep={currentStep} onStepSelect={onStepSelect} />
    </Flex>
  </Box>
);

const Stepper = ({ currentStep, onStepSelect }: { currentStep: DemoStep; onStepSelect: (step: DemoStep) => void }) => {
  return (
    <Flex
      w={{ base: "full", md: "auto" }}
      gap={{ base: 0, md: 2 }}
      align="center"
      justify={{ base: "space-between", md: "flex-start" }}
      overflowX="auto"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.id === currentStep;
        return (
          <HStack key={step.id} gap={2} flexShrink={0}>
            <Flex
              as="button"
              align="center"
              justify="center"
              gap={2}
              px={0}
              py={0}
              minW={7}
              h={7}
              bg="transparent"
              color={isCurrent ? "fg" : "fg.subtle"}
              cursor="pointer"
              onClick={() => onStepSelect(step.id)}
              _hover={{ color: "teal.700" }}
              aria-current={isCurrent ? "step" : undefined}
            >
              <Flex
                align="center"
                justify="center"
                w={7}
                h={7}
                borderRadius="full"
                bg={isCurrent ? "teal.600" : "gray.100"}
                color={isCurrent ? "white" : "fg.muted"}
                fontSize="xs"
                fontWeight="bold"
              >
                {index + 1}
              </Flex>
              <Text fontSize="sm" fontWeight={isCurrent ? "bold" : "medium"}>
                {step.label}
              </Text>
            </Flex>
            {index < STEPS.length - 1 && <Box display={{ base: "none", md: "block" }} w={6} h="1px" bg="gray.200" />}
          </HStack>
        );
      })}
    </Flex>
  );
};

const Surface = ({ children }: { children: ReactNode }) => (
  <Box bg="white" borderWidth="1px" borderColor="border.muted" overflow="hidden" minH="640px">
    {children}
  </Box>
);

const PHONE_FRAME_WIDTH = "clamp(320px, 40dvh, 360px)";
const PHONE_FRAME_HEIGHT = "clamp(560px, calc(100dvh - 220px), 750px)";
const PHONE_SURFACE_HEIGHT = "clamp(600px, calc(100dvh - 180px), 790px)";

const RecruitStep = ({ onSubmit }: { onSubmit: () => void }) => (
  <Surface>
    <Flex minH="640px" align="center" justify="center" px={{ base: 4, md: 6 }} py={{ base: 8, md: 12 }}>
      <Stack w="full" maxW="620px" gap={6}>
        <CreateRecruitmentForm defaultValues={DEFAULT_RECRUITMENT} displayMode="periodOnly" onSubmit={onSubmit} />
        <Button type="submit" form={FORM_ID} colorPalette="teal" h="48px" fontWeight="bold" data-demo-primary>
          募集をつくる
        </Button>
      </Stack>
    </Flex>
  </Surface>
);

const SubmitStep = ({ onSubmit }: { onSubmit: (submission: SubmitShiftSelectionInput) => Promise<void> }) => (
  <Surface>
    <Flex
      h={{ base: "auto", md: PHONE_SURFACE_HEIGHT }}
      align="center"
      justify="center"
      px={{ base: 0, md: 6 }}
      py={{ base: 0, md: 5 }}
    >
      <PhoneFrame>
        <ShiftSubmitPage data={SUBMISSION_DATA} onSubmit={onSubmit} />
      </PhoneFrame>
    </Flex>
  </Surface>
);

const PhoneFrame = ({ children }: { children: ReactNode }) => (
  <Box
    w={{ base: "100%", md: PHONE_FRAME_WIDTH }}
    maxW="100%"
    h={{ base: "auto", md: PHONE_FRAME_HEIGHT }}
    bg={{ base: "transparent", md: "gray.900" }}
    borderRadius={{ base: 0, md: "38px" }}
    p={{ base: 0, md: 2 }}
    boxShadow={{ base: "none", md: "0 18px 40px rgba(15, 23, 42, 0.18)" }}
  >
    <Box
      h="100%"
      bg="gray.50"
      borderRadius={{ base: 0, md: "31px" }}
      overflow={{ base: "visible", md: "auto" }}
      css={{
        "& > div": {
          minHeight: "100%",
        },
      }}
    >
      {children}
    </Box>
  </Box>
);

const AdjustStep = ({
  shifts,
  isConfirmed,
  onShiftsChange,
  onConfirm,
}: {
  shifts: ShiftData[];
  isConfirmed: boolean;
  onShiftsChange: (shifts: ShiftData[]) => void;
  onConfirm: () => void;
}) => (
  <Surface>
    <Box h="640px">
      <ShiftForm
        shopId="demo-shop"
        staffs={STAFFS}
        positions={POSITIONS}
        initialShifts={shifts}
        dates={dates}
        timeRange={TIME_RANGE}
        initialViewMode="daily"
        isConfirmed={isConfirmed}
        onShiftsChange={onShiftsChange}
        onSaveDraft={() => {}}
        onConfirm={onConfirm}
      />
    </Box>
  </Surface>
);

const ShareStep = ({ shifts, onReplay }: { shifts: ShiftData[]; onReplay: () => void }) => {
  const html = buildDemoConfirmationEmailHtml(shifts);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [showCloseHelp, setShowCloseHelp] = useState(false);

  const handleCompleteOpenChange = ({ open }: { open: boolean }) => {
    setIsCompleteOpen(open);
  };

  const handleEmailLinkClick = () => {
    setShowCloseHelp(false);
    setIsCompleteOpen(true);
  };

  const handleReplay = () => {
    setIsCompleteOpen(false);
    setShowCloseHelp(false);
    onReplay();
  };

  const handleCloseDemo = () => {
    setShowCloseHelp(false);
    window.close();
    window.setTimeout(() => {
      if (!window.closed) {
        setShowCloseHelp(true);
      }
    }, 160);
  };

  return (
    <Surface>
      <Flex
        h={{ base: "auto", md: PHONE_SURFACE_HEIGHT }}
        align="center"
        justify="center"
        px={{ base: 0, md: 6 }}
        py={{ base: 0, md: 5 }}
      >
        <PhoneFrame>
          <DemoEmailPreview html={html} onLinkClick={handleEmailLinkClick} />
        </PhoneFrame>
      </Flex>
      <Dialog
        title="ありがとうございました！"
        isOpen={isCompleteOpen}
        onOpenChange={handleCompleteOpenChange}
        onClose={handleReplay}
        closeLabel="もう1回試す"
        onSubmit={handleCloseDemo}
        submitLabel="デモを閉じる"
        maxW="420px"
      >
        <Stack gap={3}>
          <Text color="fg.muted" lineHeight={1.8}>
            募集から共有の体験は終わりです。
          </Text>
          <Text color="fg.muted" lineHeight={1.8}>
            このデモページは閉じて大丈夫です。
          </Text>
          <Text color="fg.muted" lineHeight={1.8}>
            各画面はこのあとも操作できます。
            <br />
            時間があれば、もう一度触って使い心地を試してみてください。
          </Text>
          <DemoCompleteCta />
          {showCloseHelp && (
            <Box bg="teal.50" borderWidth="1px" borderColor="teal.200" borderRadius="md" px={4} py={3}>
              <Text color="teal.800" fontSize="sm" lineHeight={1.7}>
                ブラウザの制限により自動で閉じられませんでした。お手数ですが、このタブを閉じてください。
              </Text>
            </Box>
          )}
        </Stack>
      </Dialog>
    </Surface>
  );
};

const DemoCompleteCta = () => (
  <Box bg="teal.50" borderWidth="1px" borderColor="teal.200" borderRadius="md" px={4} py={4} mt={2}>
    <Stack gap={3}>
      <Text color="teal.900" fontWeight="bold" lineHeight={1.6}>
        このまま無料で始められます
      </Text>
      <Button
        asChild
        w="full"
        h="52px"
        colorPalette="teal"
        fontWeight="bold"
        borderRadius="md"
        justifyContent="space-between"
      >
        <RouterLink to="/signup" search={{ redirect: undefined }}>
          <Icon as={LuUserPlus} boxSize={5} />
          <Text as="span" flex={1} textAlign="center">
            無料ではじめる
          </Text>
          <Icon as={LuChevronRight} boxSize={5} />
        </RouterLink>
      </Button>
    </Stack>
  </Box>
);
