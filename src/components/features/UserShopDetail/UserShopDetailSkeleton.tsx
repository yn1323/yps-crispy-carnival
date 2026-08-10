import { Box, Flex, HStack, Skeleton, Stack } from "@chakra-ui/react";
import { DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";
import { UserShopDetailPageSection } from "./UserShopDetailPageSection";
import { UserShopNotificationSkeleton } from "./UserShopNotificationSection";

export function UserShopDetailSkeleton() {
  return (
    <Stack gap={{ base: 4, md: 6 }} aria-label="店舗別設定を読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "236px", md: "360px" }} />

      <UserShopDetailPageSection>
        <LineSectionSkeleton />
      </UserShopDetailPageSection>

      <UserShopDetailPageSection>
        <Stack gap={6}>
          <Skeleton h="24px" w="48px" />
          <UserShopNotificationSkeleton />
        </Stack>
      </UserShopDetailPageSection>

      <UserShopDetailPageSection>
        <SettingsSectionSkeleton />
      </UserShopDetailPageSection>
    </Stack>
  );
}

function LineSectionSkeleton() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Skeleton h="24px" w="80px" />
          <Stack gap={1}>
            <Skeleton h="18px" w="300px" maxW="88%" />
            <Skeleton h="18px" w="340px" maxW="96%" />
          </Stack>
        </Stack>

        <Box borderWidth="1px" borderColor="border.default" bg="blackAlpha.50" borderRadius="md" p={3}>
          <HStack gap={2}>
            <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
            <Skeleton h="24px" w="88px" />
          </HStack>
        </Box>
      </Stack>

      <Stack gap={6}>
        <LineConnectionMethodSkeleton titleWidth="176px" actionWidth="192px" />
        <LineConnectionMethodSkeleton titleWidth="232px" actionWidth="248px" />
      </Stack>
    </Stack>
  );
}

function LineConnectionMethodSkeleton({ titleWidth, actionWidth }: { titleWidth: string; actionWidth: string }) {
  return (
    <Stack gap={3}>
      <Skeleton h="20px" w={titleWidth} maxW="90%" />
      <Flex justify="flex-end">
        <Skeleton h="40px" w={actionWidth} maxW="100%" borderRadius="md" />
      </Flex>
    </Stack>
  );
}

function SettingsSectionSkeleton() {
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Flex align="center" justify="space-between" gap={4}>
          <Skeleton h="24px" w="264px" maxW="calc(100% - 60px)" />
          <Skeleton h="24px" w="44px" borderRadius="full" flexShrink={0} />
        </Flex>
        <Stack gap={1}>
          <Skeleton h="18px" w="full" />
          <Skeleton display={{ base: "block", md: "none" }} h="18px" w="88%" />
          <Skeleton h="18px" w="184px" maxW="72%" />
          <Skeleton h="18px" w="232px" maxW="80%" ms={5} />
          <Skeleton h="18px" w="272px" maxW="88%" ms={5} />
        </Stack>
      </Stack>

      <DeletionActionSectionSkeleton titleWidth="224px" descriptionLines={2} actionWidth="104px" />
    </Stack>
  );
}
