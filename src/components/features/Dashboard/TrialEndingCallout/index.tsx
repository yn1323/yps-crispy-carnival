import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { TrialEndingNoticeData } from "./script";
import { useTrialEndingCallout } from "./useTrialEndingCallout";

type Props = {
  notice: TrialEndingNoticeData | null;
  onOpenBillingSettings: () => void;
};

export function TrialEndingCallout({ notice, onOpenBillingSettings }: Props) {
  const noticeKey = notice ? `${notice.visibleFrom}:${notice.trialEndsAt}` : "none";
  return <TrialEndingCalloutController key={noticeKey} notice={notice} onOpenBillingSettings={onOpenBillingSettings} />;
}

function TrialEndingCalloutController({ notice, onOpenBillingSettings }: Props) {
  const viewModel = useTrialEndingCallout(notice);
  if (!viewModel) return null;

  return (
    <TrialEndingCalloutView finalDateLabel={viewModel.finalDateLabel} onOpenBillingSettings={onOpenBillingSettings} />
  );
}

export function TrialEndingCalloutView({
  finalDateLabel,
  onOpenBillingSettings,
}: {
  finalDateLabel: string;
  onOpenBillingSettings: () => void;
}) {
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
        </Flex>
      </Alert.Content>
    </Alert.Root>
  );
}

export type { TrialEndingNoticeData } from "./script";
