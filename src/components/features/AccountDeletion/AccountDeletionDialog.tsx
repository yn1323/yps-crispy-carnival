import { Alert, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { Dialog } from "@/src/components/ui/Dialog";
import type { AccountDeletionAction, AccountDeletionErrorState, AccountDeletionReadyPreview } from "./types";

type Props = {
  isOpen: boolean;
  isRunning: boolean;
  isPreviewStale?: boolean;
  preview?: AccountDeletionReadyPreview | null;
  error: AccountDeletionErrorState | null;
  onClose: () => void;
  onOpenChange: (details: { open: boolean }) => void;
  onSubmit: () => void;
};

export function AccountDeletionDialog({
  isOpen,
  isRunning,
  isPreviewStale = false,
  preview,
  error,
  onClose,
  onOpenChange,
  onSubmit,
}: Props) {
  const action = preview?.action ?? "accountOnly";
  const content = getDialogContent(action, preview);

  return (
    <Dialog
      title={content.title}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      formId="account-deletion-form"
      submitLabel={content.submitLabel}
      submitColorPalette="red"
      isLoading={isRunning}
      isSubmitDisabled={isRunning || isPreviewStale}
      role="alertdialog"
      mobileFullScreen
      maxW={{ base: "calc(100vw - 24px)", md: "600px" }}
    >
      <form
        id="account-deletion-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isRunning && !isPreviewStale) onSubmit();
        }}
      >
        <Stack gap={4}>
          <Text fontWeight="bold">この操作は元に戻せません。</Text>
          <Stack gap={2} fontSize="sm" color="fg" lineHeight="tall">
            {content.description}
          </Stack>
          {isPreviewStale ? (
            <Alert.Root status="warning" borderRadius="lg" alignItems="flex-start">
              <Alert.Indicator mt={0.5} />
              <Alert.Content>
                <Alert.Title>削除内容が更新されました</Alert.Title>
                <Alert.Description>
                  いったんキャンセルし、最新の削除内容を確認してから、もう一度お進みください。
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : null}
          {error ? (
            <Alert.Root status="error" borderRadius="lg" alignItems="flex-start">
              <Alert.Indicator mt={0.5} />
              <Alert.Content gap={2}>
                <Alert.Description whiteSpace="pre-line">{error.message}</Alert.Description>
                {error.showContactLink ? (
                  <Link asChild alignSelf="flex-start" color="red.700" fontSize="sm" fontWeight="semibold">
                    <MeasurementLink href="/contact">お問い合わせへ</MeasurementLink>
                  </Link>
                ) : null}
              </Alert.Content>
            </Alert.Root>
          ) : null}
        </Stack>
      </form>
    </Dialog>
  );
}

function getDialogContent(
  action: AccountDeletionAction,
  preview?: AccountDeletionReadyPreview | null,
): { title: string; submitLabel: string; description: ReactNode } {
  switch (action) {
    case "leaveOrganization": {
      const organizationName = preview?.action === "leaveOrganization" ? preview.organization.name : "所属する組織";
      const futureAssignmentCount = preview?.action === "leaveOrganization" ? preview.futureAssignmentCount : 0;
      return {
        title: "組織から退出してアカウントを削除",
        submitLabel: "退出して削除",
        description: (
          <>
            <Text>
              「{`${organizationName}`}」の管理者・スタッフとしての所属を終了し、ログインアカウントを削除します。
              <br />
              組織と店舗は、ほかの管理者が引き続き利用できます。
            </Text>
            <Text>
              {futureAssignmentCount > 0 ? ` 将来のシフト割り当て${futureAssignmentCount}件を削除します。` : ""}
            </Text>
          </>
        ),
      };
    }
    case "deleteOrganization": {
      const organizationName = preview?.action === "deleteOrganization" ? preview.organization.name : "所属する組織";
      const shopCount = preview?.action === "deleteOrganization" ? preview.organization.shopCount : 0;
      return {
        title: "組織と店舗の利用を終了",
        submitLabel: "組織と店舗を終了して削除",
        description: (
          <>
            <Text>{`「${organizationName}」と全${shopCount}店舗の利用を終了し、ログインアカウントを削除します。`}</Text>
            <Text>組織と店舗に所属する全スタッフ情報も合わせて削除します。</Text>
          </>
        ),
      };
    }
    case "accountOnly":
      return {
        title: "アカウントを削除",
        submitLabel: "アカウントを削除",
        description: (
          <Text>
            シフトリへのログインに使うアカウントを削除します。
            <br />
            アカウントを削除するとシフトリが利用できなくなります。
          </Text>
        ),
      };
  }
}
