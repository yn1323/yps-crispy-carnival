import { Alert, Box, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { IconButton } from "@/src/components/ui/Button";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { ShopBasicInformationSection } from "./ShopBasicInformationSection";
import { ShopDeletionDialog } from "./ShopDeletionDialog";
import { ShopOtherSettingsSection } from "./ShopOtherSettingsSection";
import { ShopStaffList } from "./ShopStaffList";
import type { ShopDetailData, ShopDetailPerson } from "./types";

type SettingsDialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  open: () => void;
  close: () => void;
};

type Props = {
  shop: ShopDetailData;
  staffs: ShopDetailPerson[];
  settingsDialog: SettingsDialogState;
  isDeleting: boolean;
  onBack: () => void;
  onOpenUser: (personId: string) => void;
  onUpdateSettings: (data: ShopFormData) => void | Promise<void>;
  onDelete: () => Promise<boolean>;
};

export function ShopDetailView({
  shop,
  staffs,
  settingsDialog,
  isDeleting,
  onBack,
  onOpenUser,
  onUpdateSettings,
  onDelete,
}: Props) {
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!shop.canDelete) setIsDeleteConfirmationOpen(false);
  }, [shop.canDelete]);

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <HStack gap={2} minW={0}>
        <IconButton aria-label="前の画面に戻る" variant="ghost" size="sm" onClick={onBack}>
          <LuChevronLeft aria-hidden />
        </IconButton>
        <Text as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
          店舗詳細
        </Text>
      </HStack>

      {!shop.canUpdateSettings && (
        <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
          <Alert.Indicator mt={1} />
          <Alert.Content>
            <Alert.Title>店舗情報は閲覧のみです</Alert.Title>
            <Alert.Description>
              {shop.settingsDisabledReason ?? "現在、この店舗の情報を変更できません。"}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <ShopBasicInformationSection shop={shop} onEdit={settingsDialog.open} />
      <ShopStaffList staffs={staffs} onOpenUser={onOpenUser} />
      <ShopOtherSettingsSection shop={shop} onRequestDelete={() => setIsDeleteConfirmationOpen(true)} />

      <StepperDialog
        title="店舗設定"
        isOpen={settingsDialog.isOpen && shop.canUpdateSettings}
        onOpenChange={settingsDialog.onOpenChange}
        onClose={settingsDialog.close}
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
      <HStack gap={2}>
        <Skeleton boxSize="32px" borderRadius="md" />
        <Skeleton h="32px" w="120px" />
      </HStack>
      {[4, 1, 1].map((rowCount, sectionIndex) => (
        <Stack key={`${sectionIndex}-${rowCount}`} gap={3}>
          <HStack justify="space-between">
            <Skeleton h="28px" w="160px" />
            {rowCount === 4 && <Skeleton h="32px" w="96px" borderRadius="md" />}
          </HStack>
          <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {Array.from({ length: rowCount }, (_, index) => (
                <Box key={index} p={{ base: 4, md: 5 }}>
                  <HStack gap={5}>
                    <Skeleton h="20px" w="120px" />
                    <Skeleton h="20px" flex={1} />
                  </HStack>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
