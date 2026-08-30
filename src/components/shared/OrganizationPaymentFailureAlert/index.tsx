import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";

type Props = {
  canStartPaidPlan: boolean;
  terminationPending: boolean;
  startPaidPlanDisabledReason?: string;
  onStartPaidPlan: () => void;
};

const TERMINATION_PENDING_DESCRIPTION = "支払い処理を終了しています。完了後に有料プランを契約できます。";
const PLAN_MANAGEMENT_UNAVAILABLE_DESCRIPTION =
  "現在は有料プランを契約できません。時間をおいて、もう一度お試しください。";
const ACTION_DISABLED_DESCRIPTION_ID = "organization-payment-failure-action-disabled";

export function OrganizationPaymentFailureAlert({
  canStartPaidPlan,
  terminationPending,
  startPaidPlanDisabledReason,
  onStartPaidPlan,
}: Props) {
  const actionDisabled = terminationPending || !canStartPaidPlan;
  const actionDisabledDescription = terminationPending
    ? TERMINATION_PENDING_DESCRIPTION
    : canStartPaidPlan
      ? undefined
      : (startPaidPlanDisabledReason ?? PLAN_MANAGEMENT_UNAVAILABLE_DESCRIPTION);

  return (
    <Alert.Root status="warning" borderWidth="1px" borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Flex flex={1} minW={0} gap={3} direction={{ base: "column", md: "row" }} align={{ md: "center" }}>
        <Alert.Content>
          <Alert.Title>支払いを確認できなかったため、Freeプランへ変更されました</Alert.Title>
          <Alert.Description>
            <Stack gap={1.5}>
              <Text>
                請求通知先メールアドレスにStripeから案内が届いている場合があります。
                <br />
                支払い方法を確認して、もう一度希望のプランの支払いをしてください。
              </Text>
              {actionDisabledDescription && (
                <Text id={ACTION_DISABLED_DESCRIPTION_ID}>{actionDisabledDescription}</Text>
              )}
            </Stack>
          </Alert.Description>
        </Alert.Content>

        <Button
          type="button"
          size="sm"
          variant="outline"
          colorPalette="orange"
          flexShrink={0}
          w={{ base: "full", md: "auto" }}
          minH={{ base: "44px", md: "36px" }}
          onClick={onStartPaidPlan}
          disabled={actionDisabled}
          aria-describedby={actionDisabledDescription ? ACTION_DISABLED_DESCRIPTION_ID : undefined}
        >
          有料プランを契約する
        </Button>
      </Flex>
    </Alert.Root>
  );
}
