import { Badge, Box, Flex, Heading, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { LuMailPlus, LuTrash2, LuUsers } from "react-icons/lu";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { resolvePeopleCapacityLimit } from "@/src/domains/organizationBilling/peopleCapacity";
import { formatDateShort } from "@/src/domains/shift/date";
import type {
  ManagerInvitationStatus,
  ManagerInvitationView,
  OrganizationBillingView,
  OrganizationPersonView,
} from "./types";

type Props = {
  people: OrganizationPersonView[];
  invitations: ManagerInvitationView[];
  billing: OrganizationBillingView;
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  inviteManagerDisabledReason?: string;
  onInviteManager: () => void;
  onRemovePersonFromCurrentShop: (personId: string) => void;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
  onResendInvitation: (invitationId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
};

const INVITATION_STATUS: Record<
  ManagerInvitationStatus,
  { label: string; colorPalette: "teal" | "green" | "gray" | "orange" | "red" }
> = {
  pending: { label: "招待中", colorPalette: "teal" },
  expired: { label: "期限切れ", colorPalette: "orange" },
  revoked: { label: "取消済み", colorPalette: "gray" },
  accepted: { label: "承認済み", colorPalette: "green" },
  sendFailed: { label: "送信失敗", colorPalette: "red" },
  limitReached: { label: "上限到達", colorPalette: "orange" },
  conflict: { label: "競合", colorPalette: "red" },
};

export const PeopleSection = ({
  people,
  invitations,
  billing,
  canInviteManager,
  managerInvitationMode,
  inviteManagerDisabledReason,
  onInviteManager,
  onRemovePersonFromCurrentShop,
  onRemoveManagerRole,
  onRemovePerson,
  onResendInvitation,
  onRevokeInvitation,
}: Props) => (
  <Stack gap={7}>
    <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <Stack gap={1}>
          <HStack gap={2}>
            <LuUsers aria-hidden />
            <Heading id="organization-people-heading" as="h2" fontSize="lg">
              事業者の利用者
            </Heading>
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            同じ人物が複数店舗に所属しても、利用人数は1名として数えます。
          </Text>
        </Stack>
        <Button
          size="sm"
          colorPalette="teal"
          onClick={onInviteManager}
          disabled={!canInviteManager}
          title={!canInviteManager ? inviteManagerDisabledReason : undefined}
          aria-describedby={
            !canInviteManager && inviteManagerDisabledReason
              ? "organization-manager-invitation-disabled-reason"
              : undefined
          }
          gap={1.5}
        >
          <LuMailPlus aria-hidden />
          {managerInvitationMode === "freeManagerExchange" ? "管理者を交代" : "管理者を招待"}
        </Button>
      </Flex>
      {!canInviteManager && inviteManagerDisabledReason && (
        <Box id="organization-manager-invitation-disabled-reason">
          <InvitationDisabledNotice reason={inviteManagerDisabledReason} billing={billing} />
        </Box>
      )}

      <Box display={{ base: "none", md: "block" }} overflowX="auto" borderWidth="1px" borderRadius="xl" bg="white">
        <Table.Root size="sm" minW="760px">
          <Table.Header>
            <Table.Row bg="gray.50">
              <Table.ColumnHeader>利用者</Table.ColumnHeader>
              <Table.ColumnHeader>役割</Table.ColumnHeader>
              <Table.ColumnHeader>所属店舗</Table.ColumnHeader>
              <Table.ColumnHeader>利用人数</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">操作</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {people.map((person) => (
              <Table.Row key={person.id}>
                <Table.Cell>
                  <Stack gap={0.5}>
                    <Text fontWeight="semibold">{person.name}</Text>
                    <Text fontSize="xs" color="fg.muted">
                      {person.email ?? "メール未設定"}
                    </Text>
                    <FutureAssignmentNotice person={person} />
                  </Stack>
                </Table.Cell>
                <Table.Cell>
                  <PersonRoleBadges person={person} />
                </Table.Cell>
                <Table.Cell>{person.shopNames.length > 0 ? person.shopNames.join("、") : "店舗所属なし"}</Table.Cell>
                <Table.Cell>{person.countsTowardPeopleLimit ? "算入" : "対象外"}</Table.Cell>
                <Table.Cell textAlign="end">
                  <PersonActions
                    person={person}
                    surface="desktop"
                    onRemovePersonFromCurrentShop={onRemovePersonFromCurrentShop}
                    onRemoveManagerRole={onRemoveManagerRole}
                    onRemovePerson={onRemovePerson}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <Stack display={{ base: "flex", md: "none" }} gap={3}>
        {people.map((person) => (
          <Box key={person.id} borderWidth="1px" borderRadius="xl" bg="white" p={4}>
            <Stack gap={3}>
              <Flex justify="space-between" gap={3} align="flex-start">
                <Stack gap={0.5} minW={0}>
                  <Text fontWeight="bold">{person.name}</Text>
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {person.email ?? "メール未設定"}
                  </Text>
                </Stack>
                <PersonRoleBadges person={person} />
              </Flex>
              <Stack gap={1} fontSize="sm">
                <Text>
                  <Text as="span" color="fg.muted">
                    所属店舗:
                  </Text>
                  {person.shopNames.length > 0 ? person.shopNames.join("、") : "店舗所属なし"}
                </Text>
                <Text>
                  <Text as="span" color="fg.muted">
                    利用人数:
                  </Text>
                  {person.countsTowardPeopleLimit ? "算入" : "対象外"}
                </Text>
              </Stack>
              <FutureAssignmentNotice person={person} />
              <PersonActions
                person={person}
                surface="mobile"
                onRemovePersonFromCurrentShop={onRemovePersonFromCurrentShop}
                onRemoveManagerRole={onRemoveManagerRole}
                onRemovePerson={onRemovePerson}
              />
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>

    <Stack as="section" gap={3} aria-labelledby="manager-invitations-heading">
      <Stack gap={1}>
        <Heading id="manager-invitations-heading" as="h2" fontSize="md">
          管理者招待
        </Heading>
        <Text fontSize="sm" color="fg.muted">
          管理者は事業者内のすべての店舗と契約設定を管理できます。
        </Text>
      </Stack>
      {invitations.length === 0 ? (
        <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={5} textAlign="center" color="fg.muted">
          招待中の管理者はいません。
        </Box>
      ) : (
        <Stack gap={2}>
          {invitations.map((invitation) => {
            const status = INVITATION_STATUS[invitation.status];
            return (
              <Flex
                key={invitation.id}
                borderWidth="1px"
                borderRadius="lg"
                bg="white"
                p={3}
                justify="space-between"
                align={{ base: "flex-start", md: "center" }}
                gap={3}
                direction={{ base: "column", md: "row" }}
              >
                <Stack gap={1} minW={0}>
                  <HStack gap={2} wrap="wrap">
                    <Text fontSize="sm" fontWeight="semibold" wordBreak="break-all">
                      {invitation.email}
                    </Text>
                    <Badge colorPalette={status.colorPalette} variant="subtle">
                      {status.label}
                    </Badge>
                  </HStack>
                  {(invitation.statusDetail || invitation.expiresAt) && (
                    <Text fontSize="xs" color={invitation.status === "sendFailed" ? "red.700" : "fg.muted"}>
                      {invitation.statusDetail ?? `有効期限: ${invitation.expiresAt}`}
                    </Text>
                  )}
                </Stack>
                <HStack gap={2}>
                  {invitation.canResend && (
                    <Button size="xs" variant="outline" onClick={() => onResendInvitation(invitation.id)}>
                      再送
                    </Button>
                  )}
                  {invitation.canRevoke && (
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => onRevokeInvitation(invitation.id)}
                    >
                      取消
                    </Button>
                  )}
                </HStack>
              </Flex>
            );
          })}
        </Stack>
      )}
    </Stack>
  </Stack>
);

const InvitationDisabledNotice = ({ reason, billing }: { reason: string; billing: OrganizationBillingView }) => {
  if (reason.includes("上限")) {
    return (
      <PeopleCapacityResolutionAlert
        resolution={resolvePeopleCapacityLimit(billing.peopleUsage.current, billing.peopleUsage.max)}
        retryActionLabel="管理者を招待"
      />
    );
  }

  return (
    <Text fontSize="sm" color="orange.700">
      {reason}
    </Text>
  );
};

const PersonRoleBadges = ({ person }: { person: OrganizationPersonView }) => (
  <HStack gap={1.5} wrap="wrap">
    {person.managerRole === "active" && (
      <Badge colorPalette="teal" variant="subtle">
        管理者
      </Badge>
    )}
    {person.managerRole === "readOnly" && (
      <Badge colorPalette="orange" variant="subtle">
        閲覧のみ管理者
      </Badge>
    )}
    {person.isStaff && (
      <Badge colorPalette="gray" variant="subtle">
        スタッフ
      </Badge>
    )}
  </HStack>
);

type PersonAction = "removeFromCurrentShop" | "removeManagerRole" | "removePerson";
type PersonActionSurface = "desktop" | "mobile";

const PersonActions = ({
  person,
  surface,
  onRemovePersonFromCurrentShop,
  onRemoveManagerRole,
  onRemovePerson,
}: {
  person: OrganizationPersonView;
  surface: PersonActionSurface;
  onRemovePersonFromCurrentShop: (personId: string) => void;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
}) => {
  const disabledReasons = buildPersonDisabledReasons(person, surface);
  const buttonSize = surface === "desktop" ? "xs" : "sm";
  const buttonVariant = surface === "desktop" ? "ghost" : "outline";

  const managerRoleButton = person.managerRole === "active" && (
    <Button
      size={buttonSize}
      variant={buttonVariant}
      onClick={() => onRemoveManagerRole(person.id)}
      disabled={!person.canRemoveManagerRole}
      title={!person.canRemoveManagerRole ? person.managerRoleRemovalDisabledReason : undefined}
      aria-label={`${person.name}の管理者権限を外す`}
      aria-describedby={disabledReasons.byAction.removeManagerRole}
    >
      管理者権限を外す
    </Button>
  );
  const currentShopButton = person.currentShopStaffId && (
    <Button
      size={buttonSize}
      variant={buttonVariant}
      onClick={() => onRemovePersonFromCurrentShop(person.id)}
      disabled={!person.canRemoveFromCurrentShop}
      title={!person.canRemoveFromCurrentShop ? person.removeFromCurrentShopDisabledReason : undefined}
      aria-label={`${person.name}を操作中の店舗から削除`}
      aria-describedby={disabledReasons.byAction.removeFromCurrentShop}
    >
      {surface === "desktop" ? "店舗から削除" : "操作中の店舗から削除"}
    </Button>
  );
  const removePersonButton = (
    <Button
      size={buttonSize}
      variant={buttonVariant}
      colorPalette="red"
      onClick={() => onRemovePerson(person.id)}
      disabled={!person.canRemove}
      title={!person.canRemove ? person.removeDisabledReason : undefined}
      aria-label={`${person.name}を事業者から削除`}
      aria-describedby={disabledReasons.byAction.removePerson}
    >
      {surface === "desktop" && <LuTrash2 aria-hidden />}
      事業者から削除
    </Button>
  );
  const buttons =
    surface === "desktop" ? (
      <>
        {currentShopButton}
        {managerRoleButton}
        {removePersonButton}
      </>
    ) : (
      <>
        {managerRoleButton}
        {currentShopButton}
        {removePersonButton}
      </>
    );

  return (
    <Stack gap={1.5} align={surface === "desktop" ? "flex-end" : "stretch"}>
      {surface === "desktop" ? (
        <HStack justify="flex-end" gap={1}>
          {buttons}
        </HStack>
      ) : (
        buttons
      )}
      {disabledReasons.items.map((item) => (
        <Text
          key={item.id}
          id={item.id}
          maxW={surface === "desktop" ? "360px" : undefined}
          fontSize="xs"
          color="orange.700"
          textAlign={surface === "desktop" ? "end" : "start"}
        >
          {item.reason}
        </Text>
      ))}
    </Stack>
  );
};

function buildPersonDisabledReasons(person: OrganizationPersonView, surface: PersonActionSurface) {
  const candidates: Array<{ action: PersonAction; reason?: string }> = [
    {
      action: "removeManagerRole",
      reason:
        person.managerRole === "active" && !person.canRemoveManagerRole
          ? person.managerRoleRemovalDisabledReason
          : undefined,
    },
    {
      action: "removeFromCurrentShop",
      reason:
        person.currentShopStaffId && !person.canRemoveFromCurrentShop
          ? person.removeFromCurrentShopDisabledReason
          : undefined,
    },
    { action: "removePerson", reason: !person.canRemove ? person.removeDisabledReason : undefined },
  ];
  const idByReason = new Map<string, string>();
  const byAction: Partial<Record<PersonAction, string>> = {};
  const items: Array<{ id: string; reason: string }> = [];

  for (const candidate of candidates) {
    if (!candidate.reason) continue;
    const existingId = idByReason.get(candidate.reason);
    const id =
      existingId ?? `organization-person-${person.id}-${surface}-${candidate.action.toLowerCase()}-disabled-reason`;
    if (!existingId) {
      idByReason.set(candidate.reason, id);
      items.push({ id, reason: candidate.reason });
    }
    byAction[candidate.action] = id;
  }

  return { byAction, items };
}

const FutureAssignmentNotice = ({ person }: { person: OrganizationPersonView }) => {
  const assignments = person.futureAssignments ?? [];
  if (assignments.length === 0) return null;

  return (
    <Stack mt={1} gap={1} borderWidth="1px" borderColor="orange.200" borderRadius="md" bg="orange.50" p={2}>
      <Text fontSize="xs" fontWeight="semibold" color="orange.800">
        事業者から削除する前に、次の将来シフトの割当を解除または変更してください
      </Text>
      {assignments.map((assignment, index) => (
        <Text
          key={`${assignment.shopName}:${assignment.date}:${assignment.startTime}:${assignment.endTime}:${index}`}
          fontSize="xs"
          color="orange.800"
        >
          {formatDateShort(assignment.date)} {assignment.startTime}〜{assignment.endTime}（{assignment.shopName}・
          {formatDateShort(assignment.periodStart)}〜{formatDateShort(assignment.periodEnd)}の募集）
        </Text>
      ))}
      {person.hasMoreFutureAssignments && (
        <Text fontSize="xs" color="orange.800">
          ほかにも割当があります。シフト画面ですべて確認してください。
        </Text>
      )}
    </Stack>
  );
};
