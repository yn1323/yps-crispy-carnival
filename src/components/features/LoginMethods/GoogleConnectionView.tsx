import { Skeleton, Stack } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { MigrationFeedbackError, MigrationUnavailableState } from "./LoginMethodMigrationState";
import type { GoogleConnectionController } from "./useGoogleConnectionController";

export function GoogleConnectionView({ controller }: { controller: GoogleConnectionController }) {
  const { state } = controller;
  const busy = state.feedback.status === "loading";
  return (
    <Stack gap={5}>
      {state.phase !== "unavailable" ? <MigrationFeedbackError feedback={state.feedback} /> : null}
      {state.phase === "readyToConnect" ? (
        <Button
          alignSelf="flex-end"
          colorPalette="teal"
          size="lg"
          loading={busy}
          loadingText="確認中"
          onClick={() => {
            void controller.start();
          }}
        >
          Googleアカウントを選ぶ
        </Button>
      ) : null}
      {state.phase === "redirecting" || state.phase === "settling" ? <GoogleConnectionSkeleton /> : null}
      {state.phase === "unavailable" ? (
        <MigrationUnavailableState
          message={state.feedback.message ?? "Googleログインは現在追加できません。"}
          onRetry={controller.start}
        />
      ) : null}
    </Stack>
  );
}

function GoogleConnectionSkeleton() {
  return (
    <Stack align="flex-end" aria-label="Googleログイン画面を読み込み中">
      <Skeleton h="48px" w="224px" borderRadius="md" />
    </Stack>
  );
}
