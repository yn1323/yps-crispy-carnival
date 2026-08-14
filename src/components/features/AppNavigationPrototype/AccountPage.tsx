import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { LuBuilding2, LuUserRound } from "react-icons/lu";
import { LoginMethodsView } from "@/src/components/features/LoginMethods";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { APP_PROTOTYPE_FIXTURE } from "./fixtures";
import { AvatarCircle, IconSurface, MutedBadge, PrototypePage, SectionHeading } from "./PrototypeUI";

const PRIMARY_PERSON = APP_PROTOTYPE_FIXTURE.people[0];
const noop = () => undefined;
const PREVIEW_DISABLED_REASON = "固定プレビューのため、この画面では操作できません。";

type LoginMethodsViewProps = ComponentProps<typeof LoginMethodsView>;

const loginMethodsController: LoginMethodsViewProps["controller"] = {
  viewModel: {
    status: "ready",
    methodState: "googleAndPassword",
    google: {
      accounts: [
        {
          id: "google-preview",
          emailAddress: PRIMARY_PERSON.email,
          status: "connected",
          canDisconnect: false,
          disconnectUnavailableReason: PREVIEW_DISABLED_REASON,
        },
      ],
      canConnect: false,
      canReconnect: false,
    },
    emailPassword: {
      primaryEmail: {
        id: "email-preview",
        emailAddress: PRIMARY_PERSON.email,
        verificationStatus: "verified",
      },
      canChangeLoginEmail: false,
      canChangePassword: true,
      canSetPassword: false,
    },
  },
  isLoaded: true,
  googleState: { status: "idle", message: null },
  googleDisconnectPendingCleanup: false,
  emailPasswordState: { status: "idle", message: null },
  emailChangeDialog: { isOpen: false },
  reload: async () => undefined,
  prepareGoogleDisconnect: async () => false,
  disconnectGoogle: async () => false,
  closeGoogleDisconnect: noop,
  openLoginEmailChange: noop,
  closeLoginEmailChangeDialog: noop,
  backToLoginEmailInput: noop,
  startLoginEmailChange: async () => undefined,
  verifyLoginEmailCode: async () => undefined,
  resendLoginEmailCode: async () => undefined,
};

const passwordChangeController: LoginMethodsViewProps["passwordChangeController"] = {
  state: { isOpen: false, status: "idle", message: null },
  open: noop,
  close: noop,
  changePassword: async () => false,
};

const reverificationController: LoginMethodsViewProps["reverification"] = {
  state: {
    status: "idle",
    operationId: null,
    level: null,
    stage: null,
    factors: [],
    selectedFactor: null,
    message: null,
  },
  onNeedsReverification: noop,
  runOperation: async (operation) => operation(),
  selectFactor: async () => undefined,
  submit: async () => undefined,
  resend: async () => undefined,
  useAnotherFactor: noop,
  cancel: noop,
};

export function PrototypeAccountView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <DetailPageHeader
        title="アカウント"
        icon={LuUserRound}
        onBack={() => void navigate({ to: "/app/home" })}
        backLabel="ホームへ戻る"
        backAriaLabel="ホームへ戻る"
      />

      <Stack as="section" gap={3} aria-labelledby="account-profile-heading">
        <SectionHeading>プロフィール</SectionHeading>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <DrilldownRow
            ariaLabel="プロフィールを確認"
            title={PRIMARY_PERSON.name}
            leading={<AvatarCircle initial={PRIMARY_PERSON.initial} strong />}
            secondary={
              <Text fontSize="sm" color="fg.muted" overflowWrap="anywhere">
                {PRIMARY_PERSON.email}
              </Text>
            }
            badges={<MutedBadge color="teal">管理者</MutedBadge>}
            accessibleDescription="固定プレビューのプロフィール情報"
            disabled
            onClick={noop}
          />
        </Box>
      </Stack>

      <Stack as="section" gap={3} aria-labelledby="account-login-methods-heading">
        <SectionHeading>ログイン方法</SectionHeading>
        <LoginMethodsView
          controller={loginMethodsController}
          passwordChangeController={passwordChangeController}
          onStartFlow={noop}
          reverification={reverificationController}
          isMigrationDialogOpen={false}
          isReadOnly
        />
      </Stack>

      <Stack as="section" gap={3} aria-labelledby="account-organizations-heading">
        <SectionHeading>利用中の組織</SectionHeading>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <DrilldownRow
            ariaLabel={`${APP_PROTOTYPE_FIXTURE.organization.name}の管理を開く`}
            title={APP_PROTOTYPE_FIXTURE.organization.name}
            leading={<IconSurface icon={LuBuilding2} />}
            secondary={
              <HStack gap={2}>
                <Text fontSize="sm" color="fg.muted">
                  管理者
                </Text>
                <MutedBadge>3店舗</MutedBadge>
              </HStack>
            }
            onClick={() => void navigate({ to: "/app/manage" })}
          />
        </Box>
      </Stack>

      <DeletionActionSection
        title="アカウントの利用を終了する"
        description="現在の所属と削除できる範囲を確認してから手続きを開始します。"
        actionLabel="削除内容を確認"
        canDelete={false}
        disabledReason={PREVIEW_DISABLED_REASON}
        onDelete={noop}
      />
    </PrototypePage>
  );
}
