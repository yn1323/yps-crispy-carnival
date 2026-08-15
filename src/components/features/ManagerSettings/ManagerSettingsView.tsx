import { Badge, Box, Flex, Grid, Heading, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuChevronRight, LuMailPlus, LuShieldCheck, LuUserMinus, LuUserPlus, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { Empty } from "@/src/components/ui/Empty";
import { getManagerInvitationExpiryLabel, getManagerInvitationStatusPresentation } from "./presentation";
import {
  canResendManagerInvitation,
  type ManagerSettingsInvitation,
  type ManagerSettingsManager,
  type ReadyManagerSettingsOverview,
} from "./types";

type Props = {
  overview: ReadyManagerSettingsOverview;
  title?: string;
  titleIcon?: IconType;
  backLabel?: string;
  mutationDisabledReason?: string;
  onBack: () => void;
  onOpenInvitation: (destination: "existingStaff" | "external") => void;
  onRequestResend: (invitation: ManagerSettingsInvitation) => void;
  onRequestRevoke: (invitation: ManagerSettingsInvitation) => void;
  onRequestRemoveRole: (manager: ManagerSettingsManager) => void;
};

export function ManagerSettingsView({
  overview,
  title = "管理者設定",
  titleIcon,
  backLabel = "前の画面へ戻る",
  mutationDisabledReason,
  onBack,
  onOpenInvitation,
  onRequestResend,
  onRequestRevoke,
  onRequestRemoveRole,
}: Props) {
  const canIssueManagerAddition = overview.mode === "managerAddition";
  const legacyModeDisabledReason =
    "以前の管理者交代機能は終了しました。送信済みの交代招待を取り消すか、有効期限が切れてから画面を更新してください。";

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <DetailPageHeader
        title={title}
        icon={titleIcon}
        onBack={onBack}
        backLabel={backLabel}
        backAriaLabel={backLabel}
      />

      <ManagerUsageBar overview={overview} />

      <Stack as="section" gap={4} aria-labelledby="manager-addition-heading">
        <SectionHeading id="manager-addition-heading" icon={LuUserPlus}>
          管理者を追加
        </SectionHeading>
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
          <ManagerActionCard
            title="既存スタッフを管理者として招待"
            description="組織に登録済みのスタッフから選択"
            icon={LuUsers}
            destination="existingStaff"
            enabled={canIssueManagerAddition && overview.actions.canInviteExistingStaff}
            onClick={() => onOpenInvitation("existingStaff")}
            disabledReason={
              canIssueManagerAddition ? overview.actions.existingStaffDisabledReason : legacyModeDisabledReason
            }
          />
          <ManagerActionCard
            title="新しいユーザーを管理者として招待"
            description="経営者・本部担当者などをメールで招待"
            icon={LuMailPlus}
            destination="external"
            enabled={canIssueManagerAddition && overview.actions.canInviteExternal}
            onClick={() => onOpenInvitation("external")}
            disabledReason={
              canIssueManagerAddition ? overview.actions.externalDisabledReason : legacyModeDisabledReason
            }
          />
        </Grid>
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="current-managers-heading">
        <SectionHeading id="current-managers-heading" icon={LuShieldCheck}>
          現在の管理者
        </SectionHeading>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            {overview.managers.map((manager) => (
              <ManagerRow
                key={manager.personId}
                manager={manager}
                mutationDisabledReason={mutationDisabledReason}
                onRequestRemoveRole={onRequestRemoveRole}
              />
            ))}
          </Stack>
        </Box>
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="pending-manager-invitations-heading">
        <SectionHeading id="pending-manager-invitations-heading" icon={LuMailPlus}>
          送信済みの管理者招待
        </SectionHeading>
        {overview.invitations.length === 0 ? (
          <Empty
            icon={LuMailPlus}
            title="送信済みの管理者招待はありません"
            description="新しく招待すると、ここで再送や取り消しができます。"
            variant="section"
            py={8}
          />
        ) : (
          <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {overview.invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.invitationId}
                  invitation={invitation}
                  mutationDisabledReason={mutationDisabledReason}
                  onRequestResend={onRequestResend}
                  onRequestRevoke={onRequestRevoke}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Stack>
  );
}

function SectionHeading({ id, icon, children }: { id: string; icon: typeof LuUsers; children: ReactNode }) {
  return (
    <HStack gap={2.5} align="center">
      <Box color="fg.muted" fontSize={{ base: "xl", md: "2xl" }}>
        <Icon as={icon} aria-hidden />
      </Box>
      <Heading id={id} as="h2" fontSize={{ base: "lg", md: "xl" }} color="gray.900">
        {children}
      </Heading>
    </HStack>
  );
}

type ActionCardProps = {
  title: string;
  description: string;
  icon: typeof LuUsers;
  destination: "existingStaff" | "external";
  enabled: boolean;
  onClick: () => void;
  disabledReason?: string;
};

function ManagerActionCard({
  title,
  description,
  icon,
  destination,
  enabled,
  onClick,
  disabledReason,
}: ActionCardProps) {
  const titleId = `${destination === "existingStaff" ? "existing" : "external"}-manager-action-title`;
  const descriptionId = `${titleId}-description`;
  const content = (
    <HStack gap={3.5} align="center" w="full" minW={0}>
      <Flex
        boxSize={{ base: "42px", sm: "44px" }}
        borderRadius="lg"
        bg="teal.50"
        color="teal.700"
        align="center"
        justify="center"
        flexShrink={0}
        fontSize="xl"
        aria-hidden
      >
        <Icon as={icon} />
      </Flex>
      <Stack gap={1} flex={1} minW={0}>
        <Text id={titleId} fontWeight="semibold" color="gray.900" lineHeight="short">
          {title}
        </Text>
        <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall">
          {description}
        </Text>
        {!enabled && disabledReason && (
          <Text fontSize="xs" color="orange.700" lineHeight="tall">
            {disabledReason}
          </Text>
        )}
      </Stack>
      {enabled && (
        <Flex color="gray.400" fontSize="lg" flexShrink={0} aria-hidden>
          <LuChevronRight />
        </Flex>
      )}
    </HStack>
  );
  const cardProps = {
    w: "full",
    h: "auto",
    minH: { base: "104px", sm: "96px" },
    px: { base: 3.5, sm: 4 },
    py: 3.5,
    justifyContent: "flex-start",
    textAlign: "left" as const,
    whiteSpace: "normal" as const,
    bg: "white",
    borderColor: "border.default",
    borderRadius: "xl",
    boxShadow: "xs",
  };

  if (!enabled) {
    return (
      <Box {...cardProps} borderWidth="1px" opacity={0.72} aria-labelledby={titleId} aria-describedby={descriptionId}>
        {content}
      </Box>
    );
  }

  return (
    <Button
      variant="outline"
      {...cardProps}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onClick}
      transition="background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease"
      _hover={{ bg: "gray.50", borderColor: "gray.300", boxShadow: "sm" }}
      _active={{ bg: "gray.100" }}
    >
      {content}
    </Button>
  );
}

function ManagerUsageBar({ overview }: { overview: ReadyManagerSettingsOverview }) {
  const items = [
    { label: "管理者", value: `${overview.usage.activeManagers} / ${overview.usage.maxManagers}` },
    { label: "招待中", value: `${overview.usage.activeInvitationCount}件` },
  ];
  return (
    <Box as="section" aria-label="管理者の利用状況" bg="white" borderWidth="1px" borderRadius="xl" overflow="hidden">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" divideX="1px" divideColor="blackAlpha.100">
        {items.map((item) => (
          <Stack key={item.label} gap={1} px={{ base: 3, md: 6 }} py={{ base: 3.5, md: 4 }} textAlign="center">
            <Text fontSize="sm" color="fg.muted" fontWeight="medium">
              {item.label}
            </Text>
            <Text fontWeight="bold" color="gray.900">
              {item.value}
            </Text>
          </Stack>
        ))}
      </Grid>
    </Box>
  );
}

function ManagerAvatar({ name, readOnly = false }: { name: string; readOnly?: boolean }) {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg={readOnly ? "gray.100" : "teal.500"}
      color={readOnly ? "gray.700" : "white"}
      align="center"
      justify="center"
      fontWeight="semibold"
      fontSize="sm"
      flexShrink={0}
      aria-hidden
    >
      {name.trim().charAt(0) || "?"}
    </Flex>
  );
}

