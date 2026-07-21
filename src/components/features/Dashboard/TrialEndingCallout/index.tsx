import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@/src/components/ui/Button";
import type { TrialEndingNoticeData } from "./script";
import { useTrialEndingCallout } from "./useTrialEndingCallout";

type Props = {
  notice: TrialEndingNoticeData | null;
  shopId: string;
};

export function TrialEndingCallout({ notice, shopId }: Props) {
  const noticeKey = notice ? `${notice.visibleFrom}:${notice.trialEndsAt}` : "none";
  return <TrialEndingCalloutController key={noticeKey} notice={notice} shopId={shopId} />;
}

function TrialEndingCalloutController({ notice, shopId }: Props) {
  const viewModel = useTrialEndingCallout(notice);
  if (!viewModel) return null;

  return <TrialEndingCalloutView finalDateLabel={viewModel.finalDateLabel} shopId={shopId} />;
}

export function TrialEndingCalloutView({ finalDateLabel, shopId }: { finalDateLabel: string; shopId: string }) {
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
            <Text>{finalDateLabel}にトライアルが終了となります。</Text>
            <Text>終了後は、利用人数5名・店舗数1まで制限されます。</Text>
            <Text>継続利用はする場合、Proプランへの加入が必要です。</Text>
          </Stack>
          <Button
            asChild
            colorPalette="teal"
            flexShrink={0}
            alignSelf={{ base: "stretch", md: "center" }}
            ms={{ base: 0, md: "auto" }}
          >
            <RouterLink to="/settings" search={{ shop: shopId, tab: "billing" }}>
              支払いに移動
            </RouterLink>
          </Button>
        </Flex>
      </Alert.Content>
    </Alert.Root>
  );
}

export type { TrialEndingNoticeData } from "./script";
