import { Stack } from "@chakra-ui/react";
import type { ShopDetailData } from "./types";

type Props = {
  shop: ShopDetailData;
  onRequestDelete: () => void;
};

export function ShopOtherSettingsSection(_props: Props) {
  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-other-settings-heading">
      {/*<Text
        id="shop-detail-other-settings-heading"
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        その他設定
      </Text>
      <DeletionActionSection
        title="店舗を削除する"
        headingAs="h3"
        actionLabel="削除"
        actionVariant="solid"
        canDelete={shop.canDelete}
        disabledReason={shop.deleteDisabledReason}
        disabledReasonId={disabledReasonId}
        onDelete={onRequestDelete}
      />*/}
    </Stack>
  );
}
