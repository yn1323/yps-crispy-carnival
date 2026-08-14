import { Box, Flex, Grid, HStack, Skeleton, Stack } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuStore } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { DetailPageHeader, DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { ShopBasicInformationSection } from "./ShopBasicInformationSection";
import { ShopDeletionDialog } from "./ShopDeletionDialog";
import { ShopOtherSettingsSection } from "./ShopOtherSettingsSection";
import { ShopStaffList } from "./ShopStaffList";
import { ConnectedShopStaffMembershipDialog, ShopStaffMembershipDialogError } from "./ShopStaffMembershipDialog";
import type { ShopDetailData, ShopDetailPerson } from "./types";

type SettingsDialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  open: () => void;
  close: () => void;
  isUpdating: boolean;
};

type Props = {
  shop: ShopDetailData;
  organizationSettingsShopId: string;
  staffs: ShopDetailPerson[];
  settingsDialog: SettingsDialogState;
  isDeleting: boolean;
  onBack: () => void;
  onOpenUser: (personId: string) => void;
  onUpdateSettings: (data: ShopFormData) => void | Promise<void>;
  onDelete: () => Promise<boolean>;
  expectedOrganizationId?: Id<"organizations">;
};

export function ShopDetailView({
  shop,
  organizationSettingsShopId,
  staffs,
  settingsDialog,
  isDeleting,
  onBack,
  onOpenUser,
  onUpdateSettings,
  onDelete,
  expectedOrganizationId,
}: Props) {
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isStaffMembershipDialogOpen, setIsStaffMembershipDialogOpen] = useState(false);
  const staffMembershipTriggerRef = useRef<HTMLButtonElement>(null);

  const closeStaffMembershipDialog = useCallback(() => {
    setIsStaffMembershipDialogOpen(false);
    const focusTrigger = () => staffMembershipTriggerRef.current?.focus();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focusTrigger);
    else focusTrigger();
  }, []);

  useEffect(() => {
    if (!shop.canDelete) setIsDeleteConfirmationOpen(false);
  }, [shop.canDelete]);

  useEffect(() => {
    if (!shop.canUpdateSettings) setIsStaffMembershipDialogOpen(false);
  }, [shop.canUpdateSettings]);

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader title={shop.name} onBack={onBack} icon={LuStore} />

      {!shop.canUpdateSettings && (
        <ReadOnlyNotice
          title="店舗情報は閲覧のみです"
          description={shop.settingsDisabledReason ?? "現在、この店舗の情報を変更できません。"}
        />
      )}

      <ShopBasicInformationSection shop={shop} onEdit={settingsDialog.open} />
      <ShopStaffList
        staffs={staffs}
        canChangeStaffs={shop.canUpdateSettings}
        managerNotificationRecipientStatus={shop.managerNotificationRecipientStatus}
        changeButtonRef={staffMembershipTriggerRef}
        onOpenUser={onOpenUser}
        onChangeStaffs={() => setIsStaffMembershipDialogOpen(true)}
      />
      <ShopOtherSettingsSection
        shop={shop}
        organizationSettingsShopId={organizationSettingsShopId}
        appOrganizationId={expectedOrganizationId}
        onRequestDelete={() => setIsDeleteConfirmationOpen(true)}
      />

      {isStaffMembershipDialogOpen && (
        <ErrorBoundary
          fallback={
            <ShopStaffMembershipDialogError
              isOpen
              onOpenChange={({ open }) => {
                if (!open) closeStaffMembershipDialog();
              }}
              onClose={closeStaffMembershipDialog}
            />
          }
        >
          <ConnectedShopStaffMembershipDialog
            shop={shop}
            expectedOrganizationId={expectedOrganizationId}
            isOpen
            onOpenChange={({ open }) => {
              if (!open) closeStaffMembershipDialog();
            }}
            onClose={closeStaffMembershipDialog}
          />
        </ErrorBoundary>
      )}

      <StepperDialog
        title="店舗設定"
        isOpen={settingsDialog.isOpen && shop.canUpdateSettings}
        onOpenChange={settingsDialog.onOpenChange}
        onClose={settingsDialog.close}
        preventClose={settingsDialog.isUpdating}
      >
        <ShopForm
          key={settingsDialog.isOpen ? `${shop.id}-settings-open` : `${shop.id}-settings-closed`}
          defaultValues={{
            shopName: shop.name,
            regularClosedDays: shop.regularClosedDays,
            submissionPattern: shop.submissionPattern,
          }}
          onSubmit={onUpdateSettings}
          onCancel={settingsDialog.close}
        />
      </StepperDialog>

      <ShopDeletionDialog
        shop={shop}
        isOpen={isDeleteConfirmationOpen}
        isDeleting={isDeleting}
        onClose={() => setIsDeleteConfirmationOpen(false)}
        onDelete={onDelete}
      />
    </Stack>
  );
}

export function ShopDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="店舗詳細を読み込み中">
      <DetailPageHeaderSkeleton titleWidth={{ base: "184px", md: "300px" }} />
      <ShopBasicInformationSkeleton />
      <ShopStaffListSkeleton />
      <ShopOtherSettingsSkeleton />
    </Stack>
  );
}

function ShopBasicInformationSkeleton() {
  return (
    <Stack gap={3}>
      <Flex align="center" justify="space-between" gap={3}>
        <SectionTitleSkeleton width="96px" />
        <Skeleton h="36px" w="96px" borderRadius="md" flexShrink={0} />
      </Flex>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {Array.from({ length: 4 }, (_, index) => (
            <Grid
              key={index}
              templateColumns={{ base: "minmax(0, 9rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
              gap={{ base: 3, md: 5 }}
              alignItems="start"
              px={{ base: 4, md: 5 }}
              py={{ base: 3.5, md: 4 }}
            >
              <Skeleton h="20px" w={index === 2 ? "64px" : "80px"} maxW="100%" />
              <Skeleton h="20px" w={index === 0 ? "72%" : "56%"} />
            </Grid>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

function ShopStaffListSkeleton() {
  return (
    <Stack gap={3}>
      <Flex align="center" justify="space-between" gap={3}>
        <SectionTitleSkeleton width="96px" />
        <Skeleton h="36px" w={{ base: "156px", md: "184px" }} borderRadius="md" flexShrink={0} />
      </Flex>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" justify="space-between" gap={3} px={{ base: 4, md: 5 }} py={3} minH="48px">
          <HStack gap={{ base: 4, md: 8 }} minW={0}>
            <Skeleton h="20px" w="72px" />
            <Skeleton h="20px" w="40px" />
          </HStack>
          <HStack gap={1} flexShrink={0}>
            <Skeleton h="20px" w={{ base: "104px", md: "128px" }} />
            <Skeleton boxSize={5} borderRadius="sm" />
          </HStack>
        </Flex>
      </Box>
    </Stack>
  );
}

function ShopOtherSettingsSkeleton() {
  return (
    <Stack gap={3}>
      <SectionTitleSkeleton width="120px" />
      <DeletionActionSectionSkeleton titleWidth="120px" />
    </Stack>
  );
}

function SectionTitleSkeleton({ width }: { width: string }) {
  return <Skeleton h={{ base: "28px", lg: "30px" }} w={width} />;
}
