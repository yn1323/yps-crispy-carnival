import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@/src/components/ui/Button";
import type { TrialEndingNoticeData } from "./script";
import { useTrialEndingCallout } from "./useTrialEndingCallout";

type Props = {
  notice: TrialEndingNoticeData | null;
  shopId: string;
  isBillingVisible: boolean;
  onOpenBillingSettings?: () => void;
};

export function TrialEndingCallout({ notice, shopId, isBillingVisible, onOpenBillingSettings }: Props) {
  if (!isBillingVisible) return null;

  const noticeKey = notice ? `${notice.visibleFrom}:${notice.trialEndsAt}` : "none";
  return (
    <TrialEndingCalloutController
      key={noticeKey}
      notice={notice}
      shopId={shopId}
      isBillingVisible
      onOpenBillingSettings={onOpenBillingSettings}
    />
  );
}

function TrialEndingCalloutController({ notice, shopId, onOpenBillingSettings }: Props) {
  const viewModel = useTrialEndingCallout(notice);
  if (!viewModel) return null;

  return (
    <TrialEndingCalloutView
      finalDateLabel={viewModel.finalDateLabel}
      shopId={shopId}
      isBillingVisible
      onOpenBillingSettings={onOpenBillingSettings}
    />
  );
}

export function TrialEndingCalloutView({
  finalDateLabel,
  shopId,
  isBillingVisible,
  onOpenBillingSettings,
}: {
  finalDateLabel: string;
  shopId: string;
  isBillingVisible: boolean;
  onOpenBillingSettings?: () => void;
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
            <Text>未契約のまま終了すると利用停止になりますが、組織のデータは削除されません。</Text>
            <Text>継続して利用するには、ProまたはBusinessを選択してください。</Text>
          </Stack>
          {onOpenBillingSettings ? (
            <Button
              type="button"
              colorPalette="teal"
              flexShrink={0}
              alignSelf={{ base: "stretch", md: "center" }}
              ms={{ base: 0, md: "auto" }}
              onClick={onOpenBillingSettings}
            >
              プランと支払いを見る
            </Button>
          ) : (
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
          )}
        </Flex>
      </Alert.Content>
    </Alert.Root>
  );
}

export type { TrialEndingNoticeData } from "./script";
