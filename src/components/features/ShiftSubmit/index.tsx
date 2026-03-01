import { Box, Center, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useState } from "react";
import "dayjs/locale/ja";
import { useMutation } from "convex/react";
import { LuCalendarDays } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { generateDateRange } from "@/src/components/features/Shift/utils/transformRecruitmentData";
import { toaster } from "@/src/components/ui/toaster";
import { ConfirmView } from "./ConfirmView";
import { EntryForm } from "./EntryForm";
import { SubmittedView } from "./SubmittedView";

dayjs.locale("ja");

export type ShiftEntry = {
  date: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
};

export type TimePattern = {
  startTime: string;
  endTime: string;
  count: number;
};

type ShiftSubmitProps = {
  token: string;
  staff: { _id: string; displayName: string };
  shop: { shopName: string; timeUnit: number; openTime: string; closeTime: string };
  recruitment: { _id: string; startDate: string; endDate: string; deadline: string };
  existingRequest: {
    entries: { date: string; isAvailable: boolean; startTime?: string; endTime?: string }[];
    submittedAt: number;
    updatedAt?: number;
  } | null;
  previousRequest: {
    entries: { date: string; isAvailable: boolean; startTime?: string; endTime?: string }[];
  } | null;
  frequentTimePatterns: TimePattern[];
};

type ViewState = "form" | "confirm" | "submitted";

// 初期エントリーを生成（既存提出があればそれを使用、なければ全日不可）
const createInitialEntries = (dates: string[], existingRequest: ShiftSubmitProps["existingRequest"]): ShiftEntry[] => {
  if (existingRequest) {
    const entryMap = new Map(existingRequest.entries.map((e) => [e.date, e]));
    return dates.map((date) => {
      const existing = entryMap.get(date);
      if (existing) {
        return { date, isAvailable: existing.isAvailable, startTime: existing.startTime, endTime: existing.endTime };
      }
      return { date, isAvailable: false };
    });
  }
  return dates.map((date) => ({ date, isAvailable: false }));
};

export const ShiftSubmit = ({
  token,
  staff,
  shop,
  recruitment,
  existingRequest,
  previousRequest,
  frequentTimePatterns,
}: ShiftSubmitProps) => {
  const dates = generateDateRange(recruitment.startDate, recruitment.endDate);
  const [view, setView] = useState<ViewState>(existingRequest ? "submitted" : "form");
  const [entries, setEntries] = useState<ShiftEntry[]>(() => createInitialEntries(dates, existingRequest));
  const [submittedAt, setSubmittedAt] = useState<number | null>(
    existingRequest?.updatedAt ?? existingRequest?.submittedAt ?? null,
  );

  const submitMutation = useMutation(api.shiftRequest.mutations.submit);

  const handleUpdateEntry = (date: string, update: Partial<ShiftEntry>) => {
    setEntries((prev) => prev.map((e) => (e.date === date ? { ...e, ...update } : e)));
  };

  const handleApplyPrevious = () => {
    if (!previousRequest) return;
    const prevByDayOfWeek = new Map<number, (typeof previousRequest.entries)[number]>();
    for (const entry of previousRequest.entries) {
      prevByDayOfWeek.set(dayjs(entry.date).day(), entry);
    }
    setEntries((prev) =>
      prev.map((e) => {
        const prevEntry = prevByDayOfWeek.get(dayjs(e.date).day());
        if (prevEntry) {
          return {
            date: e.date,
            isAvailable: prevEntry.isAvailable,
            startTime: prevEntry.startTime,
            endTime: prevEntry.endTime,
          };
        }
        return e;
      }),
    );
  };

  const handleSubmit = async () => {
    const submitEntries = entries.map((e) => ({
      date: e.date,
      isAvailable: e.isAvailable,
      ...(e.isAvailable && e.startTime ? { startTime: e.startTime } : {}),
      ...(e.isAvailable && e.endTime ? { endTime: e.endTime } : {}),
    }));

    try {
      await submitMutation({ token, entries: submitEntries });
      setSubmittedAt(Date.now());
      setView("submitted");
      toaster.success({ title: "シフト希望を提出しました" });
    } catch (error) {
      toaster.error({
        title: "提出に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  const handleEdit = () => {
    setView("form");
  };

  return (
    <Center minH="100vh" bg="gray.50" p={4}>
      <Box maxW="md" w="full">
        {/* ヘッダー */}
        <VStack gap={3} mb={6} align="center">
          <Center bg="teal.100" p={3} borderRadius="full">
            <Icon as={LuCalendarDays} boxSize={6} color="teal.600" />
          </Center>
          <VStack gap={1}>
            <Heading size="md">{shop.shopName}</Heading>
            <Text fontSize="lg" fontWeight="bold">
              シフト希望提出
            </Text>
          </VStack>
          <Box bg="white" p={3} borderRadius="md" w="full" shadow="xs">
            <VStack gap={1} align="stretch" fontSize="sm">
              <Text>
                <Text as="span" fontWeight="bold">
                  募集期間:
                </Text>{" "}
                {dayjs(recruitment.startDate).format("M/D(ddd)")} 〜 {dayjs(recruitment.endDate).format("M/D(ddd)")}
              </Text>
              <Text>
                <Text as="span" fontWeight="bold">
                  締切:
                </Text>{" "}
                {dayjs(recruitment.deadline).format("M/D(ddd)")}
              </Text>
              <Text>
                <Text as="span" fontWeight="bold">
                  {staff.displayName}
                </Text>{" "}
                さん
              </Text>
            </VStack>
          </Box>
        </VStack>

        {/* ビュー切り替え */}
        {view === "form" && (
          <EntryForm
            entries={entries}
            totalDays={dates.length}
            previousRequest={previousRequest}
            frequentTimePatterns={frequentTimePatterns}
            shop={shop}
            onUpdateEntry={handleUpdateEntry}
            onApplyPrevious={handleApplyPrevious}
            onConfirm={() => setView("confirm")}
          />
        )}
        {view === "confirm" && <ConfirmView entries={entries} onSubmit={handleSubmit} onBack={() => setView("form")} />}
        {view === "submitted" && (
          <SubmittedView
            entries={entries}
            submittedAt={submittedAt}
            deadline={recruitment.deadline}
            onEdit={handleEdit}
          />
        )}
      </Box>
    </Center>
  );
};
