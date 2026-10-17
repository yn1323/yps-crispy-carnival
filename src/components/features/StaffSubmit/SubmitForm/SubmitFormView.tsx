import { Box, Checkbox, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCircleCheck, LuInfo, LuPointer, LuRefreshCw } from "react-icons/lu";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { SelectItemType } from "@/src/components/ui/Select";
import { formatDatePeriodWithWeekday, formatDateWithWeekday } from "@/src/domains/shift/date";
import { DateNoteDialog } from "../DateNoteDialog";
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
  note?: string;
  error?: string;
};

type NoteEditor = {
  date: string | null;
  note: string;
  open: (date: string) => void;
  close: () => void;
  save: (date: string, note: string) => void;
};

type Props = {
  data: SubmissionData;
  headerAction?: ReactNode;
  days: SubmitDay[];
  acceptedLegal: boolean;
  acceptedLegalError?: string;
  canApplyPreviousPattern: boolean;
  hasUnsentChanges: boolean;
  noteEditor: NoteEditor;
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
  hasUnsentChanges,
  noteEditor,
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
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={3} align="center" justify="space-between" gap={3}>
          <Box minW={0}>
            <Text fontSize="sm" fontWeight="semibold">
              {formatDatePeriodWithWeekday(data.periodStart, data.periodEnd)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              提出期限：{formatDateWithWeekday(data.deadline)} 23:59
            </Text>
          </Box>
          {data.hasSubmitted && (
            <Flex align="center" gap={1} flexShrink={0} color="green.600">
              <Icon boxSize={3.5}>
                <LuCircleCheck aria-hidden />
              </Icon>
              <Text fontSize="xs" fontWeight="semibold" whiteSpace="nowrap">
                提出済み
              </Text>
            </Flex>
          )}
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
          {days.map(({ entry, index, isShopClosed, note, error }) => {
            const onEditNote = () => noteEditor.open(entry.date);
            if (data.submissionPattern.kind === "dateOnly") {
              return (
                <DateOnlySubmissionDayCard
                  key={entry.date}
                  entry={entry}
                  onToggleWorking={() => (entry.isWorking ? onClear(index) : onSetWorking(index))}
                  isShopClosed={isShopClosed}
                  note={note}
                  onEditNote={onEditNote}
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
                  note={note}
                  onEditNote={onEditNote}
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
                note={note}
                onEditNote={onEditNote}
              />
            );
          })}
        </VStack>

        <Box px={4} pt={2} pb={6}>
          {data.legalConsentRequired && (
            <Box mb={4} p={4} bg="white" borderWidth={1} borderColor="border.default" borderRadius="md">
              <Text mb={3} fontSize="xs" color="fg.muted" lineHeight={1.7}>
                初めて提出するときや、規約に大きな変更があったときに、確認をお願いしています。
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
          {hasUnsentChanges && (
            <Flex
              role="status"
              mb={3}
              px={3}
              py={2}
              gap={1.5}
              align="center"
              bg="orange.50"
              borderWidth={1}
              borderColor="orange.200"
              borderRadius="md"
              color="orange.700"
            >
              <Icon boxSize={3.5} flexShrink={0}>
                <LuInfo aria-hidden />
              </Icon>
              <Text fontSize="xs" fontWeight="semibold">
                変更はまだ送られていません
              </Text>
            </Flex>
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
        title="提出期限を過ぎています"
        isOpen={lateSubmitDialog.isOpen}
        onOpenChange={lateSubmitDialog.onOpenChange}
        onClose={lateSubmitDialog.close}
        onSubmit={onLateSubmitConfirm}
        submitLabel="この内容で提出する"
        isLoading={isLateSubmitting}
        isSubmitDisabled={isLateSubmitting}
      >
        <Text fontSize="sm" lineHeight="tall" color="fg.default">
          提出期限を過ぎています。
          <br />
          提出後は、このリンクから変更できません。
          <br />
          変更が必要な場合は、シフト作成担当者に連絡してください。
        </Text>
      </Dialog>
      <DateNoteDialog
        date={noteEditor.date}
        note={noteEditor.note}
        onClose={noteEditor.close}
        onSave={noteEditor.save}
      />
    </SubmitPageLayout>
  );
}
