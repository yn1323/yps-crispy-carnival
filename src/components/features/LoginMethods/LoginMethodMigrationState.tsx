import { Alert, Stack } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import type { LoginMethodMigrationFeedback } from "./migrationTypes";

export function MigrationFeedbackError({ feedback }: { feedback: LoginMethodMigrationFeedback }) {
  if (feedback.status !== "error" || !feedback.message) return null;
  return (
    <Alert.Root status="error" role="alert" aria-live="assertive" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description whiteSpace="pre-line">{feedback.message}</Alert.Description>
    </Alert.Root>
  );
}

export function MigrationUnavailableState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<boolean | undefined>;
}) {
  return (
    <Stack gap={4}>
      <Alert.Root status="error" borderRadius="lg">
        <Alert.Indicator />
        <Alert.Description>{message}</Alert.Description>
      </Alert.Root>
      <Button
        variant="outline"
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        onClick={() => {
          void onRetry();
        }}
      >
        もう一度試す
      </Button>
    </Stack>
  );
}
