import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";

type Props = {
  terminationPending: boolean;
  onStartPaidPlan: () => void;
};

const TERMINATION_PENDING_DESCRIPTION = "支払い処理を終了しています。完了後に有料プランを契約できます。";

export function OrganizationPaymentFailureAlert({ terminationPending, onStartPaidPlan }: Props) {
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
              {terminationPending && (
                <Text id="organization-payment-failure-termination-pending">{TERMINATION_PENDING_DESCRIPTION}</Text>
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
          disabled={terminationPending}
          aria-describedby={terminationPending ? "organization-payment-failure-termination-pending" : undefined}
        >
          有料プランを契約する
        </Button>
      </Flex>
    </Alert.Root>
  );
}
