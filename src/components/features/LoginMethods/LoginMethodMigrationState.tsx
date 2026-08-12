import { Alert } from "@chakra-ui/react";
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
