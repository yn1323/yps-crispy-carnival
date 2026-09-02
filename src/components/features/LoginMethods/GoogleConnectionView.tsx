import { Alert, Skeleton, Stack, Text } from "@chakra-ui/react";
import { MigrationFeedbackError } from "./LoginMethodMigrationState";
import type { GoogleConnectionController } from "./useGoogleConnectionController";

export function GoogleConnectionView({ controller }: { controller: GoogleConnectionController }) {
  const { state } = controller;
  return (
    <Stack gap={5}>
      {state.phase === "readyToConnect" && state.feedback.status !== "error" ? (
        <Text color="fg.muted">下記ボタンからGoogleアカウントを選んでください。</Text>
      ) : null}
      {state.phase !== "unavailable" ? <MigrationFeedbackError feedback={state.feedback} /> : null}
      {state.phase === "redirecting" || state.phase === "settling" ? <GoogleConnectionSkeleton /> : null}
      {state.phase === "unavailable" ? (
        <Alert.Root status="error" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>{state.feedback.message ?? "Googleログインは現在追加できません。"}</Alert.Description>
        </Alert.Root>
      ) : null}
    </Stack>
  );
}

function GoogleConnectionSkeleton() {
  return (
    <Stack aria-label="Googleログイン画面を読み込み中">
      <Skeleton h="16px" w="280px" maxW="full" borderRadius="md" />
    </Stack>
  );
}
