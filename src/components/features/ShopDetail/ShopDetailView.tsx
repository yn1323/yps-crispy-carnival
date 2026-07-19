import { Box, Flex, Heading, HStack, Skeleton, Stack, Tabs, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronLeft, LuStore } from "react-icons/lu";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { IconButton } from "@/src/components/ui/Button";
import { ShopDeletionDialog } from "./ShopDeletionDialog";
import type { ShopDetailData, ShopDetailTab } from "./types";

type Props = {
  shop: ShopDetailData;
  activeTab: ShopDetailTab;
  isDeleting: boolean;
  onBack: () => void;
  onTabChange: (tab: ShopDetailTab) => void;
  onDelete: () => Promise<boolean>;
};

export function ShopDetailView({ shop, activeTab, isDeleting, onBack, onTabChange, onDelete }: Props) {
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

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Tabs.Root
          value={activeTab}
          colorPalette="teal"
          variant="outline"
          onValueChange={({ value }) => onTabChange(value as ShopDetailTab)}
        >
          <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" px={{ base: 3, md: 5 }}>
            <Tabs.Trigger value="information" flexShrink={0}>
              情報
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" flexShrink={0}>
              設定
            </Tabs.Trigger>
          </Tabs.List>

          <Box p={{ base: 4, md: 6 }}>
            <Tabs.Content value="information" p={0}>
              <ShopInformation shop={shop} />
            </Tabs.Content>
            <Tabs.Content value="settings" p={0}>
              <DeletionActionSection
                title="店舗を削除する"
                description="この店舗を利用できない状態にします。この操作は元に戻せません。"
                descriptionId={`shop-detail-${shop.id}-delete-description`}
                actionLabel="削除"
                canDelete={shop.canDelete}
                disabledReason={shop.deleteDisabledReason}
                disabledReasonId={`shop-detail-${shop.id}-delete-disabled-reason`}
                onDelete={() => setIsDeleteConfirmationOpen(true)}
              />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Box>

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

function ShopInformation({ shop }: { shop: ShopDetailData }) {
  return (
    <Stack gap={4}>
      <Heading as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
        店舗情報
      </Heading>
      <HStack
        justify="space-between"
        align="flex-start"
        gap={4}
        py={2}
        borderBottomWidth="1px"
        borderColor="blackAlpha.100"
      >
        <Text fontSize="sm" color="fg.muted">
          所属スタッフ
        </Text>
        <Text fontSize="sm" fontWeight="semibold" textAlign="end">
          {shop.staffCount}名
        </Text>
      </HStack>
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
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <HStack gap={3}>
          <Skeleton boxSize="52px" borderRadius="lg" />
          <Skeleton h="28px" w="220px" />
        </HStack>
      </Box>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 6 }}>
        <Stack gap={4}>
          <Skeleton h="36px" w="180px" />
          <Skeleton h="24px" w="full" />
        </Stack>
      </Box>
    </Stack>
  );
}
