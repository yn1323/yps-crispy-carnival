import { Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { ShopDetailData } from "./types";

type Props = {
  shop: ShopDetailData;
  onRequestDelete: () => void;
};

export function ShopOtherSettingsSection({ shop, onRequestDelete }: Props) {
  const disabledReasonId = shop.deleteDisabledReason ? `shop-detail-${shop.id}-delete-disabled-reason` : undefined;

  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-other-settings-heading">
      <Text
        id="shop-detail-other-settings-heading"
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        その他設定
      </Text>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Box p={{ base: 4, md: 5 }}>
          <Stack gap={4}>
            <Stack gap={1}>
              <Heading as="h3" fontSize="md" fontWeight="semibold" color="red.700">
                店舗を削除する
              </Heading>
              <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                この店舗を利用できない状態にします。この操作は元に戻せません。
              </Text>
            </Stack>
            <Stack gap={2} align="flex-end">
              <Flex justify="flex-end">
                <Button
                  colorPalette="red"
                  variant="solid"
                  gap={1.5}
                  disabled={!shop.canDelete}
                  aria-describedby={disabledReasonId}
                  onClick={onRequestDelete}
                >
                  <LuTrash2 aria-hidden />
                  削除
                </Button>
              </Flex>
              {shop.deleteDisabledReason && (
                <Text id={disabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
                  {shop.deleteDisabledReason}
                </Text>
              )}
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Stack>
  );
}
