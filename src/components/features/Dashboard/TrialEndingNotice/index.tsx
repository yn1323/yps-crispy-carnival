import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { TrialEndingNoticeData, TrialEndingNoticeViewModel } from "./script";
import { useTrialEndingNotice } from "./useTrialEndingNotice";

type Props = {
  notice: TrialEndingNoticeData | null;
  organizationId: string;
  onOpenBillingSettings: () => void;
};

/** 有料プランを継続登録していないTrialへ、終了14日前から段階的に終了後の影響と契約導線を示す。 */
export function TrialEndingNotice({ notice, organizationId, onOpenBillingSettings }: Props) {
  const noticeKey = notice ? `${organizationId}:${notice.trialEndsAt}` : "none";
  return (
    <TrialEndingNoticeController
      key={noticeKey}
      notice={notice}
      organizationId={organizationId}
      onOpenBillingSettings={onOpenBillingSettings}
    />
  );
}

function TrialEndingNoticeController({ notice, organizationId, onOpenBillingSettings }: Props) {
  const { viewModel, dismiss } = useTrialEndingNotice(notice, organizationId);
  if (!viewModel) return null;
  return (
    <TrialEndingNoticeView viewModel={viewModel} onOpenBillingSettings={onOpenBillingSettings} onDismiss={dismiss} />
  );
}

export function TrialEndingNoticeView({
  viewModel,
  onOpenBillingSettings,
  onDismiss,
}: {
  viewModel: TrialEndingNoticeViewModel;
  onOpenBillingSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <Alert.Root
      as="section"
      aria-label="無料トライアル終了の案内"
      status={viewModel.tone}
      borderWidth="1px"
      borderRadius="xl"
      alignItems="flex-start"
    >
      <Alert.Indicator mt={1} />
      <Flex flex={1} minW={0} gap={3} direction={{ base: "column", md: "row" }} align={{ md: "center" }}>
        <Alert.Content flex={1} minW={0}>
          <Alert.Title>{viewModel.title}</Alert.Title>
          <Alert.Description>
            <Stack gap={0.5}>
              {viewModel.descriptions.map((description) => (
                <Text key={description}>{description}</Text>
              ))}
            </Stack>
          </Alert.Description>
        </Alert.Content>
        <Flex gap={2} flexShrink={0} direction={{ base: "column", sm: "row" }} w={{ base: "full", md: "auto" }}>
          {viewModel.dismissible && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              colorPalette="gray"
              bg="white"
              minH={{ base: "44px", md: "36px" }}
              onClick={onDismiss}
            >
              後で確認する
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            colorPalette="teal"
            minH={{ base: "44px", md: "36px" }}
            onClick={onOpenBillingSettings}
          >
            プランを選ぶ
          </Button>
        </Flex>
      </Flex>
    </Alert.Root>
  );
}

export type { TrialEndingNoticeData } from "./script";
