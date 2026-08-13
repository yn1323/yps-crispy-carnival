import { Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import type { ShopDetailData } from "./types";

type Props = {
  shop: ShopDetailData;
  organizationSettingsShopId: string;
  onRequestDelete: () => void;
};

export function ShopOtherSettingsSection({ shop, organizationSettingsShopId, onRequestDelete }: Props) {
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
      <DeletionActionSection
        title="店舗を削除する"
        headingAs="h3"
        description={
          <>
            店舗とシフトを削除します。
            <br />
            スタッフは削除されずに残るため、別店舗への付け替えが可能です。
            <br />
            登録情報をすべて削除したい場合は
            <Link asChild color="teal.700" fontWeight="semibold" textDecoration="underline" textUnderlineOffset="3px">
              <RouterLink
                to="/settings"
                search={{ shop: organizationSettingsShopId, tab: "settings" }}
                aria-label="こちら（組織設定の設定タブを開く）"
              >
                こちら
              </RouterLink>
            </Link>
          </>
        }
        descriptionFontSize="xs"
        actionLabel="削除する"
        actionVariant="solid"
        canDelete={shop.canDelete}
        disabledReason={shop.deleteDisabledReason}
        disabledReasonId={disabledReasonId}
        onDelete={onRequestDelete}
      />
    </Stack>
  );
}
