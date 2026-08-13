import { Badge, Box, Flex, Grid, Heading, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuChevronRight, LuMailPlus, LuShieldCheck, LuUserPlus, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { Empty } from "@/src/components/ui/Empty";
import { getManagerInvitationExpiryLabel, getManagerInvitationStatusPresentation } from "./presentation";
import type { ManagerSettingsInvitation, ManagerSettingsManager, ReadyManagerSettingsOverview } from "./types";

type Props = {
  overview: ReadyManagerSettingsOverview;
  shopId: string;
  onBack: () => void;
  onRequestResend: (invitation: ManagerSettingsInvitation) => void;
  onRequestRevoke: (invitation: ManagerSettingsInvitation) => void;
  onRequestRemoveRole: (manager: ManagerSettingsManager) => void;
};

export function ManagerSettingsView({
  overview,
  shopId,
  onBack,
  onRequestResend,
  onRequestRevoke,
  onRequestRemoveRole,
}: Props) {
  const isFreeExchange = overview.mode === "freeManagerExchange";

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <DetailPageHeader title="管理者設定" onBack={onBack} backLabel="組織設定へ戻る" backAriaLabel="組織設定へ戻る" />

      <Stack as="section" gap={4} aria-labelledby="manager-addition-heading">
        <SectionHeading id="manager-addition-heading" icon={LuUserPlus}>
          {isFreeExchange ? "管理者を交代" : "管理者を追加"}
        </SectionHeading>
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
          <ManagerActionCard
            title={isFreeExchange ? "既存スタッフを次の管理者として招待" : "既存スタッフを管理者として招待"}
            description="組織に登録済みのスタッフから選択"
            icon={LuUsers}
            destination="existingStaff"
            shopId={shopId}
            enabled={overview.actions.canInviteExistingStaff}
            disabledReason={overview.actions.existingStaffDisabledReason}
          />
          <ManagerActionCard
            title="新しいユーザーを管理者として招待"
            description="経営者・本部担当者などをメールで招待"
            icon={LuMailPlus}
            destination="external"
            shopId={shopId}
            enabled={overview.actions.canInviteExternal}
            disabledReason={overview.actions.externalDisabledReason}
          />
        </Grid>
      </Stack>

      <ManagerUsageBar overview={overview} />

      <Stack as="section" gap={4} aria-labelledby="current-managers-heading">
        <SectionHeading id="current-managers-heading" icon={LuShieldCheck}>
          現在の管理者
        </SectionHeading>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            {overview.managers.map((manager) => (
              <ManagerRow key={manager.personId} manager={manager} onRequestRemoveRole={onRequestRemoveRole} />
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
  shopId: string;
  enabled: boolean;
  disabledReason?: string;
};

function ManagerActionCard({
  title,
  description,
  icon,
  destination,
  shopId,
  enabled,
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

  const link =
    destination === "existingStaff" ? (
      <RouterLink
        to="/settings/managers/invite-staff"
        search={{ shop: shopId }}
        preload="intent"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {content}
      </RouterLink>
    ) : (
      <RouterLink
        to="/settings/managers/invite-new"
        search={{ shop: shopId }}
        preload="intent"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {content}
      </RouterLink>
    );

  return (
    <Button
      asChild
      variant="outline"
      {...cardProps}
      transition="background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease"
      _hover={{ bg: "gray.50", borderColor: "gray.300", boxShadow: "sm" }}
      _active={{ bg: "gray.100" }}
    >
      {link}
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
  onRequestRemoveRole,
}: {
  manager: ManagerSettingsManager;
  onRequestRemoveRole: (manager: ManagerSettingsManager) => void;
}) {
  const reasonId = `manager-role-removal-${manager.personId}-reason`;
  return (
    <Flex
      as="article"
      aria-label={`${manager.name}さんの管理者情報`}
      direction={{ base: "column", md: "row" }}
      gap={{ base: 3, md: 4 }}
      px={{ base: 3, md: 4 }}
      py={3.5}
      align={{ base: "stretch", md: "center" }}
      minH="72px"
    >
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
      <Stack gap={1.5} align={{ base: "stretch", md: "flex-end" }}>
        <Button
          variant="outline"
          colorPalette="red"
          minH={{ base: "44px", md: "36px" }}
          size={{ base: "md", md: "sm" }}
          disabled={!manager.canRemoveRole}
          aria-describedby={!manager.canRemoveRole ? reasonId : undefined}
          onClick={() => onRequestRemoveRole(manager)}
        >
          管理者権限を外す
        </Button>
        {!manager.canRemoveRole && manager.removeRoleDisabledReason && (
          <Text id={reasonId} fontSize="xs" color="orange.700" textAlign={{ base: "left", md: "right" }}>
            {manager.removeRoleDisabledReason}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}

function InvitationRow({
  invitation,
  onRequestResend,
  onRequestRevoke,
}: {
  invitation: ManagerSettingsInvitation;
  onRequestResend: (invitation: ManagerSettingsInvitation) => void;
  onRequestRevoke: (invitation: ManagerSettingsInvitation) => void;
}) {
  const status = getManagerInvitationStatusPresentation(invitation.status);
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
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2} minW={{ md: "196px" }}>
        <Button
          variant="outline"
          size={{ base: "md", md: "sm" }}
          minH={{ base: "44px", md: "36px" }}
          disabled={!invitation.canResend}
          onClick={() => onRequestResend(invitation)}
        >
          再送する
        </Button>
        <Button
          variant="outline"
          colorPalette="red"
          size={{ base: "md", md: "sm" }}
          minH={{ base: "44px", md: "36px" }}
          disabled={!invitation.canRevoke}
          onClick={() => onRequestRevoke(invitation)}
        >
          取り消す
        </Button>
      </Grid>
    </Flex>
  );
}
