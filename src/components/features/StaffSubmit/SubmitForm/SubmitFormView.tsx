import { Box, Checkbox, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuPointer, LuRefreshCw } from "react-icons/lu";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { SelectItemType } from "@/src/components/ui/Select";
import { formatDatePeriodWithWeekday, formatDateWithWeekday } from "@/src/domains/shift/date";
import { DateOnlySubmissionDayCard } from "../DateOnlySubmissionDayCard";
import { DayCard } from "../DayCard";
import { ShiftTypeSubmissionDayCard } from "../ShiftTypeSubmissionDayCard";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import type { DayEntry, SubmissionData } from "../types";
import { getInstructionText } from "./script";

type SubmitDay = {
  entry: DayEntry;
  index: number;
  isShopClosed: boolean;
  error?: string;
};

type Props = {
  data: SubmissionData;
  headerAction?: ReactNode;
  days: SubmitDay[];
  acceptedLegal: boolean;
  acceptedLegalError?: string;
  canApplyPreviousPattern: boolean;
  timeOptions: SelectItemType[];
  isSubmitting: boolean;
  isLateSubmitting: boolean;
  lateSubmitDialog: {
    isOpen: boolean;
    close: () => void;
    onOpenChange: (details: { open: boolean }) => void;
  };
  onSetWorking: (index: number) => void;
  onTimeChange: (index: number, field: "startTime" | "endTime", value: string) => void;
  onClear: (index: number) => void;
  onShiftTypeSelect: (index: number, optionId: string) => void;
  onApplyPreviousPattern: () => void;
  onAcceptedLegalChange: (checked: boolean) => void;
  onSubmit: () => void;
  onLateSubmitConfirm: () => Promise<void>;
};

export function SubmitFormView({
  data,
  headerAction,
  days,
  acceptedLegal,
  acceptedLegalError,
  canApplyPreviousPattern,
  timeOptions,
  isSubmitting,
  isLateSubmitting,
  lateSubmitDialog,
  onSetWorking,
  onTimeChange,
  onClear,
  onShiftTypeSelect,
  onApplyPreviousPattern,
  onAcceptedLegalChange,
  onSubmit,
  onLateSubmitConfirm,
}: Props) {
  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={data.shopName} actions={headerAction} />

      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={3} align="center">
          <Box>
            <Text fontSize="sm" fontWeight="semibold">
              {formatDatePeriodWithWeekday(data.periodStart, data.periodEnd)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              提出締切：{formatDateWithWeekday(data.deadline)} 23:59
            </Text>
          </Box>
        </Flex>
      </Box>

      <SubmitPageContent>
        <Flex px={4} pt={3} gap={1.5} align="center">
          <Icon color="fg.subtle" boxSize={3.5}>
            <LuPointer />
          </Icon>
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            {getInstructionText(data.submissionPattern)}
          </Text>
        </Flex>

        {canApplyPreviousPattern && (
          <Box px={4} pt={3}>
            <Button
              type="button"
              w="full"
              h="44px"
              variant="outline"
              colorPalette="teal"
              bg="white"
              borderRadius="lg"
              fontWeight="semibold"
              onClick={onApplyPreviousPattern}
            >
              <Icon boxSize={4}>
                <LuRefreshCw />
              </Icon>
              {data.submissionPattern.kind === "dateOnly" ? "前回と同じ出勤日を適用" : "前回と同じシフトを適用"}
            </Button>
          </Box>
        )}

        <VStack px={4} py={3} gap={2}>
          {days.map(({ entry, index, isShopClosed, error }) => {
            if (data.submissionPattern.kind === "dateOnly") {
              return (
                <DateOnlySubmissionDayCard
                  key={entry.date}
                  entry={entry}
                  onToggleWorking={() => (entry.isWorking ? onClear(index) : onSetWorking(index))}
                  isShopClosed={isShopClosed}
                />
              );
            }

            if (data.submissionPattern.kind === "shiftType") {
              return (
                <ShiftTypeSubmissionDayCard
                  key={entry.date}
                  entry={entry}
                  options={data.submissionPattern.options}
                  onToggleWorking={() => onSetWorking(index)}
                  onSelect={(optionId) => onShiftTypeSelect(index, optionId)}
                  onClear={() => onClear(index)}
                  isShopClosed={isShopClosed}
                />
              );
            }

            return (
              <DayCard
                key={entry.date}
                entry={entry}
                timeOptions={timeOptions}
                onToggleWorking={() => onSetWorking(index)}
                onTimeChange={(field, value) => onTimeChange(index, field, value)}
                onClear={() => onClear(index)}
                isShopClosed={isShopClosed}
                error={error}
              />
            );
          })}
        </VStack>

        <Box px={4} pt={2} pb={6}>
          {data.legalConsentRequired && (
            <Box mb={4} p={4} bg="white" borderWidth={1} borderColor="border.default" borderRadius="md">
              <Text mb={3} fontSize="xs" color="fg.muted" lineHeight={1.7}>
                初めての提出時や、規約の大きな変更があったときのみ確認をお願いしています。
              </Text>
              <Checkbox.Root
                colorPalette="teal"
                checked={acceptedLegal}
                cursor="pointer"
                onCheckedChange={(details) => onAcceptedLegalChange(details.checked === true)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control cursor="pointer" />
                <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
                  <LegalDocumentLink href={data.legalDocuments.terms.path}>利用規約</LegalDocumentLink>と
                  <LegalDocumentLink href={data.legalDocuments.privacy.path}>プライバシーポリシー</LegalDocumentLink>
                  に同意します
                </Checkbox.Label>
              </Checkbox.Root>
              {acceptedLegalError && (
                <Text mt={2} fontSize="xs" color="red.600">
                  {acceptedLegalError}
                </Text>
              )}
            </Box>
          )}
          <Button
            w="full"
            h="48px"
            colorPalette="teal"
            borderRadius="lg"
            fontWeight="semibold"
            data-submit-action="primary"
            onClick={onSubmit}
            loading={isSubmitting}
          >
            {data.hasSubmitted ? "希望シフトを更新" : "希望シフトを提出"}
          </Button>
        </Box>
      </SubmitPageContent>
      <Dialog
        title="提出締切を過ぎています"
        isOpen={lateSubmitDialog.isOpen}
        onOpenChange={lateSubmitDialog.onOpenChange}
        onClose={lateSubmitDialog.close}
        onSubmit={onLateSubmitConfirm}
        submitLabel="この内容で提出する"
        isLoading={isLateSubmitting}
        isSubmitDisabled={isLateSubmitting}
      >
        <Text fontSize="sm" lineHeight="tall" color="fg.default">
          提出締切を過ぎています。提出後、このリンクでは変更できません。変更が必要な場合はシフト作成担当者に連絡してください。
        </Text>
      </Dialog>
    </SubmitPageLayout>
  );
}