function ManagerRow({
  manager,
  mutationDisabledReason,
  onRequestRemoveRole,
}: {
  manager: ManagerSettingsManager;
  mutationDisabledReason?: string;
  onRequestRemoveRole: (manager: ManagerSettingsManager) => void;
}) {
  const reasonId = `manager-role-removal-${manager.personId}-reason`;
  const canRemoveRole = manager.canRemoveRole && !mutationDisabledReason;
  const disabledReason = manager.canRemoveRole ? mutationDisabledReason : manager.removeRoleDisabledReason;

  return (
    <Stack
      as="article"
      aria-label={`${manager.name}さんの管理者情報`}
      gap={1.5}
      px={{ base: 3, md: 4 }}
      py={3.5}
      minH="72px"
    >
      <Flex gap={{ base: 2, md: 4 }} align="center" minW={0}>
        <HStack gap={3} flex={1} minW={0} align="center">
          <ManagerAvatar name={manager.name} readOnly={manager.role === "readOnly"} />
          <Stack gap={0.5} minW={0} flex={1}>
            <HStack gap={1.5} wrap="wrap">
              <Text fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
                {manager.name}
              </Text>
              {manager.isSelf && (
                <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
                  あなた
                </Badge>
              )}
              {manager.role === "readOnly" && (
                <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2} textStyle="2xs">
                  閲覧のみ
                </Badge>
              )}
            </HStack>
            <Text fontSize="sm" color="fg.muted" overflowWrap="anywhere">
              {manager.contactEmail}
            </Text>
          </Stack>
        </HStack>
        <Button
          variant="outline"
          colorPalette="red"
          minH={{ base: "44px", md: "36px" }}
          minW={{ base: "44px", md: "auto" }}
          px={{ base: 0, md: 3 }}
          gap={{ base: 0, md: 2 }}
          size={{ base: "md", md: "sm" }}
          flexShrink={0}
          disabled={!canRemoveRole}
          aria-label="管理者権限を外す"
          aria-describedby={!canRemoveRole && disabledReason ? reasonId : undefined}
          onClick={() => onRequestRemoveRole(manager)}
        >
          <LuUserMinus aria-hidden />
          <Text as="span" display={{ base: "none", md: "inline" }}>
            管理者権限を外す
          </Text>
        </Button>
      </Flex>
      {!canRemoveRole && disabledReason && (
        <Text id={reasonId} fontSize="xs" color="orange.700" textAlign={{ base: "left", md: "right" }}>
          {disabledReason}
        </Text>
      )}
    </Stack>
  );
}

