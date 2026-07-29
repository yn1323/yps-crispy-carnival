import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@/src/components/ui/Button";
import type { TrialEndingNoticeData } from "./script";
import { useTrialEndingCallout } from "./useTrialEndingCallout";

type Props = {
  notice: TrialEndingNoticeData | null;
  shopId: string;
  isBillingVisible: boolean;
};

export function TrialEndingCallout({ notice, shopId, isBillingVisible }: Props) {
  if (!isBillingVisible) return null;

  const noticeKey = notice ? `${notice.visibleFrom}:${notice.trialEndsAt}` : "none";
  return <TrialEndingCalloutController key={noticeKey} notice={notice} shopId={shopId} isBillingVisible />;
}

function TrialEndingCalloutController({ notice, shopId }: Props) {
  const viewModel = useTrialEndingCallout(notice);
  if (!viewModel) return null;

  return <TrialEndingCalloutView finalDateLabel={viewModel.finalDateLabel} shopId={shopId} isBillingVisible />;
}

export function TrialEndingCalloutView({
  finalDateLabel,
  shopId,
  isBillingVisible,
}: {
  finalDateLabel: string;
  shopId: string;
  isBillingVisible: boolean;
}) {
  if (!isBillingVisible) return null;

  return (
    <Alert.Root
      as="section"
      aria-label="トライアル終了前の支払い案内"
      status="warning"
      borderRadius="xl"
      alignItems="flex-start"
    >
      <Alert.Indicator mt={1} />
      <Alert.Content flex={1} minW={0}>
        <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={4}>
          <Stack gap={1} flex={1}>
            <Text>{finalDateLabel}にトライアルが終了します。</Text>
            <Text>終了後は、利用人数が5名まで、店舗数が1店舗までに制限されます。</Text>
            <Text>現在の利用人数・店舗数を維持するには、Proプランへの変更が必要です。</Text>
          </Stack>
          <Button
            asChild
            colorPalette="teal"
            flexShrink={0}
            alignSelf={{ base: "stretch", md: "center" }}
            ms={{ base: 0, md: "auto" }}
          >
            <RouterLink to="/settings" search={{ shop: shopId, tab: "billing" }}>
              プランと支払いを見る
            </RouterLink>
          </Button>
        </Flex>
      </Alert.Content>
    </Alert.Root>
  );
}

export type { TrialEndingNoticeData } from "./script";
