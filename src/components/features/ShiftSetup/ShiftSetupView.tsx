import { HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuSlidersHorizontal, LuStore } from "react-icons/lu";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";
import { AssistDialog } from "./AssistDialog";
import { BreakRuleSection } from "./BreakRuleSection";
import { DayTemplatesSection } from "./DayTemplatesSection";
import { LeaveConfirmationDialog, PENDING_BAR_BOTTOM_PX, PendingChangesBar } from "./PendingChanges";
import { PositionsSection } from "./PositionsSection";
import { StaffProfilesSection } from "./StaffProfilesSection";
import { getShiftSetupReadOnlyReason } from "./script";
import type { LeaveDialogState, ShiftSetupEditorView } from "./types";

type Props = ShiftSetupEditorView & {
  leaveDialog: LeaveDialogState;
  onBack: () => void;
};

export function ShiftSetupView({
  setup,
  canWrite,
  dayTemplates,
  staffProfiles,
  pendingSections,
  isSaving,
  positionsDialog,
  breakRuleDialog,
  assistDialog,
  leaveDialog,
  intents,
  onBack,
}: Props) {
  const [pendingBarHeight, setPendingBarHeight] = useState(0);
  // 保存の操作バーが出ている間は、「できあがる必要人数」をその上に積む。
  const requiredCountBottomOffset = pendingBarHeight > 0 ? pendingBarHeight + PENDING_BAR_BOTTOM_PX : 0;

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <Stack gap={0}>
        <DetailPageHeader title="シフト作成の設定" onBack={onBack} icon={LuSlidersHorizontal} />
        <HStack gap={1.5} color="fg.muted" fontSize="sm" minW={0}>
          <LuStore aria-hidden />
          <Text truncate minW={0}>
            {setup.shopName}
          </Text>
        </HStack>
      </Stack>

      {!canWrite && (
        <ReadOnlyNotice
          title="シフト作成の設定は閲覧のみです"
          description={getShiftSetupReadOnlyReason(setup.businessWriteBlockReason)}
        />
      )}

      <PositionsSection
        positions={setup.positions}
        canWrite={canWrite}
        dialog={positionsDialog}
        onSave={intents.onSavePositions}
      />
      <DayTemplatesSection
        setup={setup}
        canWrite={canWrite}
        dayTemplates={dayTemplates}
        intents={intents}
        onOpenAssist={assistDialog.open}
        requiredCountBottomOffset={requiredCountBottomOffset}
      />
      <BreakRuleSection
        breakRule={setup.breakRule}
        patternKind={setup.submissionPattern.kind}
        canWrite={canWrite}
        dialog={breakRuleDialog}
        onSave={intents.onSaveBreakRule}
      />
      <StaffProfilesSection
        staffs={setup.staffs}
        positions={setup.positions}
        profiles={staffProfiles}
        canWrite={canWrite}
        intents={intents}
      />

      <PendingChangesBar
        sections={pendingSections}
        isSaving={isSaving}
        onReset={intents.onResetChanges}
        onSave={intents.onSaveChanges}
        onHeightChange={setPendingBarHeight}
      />

      <AssistDialog
        dialog={{ ...assistDialog, isOpen: assistDialog.isOpen && canWrite }}
        hasTemplates={dayTemplates.drafts.length > 0}
        onRequest={intents.onRequestAssist}
      />
      <LeaveConfirmationDialog dialog={leaveDialog} sections={pendingSections} />
    </Stack>
  );
}

export function ShiftSetupSkeleton() {
  return <ShiftoriLoading variant="section" message="Loading..." minH="full" />;
}
