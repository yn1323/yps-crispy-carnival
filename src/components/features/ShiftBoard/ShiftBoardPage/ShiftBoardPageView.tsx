import { Alert, Box, Flex, Grid, Icon, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { LuChevronLeft, LuCircleCheck, LuExternalLink, LuFileDown } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { RecruitmentChangedNotice } from "@/src/components/shared/RecruitmentChangedNotice";
import { ConfirmShiftContent } from "@/src/components/shared/ShiftConfirmationContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { RemindUnsubmittedContent } from "../RemindUnsubmittedContent";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog";
import type { ShiftBoardPageViewProps } from "./types";

export const ShiftBoardPageView = ({ viewModel, intents, layout = "legacy", header }: ShiftBoardPageViewProps) => {
  const { shiftForm, confirmDialog, unsubmittedDialog, unsavedChangesDialog } = viewModel;
  if (viewModel.isRecruitmentChanged) {
    return <RecruitmentChangedNotice onReload={intents.onReload ?? (() => window.location.reload())} />;
  }

  return (
    <Flex
      direction="column"
      h={
        layout === "app"
          ? "full"
          : {
              base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
              md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
            }
      }
      minH={0}
    >
      {layout === "legacy" && (
        <Grid
          templateColumns={{ base: "56px minmax(0, 1fr) 56px", lg: "minmax(0, 1fr) auto minmax(0, 1fr)" }}
          alignItems="center"
          bg="white"
          px={{ base: 4, lg: 6 }}
          py={2}
          flexShrink={0}
        >
          <Box justifySelf="start">
            <Link to="/dashboard" search={{ shop: shiftForm.shopId }}>
              <Flex
                align="center"
                gap={1}
                color="gray.500"
                whiteSpace="nowrap"
                _hover={{ color: "gray.700" }}
                cursor="pointer"
              >
                <Icon boxSize={4}>
                  <LuChevronLeft />
                </Icon>
                <Text fontSize="sm">戻る</Text>
              </Flex>
            </Link>
          </Box>
          <Text
            fontSize={{ base: "sm", lg: "md" }}
            fontWeight={600}
            color="gray.900"
            textAlign="center"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {viewModel.periodLabel}
          </Text>
          <Flex justifySelf="end" align="center" gap={3} minW={0}>
            {viewModel.isConfirmed && viewModel.confirmedAtLabel && (
              <Flex align="center" gap={1} flexShrink={0}>
                <Icon color="green.600" boxSize={3.5}>
                  <LuCircleCheck />
                </Icon>
                <Text fontSize="xs" color="green.600" display={{ base: "none", lg: "inline" }}>
                  確定済み（{viewModel.confirmedAtLabel}）
                </Text>
                <Text fontSize="2xs" color="green.600" display={{ base: "inline", lg: "none" }}>
                  確定済み
                </Text>
              </Flex>
            )}
            {viewModel.showTimeInputGuide && (
              <Button
                asChild
                size="sm"
                variant="ghost"
                colorPalette="teal"
                display={{ base: "none", lg: "inline-flex" }}
                flexShrink={0}
              >
                <a
                  href="/demo/shiftboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="勤務時間の入力方法（別タブで開きます）"
                >
                  勤務時間の入力方法
                  <LuExternalLink aria-hidden="true" focusable="false" />
                </a>
              </Button>
            )}
          </Flex>
        </Grid>
      )}

      {viewModel.isReadOnly && (
        <Alert.Root status="info" borderRadius={0} flexShrink={0}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>このシフトは閲覧のみです</Alert.Title>
            <Alert.Description whiteSpace="pre-line">{viewModel.readOnlyReason}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Box flex={1} minH={0}>
        <ShiftForm
          key={viewModel.isReadOnly ? "read-only" : "editable"}
          shopId={shiftForm.shopId}
          staffs={shiftForm.staffs}
          positions={shiftForm.positions}
          initialShifts={shiftForm.initialShifts}
          dates={shiftForm.dates}
          timeRange={shiftForm.timeRange}
          holidays={shiftForm.holidays}
          submissionPattern={shiftForm.submissionPattern}
          isReadOnly={viewModel.isReadOnly}
          onShiftsChange={intents.onShiftsChange}
          isConfirmed={viewModel.isConfirmed}
          onSaveDraft={intents.onSaveDraft}
          onConfirm={intents.onConfirmRequest}
          isSavingDraft={shiftForm.isSavingDraft}
          isConfirming={shiftForm.isConfirming}
          reminderStatus={shiftForm.reminderStatus}
          onOpenUnsubmittedDetails={intents.onOpenUnsubmittedDetails}
          validationIssues={shiftForm.validationIssues}
          validationWarnings={shiftForm.validationWarnings}
          onDismissValidationIssues={intents.onDismissValidationIssues}
          header={layout === "app" ? header : undefined}
          action={
            viewModel.exportAction ? (
              <Button
                size="sm"
                variant="outline"
                onClick={intents.onOpenExport}
                disabled={viewModel.exportAction.isDisabled}
                aria-label="PDF・Excel（別タブで開きます）"
                h={{ base: "28px", lg: "32px" }}
                minW={{ base: "28px", lg: "auto" }}
                px={{ base: 2, lg: 3 }}
              >
                <Icon boxSize={4} aria-hidden="true">
                  <LuFileDown focusable="false" />
                </Icon>
                <Text as="span" display={{ base: "none", lg: "inline" }}>
                  PDF・Excel
                </Text>
              </Button>
            ) : undefined
          }
        />
      </Box>

      <Dialog
        title={confirmDialog.title}
        isOpen={confirmDialog.isOpen}
        onOpenChange={intents.onConfirmDialogOpenChange}
        onSubmit={intents.onConfirmDialogSubmit}
        submitLabel={confirmDialog.submitLabel}
        onClose={intents.onCloseConfirmDialog}
        isLoading={shiftForm.isConfirming}
        isSubmitDisabled={viewModel.isReadOnly || shiftForm.isConfirming}
      >
        <ConfirmShiftContent
          staffCount={confirmDialog.staffCount}
          periodLabel={viewModel.periodLabel}
          warnings={confirmDialog.warnings}
          isResend={viewModel.isConfirmed}
        />
      </Dialog>

      <Dialog
        title="未提出のスタッフ"
        isOpen={unsubmittedDialog.isOpen}
        onOpenChange={intents.onUnsubmittedDialogOpenChange}
        onClose={intents.onCloseUnsubmittedDialog}
        closeLabel="閉じる"
        mobileFullScreen
        maxW={{ md: "560px" }}
        maxH={{ md: "85dvh" }}
      >
        <RemindUnsubmittedContent unsubmittedNames={unsubmittedDialog.names} deadline={unsubmittedDialog.deadline} />
      </Dialog>

      <UnsavedChangesDialog
        isOpen={unsavedChangesDialog.isOpen}
        onStay={intents.onStay}
        onLeaveWithoutSaving={intents.onLeaveWithoutSaving}
        onSaveAndLeave={intents.onSaveAndLeave}
        isSaving={unsavedChangesDialog.isSaving}
      />
    </Flex>
  );
};
