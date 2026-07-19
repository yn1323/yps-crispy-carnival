import { Alert, Box, Flex, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronLeft, LuStore } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { ShopBasicInformationSection } from "./ShopBasicInformationSection";
import { ShopDeletionDialog } from "./ShopDeletionDialog";
import { ShopOtherSettingsSection } from "./ShopOtherSettingsSection";
import { ShopStaffList } from "./ShopStaffList";
import type { ShopDetailData, ShopDetailPerson, ShopSettingKind, UpdateShopSetting } from "./types";

type Props = {
  shop: ShopDetailData;
  staffs: ShopDetailPerson[];
  updatingSetting: ShopSettingKind | null;
  isDeleting: boolean;
  onBack: () => void;
  onOpenUser: (personId: string) => void;
  onUpdateSetting: UpdateShopSetting;
  onDelete: () => Promise<boolean>;
};

export function ShopDetailView({
  shop,
  staffs,
  updatingSetting,
  isDeleting,
  onBack,
  onOpenUser,
  onUpdateSetting,
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

      <ShopSummary shop={shop} />

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

      <ShopBasicInformationSection shop={shop} updatingSetting={updatingSetting} onUpdateSetting={onUpdateSetting} />
      <ShopStaffList staffs={staffs} onOpenUser={onOpenUser} />
      <ShopOtherSettingsSection shop={shop} onRequestDelete={() => setIsDeleteConfirmationOpen(true)} />

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

function ShopSummary({ shop }: { shop: ShopDetailData }) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <HStack gap={3} minW={0}>
        <Flex
          boxSize="52px"
          borderRadius="lg"
          bg="teal.50"
          color="teal.700"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <LuStore size={24} aria-hidden />
        </Flex>
        <Text fontSize={{ base: "lg", md: "xl" }} fontWeight="semibold" color="gray.900" truncate flex={1} minW={0}>
          {shop.name}
        </Text>
      </HStack>
    </Box>
  );
}

export function ShopDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="店舗詳細を読み込み中">
      <HStack gap={2}>
        <Skeleton boxSize="32px" borderRadius="md" />
        <Skeleton h="32px" w="120px" />
      </HStack>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <HStack gap={3}>
          <Skeleton boxSize="52px" borderRadius="lg" />
          <Skeleton h="28px" w="220px" />
        </HStack>
      </Box>
      {[3, 2, 1].map((rowCount) => (
        <Stack key={rowCount} gap={3}>
          <Skeleton h="28px" w="160px" />
          <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {Array.from({ length: rowCount }, (_, index) => (
                <Box key={index} p={{ base: 4, md: 5 }}>
                  <Stack gap={4}>
                    <Skeleton h="20px" w="120px" />
                    <Skeleton h="40px" w="full" />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
