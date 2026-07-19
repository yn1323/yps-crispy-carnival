import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { ShopNameSettingForm } from "./ShopNameSettingForm";
import { ShopRegularClosedDaysSettingForm } from "./ShopRegularClosedDaysSettingForm";
import { ShopSubmissionPatternSettingForm } from "./ShopSubmissionPatternSettingForm";
import type { ShopDetailData, ShopSettingKind, UpdateShopSetting } from "./types";

type Props = {
  shop: ShopDetailData;
  updatingSetting: ShopSettingKind | null;
  onUpdateSetting: UpdateShopSetting;
};

export function ShopBasicInformationSection({ shop, updatingSetting, onUpdateSetting }: Props) {
  const isBusy = updatingSetting !== null;
  const shopNameHeadingId = `shop-detail-${shop.id}-name-heading`;
  const submissionPatternHeadingId = `shop-detail-${shop.id}-submission-pattern-heading`;
  const regularClosedDaysHeadingId = `shop-detail-${shop.id}-regular-closed-days-heading`;

  return (
    <Stack as="section" gap={3} aria-labelledby="shop-detail-basic-information-heading">
      <Text
        id="shop-detail-basic-information-heading"
        as="h2"
        fontSize={{ base: "lg", lg: "xl" }}
        lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
        fontWeight="bold"
        color="gray.900"
      >
        基本情報
      </Text>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          <Box p={{ base: 4, md: 5 }}>
            <Stack gap={5}>
              <Heading id={shopNameHeadingId} as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
                店舗名
              </Heading>
              <ShopNameSettingForm
                key={`${shop.id}:${shop.name}`}
                shopId={shop.id}
                shopName={shop.name}
                labelledBy={shopNameHeadingId}
                disabled={!shop.canUpdateSettings}
                isBusy={isBusy}
                isUpdating={updatingSetting === "shopName"}
                onUpdate={onUpdateSetting}
              />
            </Stack>
          </Box>

          <Box p={{ base: 4, md: 5 }}>
            <Stack gap={5}>
              <Heading id={submissionPatternHeadingId} as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
                希望シフトの集め方・勤務時間
              </Heading>
              <ShopSubmissionPatternSettingForm
                key={`${shop.id}:${JSON.stringify(shop.submissionPattern)}`}
                shopId={shop.id}
                submissionPattern={shop.submissionPattern}
                labelledBy={submissionPatternHeadingId}
                disabled={!shop.canUpdateSettings}
                isBusy={isBusy}
                isUpdating={updatingSetting === "submissionPattern"}
                onUpdate={onUpdateSetting}
              />
            </Stack>
          </Box>

          <Box p={{ base: 4, md: 5 }}>
            <Stack gap={5}>
              <Heading id={regularClosedDaysHeadingId} as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
                定休日
              </Heading>
              <ShopRegularClosedDaysSettingForm
                key={`${shop.id}:${shop.regularClosedDays.join(",")}`}
                shopId={shop.id}
                regularClosedDays={shop.regularClosedDays}
                labelledBy={regularClosedDaysHeadingId}
                disabled={!shop.canUpdateSettings}
                isBusy={isBusy}
                isUpdating={updatingSetting === "regularClosedDays"}
                onUpdate={onUpdateSetting}
              />
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