function InvitationRow({
  invitation,
  mutationDisabledReason,
  onRequestResend,
  onRequestRevoke,
}: {
  invitation: ManagerSettingsInvitation;
  mutationDisabledReason?: string;
  onRequestResend: (invitation: ManagerSettingsInvitation) => void;
  onRequestRevoke: (invitation: ManagerSettingsInvitation) => void;
}) {
  const status = getManagerInvitationStatusPresentation(invitation.status);
  const canResend = canResendManagerInvitation(invitation) && !mutationDisabledReason;
  const canRevoke = invitation.canRevoke && !mutationDisabledReason;
  const disabledReasonId = mutationDisabledReason
    ? `manager-invitation-${invitation.invitationId}-disabled-reason`
    : undefined;

  return (
    <Flex
      as="article"
      aria-label={`${invitation.name}さんへの管理者招待`}
      direction={{ base: "column", md: "row" }}
      gap={{ base: 3, md: 4 }}
      px={{ base: 3, md: 4 }}
      py={3.5}
      align={{ base: "stretch", md: "center" }}
      minH="76px"
    >
      <HStack gap={3} flex={1} minW={0} align="center">
        <ManagerAvatar name={invitation.name} />
        <Stack gap={0.5} minW={0} flex={1}>
          <Text fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
            {invitation.name}
          </Text>
          <Text fontSize="sm" color="fg.muted" overflowWrap="anywhere">
            {invitation.invitedEmail}
          </Text>
          {invitation.purpose === "freeManagerExchange" && (
            <Text fontSize="xs" color="orange.700">
              以前の交代方式の招待です。承認されると、現在の管理者から管理者権限が外れます。
            </Text>
          )}
        </Stack>
      </HStack>
      <Stack gap={1} minW={{ md: "176px" }} align={{ base: "flex-start", md: "flex-end" }}>
        <Badge colorPalette={status.colorPalette} variant="subtle" borderRadius="full" px={2}>
          {status.label}
        </Badge>
        <Text fontSize="xs" color="fg.muted">
          {getManagerInvitationExpiryLabel(invitation.expiresAt)}
        </Text>
      </Stack>
      <Stack gap={1.5} minW={{ md: "196px" }}>
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
          <Button
            variant="outline"
            size={{ base: "md", md: "sm" }}
            minH={{ base: "44px", md: "36px" }}
            disabled={!canResend}
            aria-describedby={!canResend ? disabledReasonId : undefined}
            onClick={() => onRequestResend(invitation)}
          >
            再送する
          </Button>
          <Button
            variant="outline"
            colorPalette="red"
            size={{ base: "md", md: "sm" }}
            minH={{ base: "44px", md: "36px" }}
            disabled={!canRevoke}
            aria-describedby={!canRevoke ? disabledReasonId : undefined}
            onClick={() => onRequestRevoke(invitation)}
          >
            取り消す
          </Button>
        </Grid>
        {mutationDisabledReason && (
          <Text id={disabledReasonId} fontSize="xs" color="fg.muted" textAlign={{ base: "left", md: "right" }}>
            {mutationDisabledReason}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}
