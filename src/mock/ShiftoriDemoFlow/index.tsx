import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useState } from "react";
import { buildConfirmationEmailHtml } from "@/convex/notification/templates";
import type { CreateRecruitmentData } from "@/src/components/features/Dashboard/CreateRecruitmentForm";
import { CreateRecruitmentForm } from "@/src/components/features/Dashboard/CreateRecruitmentForm/index.tsx";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { DayEntry } from "@/src/components/features/StaffSubmit/DayCard";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit/ShiftSubmitPage";
import type { SubmissionData } from "@/src/components/features/StaffSubmit/SubmitFormView";
import { Button } from "@/src/components/ui/Button";
import { BREAK_POSITION, DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { formatDateWithWeekday, getDateRange } from "@/src/domains/shift/date";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";

export type DemoStep = "recruit" | "submit" | "adjust" | "share";

type Props = {
  initialStep?: DemoStep;
};

type StepDefinition = {
  id: DemoStep;
  label: string;
  title: string;
};

const FORM_ID = "create-recruitment-form";
const SHOP_NAME = "カフェ シフトリ";
const PERIOD_START = "2027-06-07";
const PERIOD_END = "2027-06-13";
const DEADLINE = "2027-06-05";
const TIME_RANGE: TimeRange = { start: 9, end: 22, unit: 30 };
const POSITIONS: PositionType[] = [
  DEFAULT_POSITION,
  { id: "demo-break", name: BREAK_POSITION.name, color: BREAK_POSITION.color },
];

const STAFFS: StaffType[] = [
  { id: "staff-aya", name: "佐藤あや", isSubmitted: true },
  { id: "staff-kenta", name: "田中健太", isSubmitted: true },
  { id: "staff-mio", name: "山田みお", isSubmitted: true },
  { id: "staff-ren", name: "高橋れん", isSubmitted: true },
];

const STEPS: StepDefinition[] = [
  { id: "recruit", label: "募集", title: "シフトを募集してみよう" },
  { id: "submit", label: "提出", title: "シフトを提出してみよう" },
  { id: "adjust", label: "調整", title: "シフトを確定しよう" },
  { id: "share", label: "共有", title: "確定シフトのメールを見てみよう" },
];

const DEFAULT_RECRUITMENT: CreateRecruitmentData = {
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  deadline: DEADLINE,
};

const SUBMISSION_DATA: SubmissionData = {
  shopName: SHOP_NAME,
  staffName: "佐藤あや",
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  deadline: DEADLINE,
  isBeforeDeadline: true,
  hasSubmitted: false,
  existingRequests: [
    { date: "2027-06-07", startTime: "10:00", endTime: "16:00" },
    { date: "2027-06-09", startTime: "11:00", endTime: "17:00" },
    { date: "2027-06-12", startTime: "09:00", endTime: "15:00" },
  ],
  legalConsentRequired: false,
  legalDocuments: {
    terms: {
      title: "スタッフ向け利用規約",
      documentVersion: "staff-terms-doc-demo",
      requiredConsentVersion: "staff-terms-consent-demo",
      path: "/terms/staff",
    },
    privacy: {
      title: "スタッフ向けプライバシーポリシー",
      documentVersion: "staff-privacy-doc-demo",
      requiredConsentVersion: "staff-privacy-consent-demo",
      path: "/privacy/staff",
    },
  },
  timeRange: { startTime: "09:00", endTime: "22:00" },
  previousWeeklyPattern: null,
};

const createShift = (
  staff: StaffType,
  date: string,
  requestedTime: ShiftData["requestedTime"],
  positions: ShiftData["positions"],
): ShiftData => ({
  id: `demo-shift-${staff.id}-${date}`,
  staffId: staff.id,
  staffName: staff.name,
  date,
  requestedTime,
  positions,
});

const buildDemoShifts = (): ShiftData[] => {
  const [aya, kenta, mio, ren] = STAFFS;
  return [
    createShift(aya, "2027-06-07", { start: "10:00", end: "16:00" }, [
      {
        id: "seg-aya-0607",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "10:00",
        end: "16:00",
      },
    ]),
    createShift(aya, "2027-06-09", { start: "11:00", end: "17:00" }, [
      {
        id: "seg-aya-0609",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "11:00",
        end: "17:00",
      },
    ]),
    createShift(aya, "2027-06-12", { start: "09:00", end: "15:00" }, [
      {
        id: "seg-aya-0612",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "09:00",
        end: "15:00",
      },
    ]),
    createShift(kenta, "2027-06-07", { start: "17:00", end: "22:00" }, [
      {
        id: "seg-kenta-0607",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "17:00",
        end: "22:00",
      },
    ]),
    createShift(kenta, "2027-06-10", { start: "18:00", end: "22:00" }, [
      {
        id: "seg-kenta-0610",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "18:00",
        end: "22:00",
      },
    ]),
    createShift(mio, "2027-06-08", { start: "09:00", end: "14:00" }, [
      {
        id: "seg-mio-0608",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "09:00",
        end: "14:00",
      },
    ]),
    createShift(mio, "2027-06-11", { start: "12:00", end: "18:00" }, [
      {
        id: "seg-mio-0611",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "12:00",
        end: "18:00",
      },
    ]),
    createShift(ren, "2027-06-09", { start: "18:00", end: "22:00" }, [
      {
        id: "seg-ren-0609",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "18:00",
        end: "22:00",
      },
    ]),
    createShift(ren, "2027-06-13", { start: "10:00", end: "17:00" }, [
      {
        id: "seg-ren-0613",
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
        start: "10:00",
        end: "17:00",
      },
    ]),
  ];
};

const dates = getDateRange(PERIOD_START, PERIOD_END);
const periodLabel = `${formatDateWithWeekday(PERIOD_START)}〜${formatDateWithWeekday(PERIOD_END)}`;
const stepIndexById = new Map(STEPS.map((step, index) => [step.id, index]));

export const ShiftoriDemoFlow = ({ initialStep = "recruit" }: Props) => {
  const [step, setStep] = useState<DemoStep>(initialStep);
  const [confirmed, setConfirmed] = useState(initialStep === "share");
  const [shifts, setShifts] = useState<ShiftData[]>(() => buildDemoShifts());
  const currentStepIndex = stepIndexById.get(step) ?? 0;
  const current = STEPS[currentStepIndex];

  const handleRecruitmentSubmit = () => {
    setStep("submit");
  };

  const handleStaffSubmit = async (_entries: DayEntry[]) => {
    setStep("adjust");
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setStep("share");
  };

  return (
    <Box bg="gray.50" minH="720px" color="fg" data-demo-step={step}>
      <DemoHighlightStyles />
      <Box maxW="1280px" mx="auto" px={{ base: 3, lg: 5 }} py={{ base: 3, lg: 4 }}>
        <Stack gap={3}>
          <DemoHeader currentStep={step} title={current.title} />

          {step === "recruit" && <RecruitStep onSubmit={handleRecruitmentSubmit} />}
          {step === "submit" && <SubmitStep onSubmit={handleStaffSubmit} />}
          {step === "adjust" && (
            <AdjustStep shifts={shifts} isConfirmed={confirmed} onShiftsChange={setShifts} onConfirm={handleConfirm} />
          )}
          {step === "share" && <ShareStep shifts={shifts} />}
        </Stack>
      </Box>
    </Box>
  );
};

const DemoHeader = ({ currentStep, title }: { currentStep: DemoStep; title: string }) => (
  <Box bg="white" borderBottomWidth="1px" borderColor="border.muted" px={{ base: 4, lg: 5 }} py={3}>
    <Flex
      gap={4}
      direction={{ base: "column", lg: "row" }}
      justify="space-between"
      align={{ base: "stretch", lg: "center" }}
    >
      <Heading as="h1" size="sm" fontWeight="bold">
        {title}
      </Heading>
      <Stepper currentStep={currentStep} />
    </Flex>
  </Box>
);

const Stepper = ({ currentStep }: { currentStep: DemoStep }) => {
  return (
    <Flex gap={{ base: 1.5, md: 2 }} align="center" overflowX="auto">
      {STEPS.map((step, index) => {
        const isCurrent = step.id === currentStep;
        return (
          <HStack key={step.id} gap={2} flexShrink={0}>
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
            <Text fontSize="sm" fontWeight={isCurrent ? "bold" : "medium"} color={isCurrent ? "fg" : "fg.subtle"}>
              {step.label}
            </Text>
            {index < STEPS.length - 1 && <Box w={{ base: 3, md: 6 }} h="1px" bg="gray.200" />}
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

const RecruitStep = ({ onSubmit }: { onSubmit: () => void }) => (
  <Surface>
    <Stack maxW="620px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 8, md: 12 }} gap={6}>
      <CreateRecruitmentForm defaultValues={DEFAULT_RECRUITMENT} onSubmit={onSubmit} />
      <Button type="submit" form={FORM_ID} colorPalette="teal" h="48px" fontWeight="bold" data-demo-primary>
        募集をつくる
      </Button>
    </Stack>
  </Surface>
);

const SubmitStep = ({ onSubmit }: { onSubmit: (entries: DayEntry[]) => Promise<void> }) => (
  <Surface>
    <Flex justify="center" px={{ base: 0, md: 6 }} py={{ base: 0, md: 5 }}>
      <PhoneFrame>
        <ShiftSubmitPage data={SUBMISSION_DATA} onSubmit={onSubmit} />
      </PhoneFrame>
    </Flex>
  </Surface>
);

const PhoneFrame = ({ children }: { children: ReactNode }) => (
  <Box
    w={{ base: "100%", md: "390px" }}
    maxW="100%"
    h={{ base: "auto", md: "820px" }}
    bg={{ base: "transparent", md: "gray.900" }}
    borderRadius={{ base: 0, md: "38px" }}
    p={{ base: 0, md: 2 }}
    boxShadow={{ base: "none", md: "0 18px 40px rgba(15, 23, 42, 0.18)" }}
  >
    <Box h="100%" bg="gray.50" borderRadius={{ base: 0, md: "31px" }} overflow={{ base: "visible", md: "auto" }}>
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

const ShareStep = ({ shifts }: { shifts: ShiftData[] }) => {
  const html = buildDemoConfirmationEmailHtml(shifts);

  return (
    <Surface>
      <Flex justify="center" px={{ base: 0, md: 6 }} py={{ base: 0, md: 5 }}>
        <PhoneFrame>
          <DemoEmailPreview html={html} />
        </PhoneFrame>
      </Flex>
    </Surface>
  );
};

const DemoEmailPreview = ({ html }: { html: string }) => (
  <iframe
    title="確定シフトメール"
    srcDoc={html}
    sandbox="allow-same-origin"
    style={{
      width: "100%",
      border: 0,
      backgroundColor: "#ffffff",
      display: "block",
      height: "820px",
    }}
  />
);

const buildDemoConfirmationEmailHtml = (shifts: ShiftData[]) =>
  buildConfirmationEmailHtml({
    staffName: "佐藤あや",
    periodLabel,
    shifts: buildStaffEmailShifts(shifts, "staff-aya"),
    magicLinkUrl: "https://shiftori.app/shifts/view?token=demo-confirmed-shift",
    reissueUrl: "https://shiftori.app/shifts/reissue?token=demo-reissue",
    isResend: false,
  })
    .replace(/background-color:#f7fafc/g, "background-color:#ffffff")
    .replace("background-color:#ffffff;padding:24px 0;", "background-color:#ffffff;padding:0;")
    .replace(
      "max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;",
      "max-width:100%;background-color:#ffffff;",
    );

const buildStaffEmailShifts = (shifts: ShiftData[], staffId: string) =>
  dates.map((date) => {
    const shift = shifts.find((item) => item.staffId === staffId && item.date === date);
    const sortedPositions = [...(shift?.positions ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    const first = sortedPositions[0];
    const last = sortedPositions[sortedPositions.length - 1];
    return {
      date: formatDateWithWeekday(date),
      startTime: first?.start ?? null,
      endTime: last?.end ?? null,
    };
  });

const DemoHighlightStyles = () => (
  <style>{`
    @keyframes shiftori-demo-soft-pulse {
      0%, 100% {
        background-color: #0f766e;
        box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.26), 0 1px 2px rgba(13, 148, 136, 0.18);
        outline-color: rgba(13, 148, 136, 0.26);
      }
      50% {
        background-color: #14b8a6;
        box-shadow: 0 0 0 10px rgba(20, 184, 166, 0.2), 0 6px 16px rgba(13, 148, 136, 0.2);
        outline-color: rgba(20, 184, 166, 0.52);
      }
    }

    [data-demo-primary],
    [data-demo-step="submit"] button:not([aria-label]):not([aria-haspopup]),
    [data-demo-step="adjust"] [data-tour="confirm-button"] {
      animation: shiftori-demo-soft-pulse 3.2s ease-in-out infinite;
      outline: 2px solid rgba(13, 148, 136, 0.26);
      outline-offset: 2px;
      position: relative;
      z-index: 1;
    }
  `}</style>
);
