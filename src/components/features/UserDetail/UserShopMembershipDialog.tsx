import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuStore } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { MembershipRemovalImpact } from "@/src/components/shared/MembershipRemovalImpact";
import { CheckboxListCard, CheckboxListCardItem } from "@/src/components/ui/CheckboxListCard";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserMembershipChangeInput } from "./types";

const MEMBERSHIP_REMOVAL_ASSIGNMENT_LIMIT = 500;

type MembershipSession = {
  personId: UserDetailData["person"]["id"];
  shops: UserDetailData["shops"];
  memberships: UserDetailData["memberships"];
  initialActiveShopIds: Id<"shops">[];
  selectedActiveShopIds: Id<"shops">[];
  expectedMembershipFingerprint: string;
  requestId: string;
  submittedInput: UserMembershipChangeInput | null;
};

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  isChanging: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onChangeMemberships: (input: UserMembershipChangeInput) => void | Promise<void>;
};

export function UserShopMembershipDialog({
  data,
  isOpen,
  isChanging,
  onOpenChange,
  onClose,
  onChangeMemberships,
}: Props) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const openStateRef = useRef({ isOpen, personId: data.person.id });
  const [session, setSession] = useState<MembershipSession>(() => createSession(data));

  useEffect(() => {
    const previous = openStateRef.current;
    if (isOpen && (!previous.isOpen || previous.personId !== data.person.id)) {
      setSession(createSession(dataRef.current));
    }
    openStateRef.current = { isOpen, personId: data.person.id };
  }, [data.person.id, isOpen]);

  const isCurrentSession = session.personId === data.person.id;
  const visibleShops = isCurrentSession ? session.shops : data.shops;
  const visibleMemberships = isCurrentSession ? session.memberships : data.memberships;
  const fallbackActiveMembershipShopIds = getActiveMembershipShopIds(data.shops, data.memberships);
  const initialActiveShopIds = isCurrentSession ? session.initialActiveShopIds : fallbackActiveMembershipShopIds;
  const selectedActiveShopIds = isCurrentSession ? session.selectedActiveShopIds : fallbackActiveMembershipShopIds;
  const initialActiveShopIdSet = useMemo(() => new Set(initialActiveShopIds), [initialActiveShopIds]);
  const selectedActiveShopIdSet = useMemo(() => new Set(selectedActiveShopIds), [selectedActiveShopIds]);
  const membershipByShopId = useMemo(
    () => new Map(visibleMemberships.map((membership) => [membership.shopId, membership])),
    [visibleMemberships],
  );
  const visibleShopRows = visibleShops.filter(
    (shop) => shop.shopStatus === "active" || membershipByShopId.has(shop.shopId),
  );
  const activeShops = visibleShops.filter((shop) => shop.shopStatus === "active");
  const hasActiveShopContext = activeShops.length > 0;
  const globalDisabledReason = !data.canWrite
    ? (data.writeDisabledReason ?? "現在、この組織の所属店舗を変更できません。")
    : !hasActiveShopContext
      ? "稼働中の店舗がないため、所属店舗を変更できません。"
      : undefined;
  const globalDisabledReasonId = globalDisabledReason ? "user-shop-membership-change-disabled" : undefined;
  const addedShops = visibleShops.filter(
    (shop) =>
      shop.shopStatus === "active" &&
      selectedActiveShopIdSet.has(shop.shopId) &&
      !initialActiveShopIdSet.has(shop.shopId),
  );
  const removedShops = visibleShops.filter(
    (shop) =>
      shop.shopStatus === "active" &&
      initialActiveShopIdSet.has(shop.shopId) &&
      !selectedActiveShopIdSet.has(shop.shopId),
  );
  const removedMemberships = removedShops.flatMap((shop) => {
    const membership = membershipByShopId.get(shop.shopId);
    return membership ? [membership] : [];
  });
  const removesActiveManagerFromShop =
    data.managerRole === "active" && data.person.email.trim().length > 0 && removedShops.length > 0;
  const readyRemovalAssignmentCount = removedMemberships.reduce(
    (total, membership) =>
      membership.removalPreview.kind === "ready" ? total + membership.removalPreview.assignmentCount : total,
    0,
  );
  const hasTooManyAssignments =
    removedMemberships.some((membership) => membership.removalPreview.kind === "tooMany") ||
    readyRemovalAssignmentCount > MEMBERSHIP_REMOVAL_ASSIGNMENT_LIMIT;
  const hasDiff = addedShops.length > 0 || removedShops.length > 0;
  const hasRemainingInactiveMembership = visibleMemberships.some((membership) => membership.shopStatus !== "active");
  const removesAllMemberships =
    removedShops.length > 0 && selectedActiveShopIds.length === 0 && !hasRemainingInactiveMembership;
  const isFingerprintDirty = isCurrentSession && data.membershipFingerprint !== session.expectedMembershipFingerprint;
  const canSubmitFrozenIntent = !isFingerprintDirty || Boolean(session.submittedInput);

  const changeSelection = (shopId: Id<"shops">, checked: boolean) => {
    if (isChanging) return;
    setSession((current) => {
      if (current.personId !== data.person.id) return current;
      const selected = new Set(current.selectedActiveShopIds);
      if (checked === selected.has(shopId)) return current;
      if (checked) selected.add(shopId);
      else selected.delete(shopId);
      return {
        ...current,
        selectedActiveShopIds: current.shops.flatMap((shop) => (selected.has(shop.shopId) ? [shop.shopId] : [])),
        requestId: crypto.randomUUID(),
        submittedInput: null,
      };
    });
  };

  const submitChange = async () => {
    if (
      !isCurrentSession ||
      !data.canWrite ||
      !hasActiveShopContext ||
      !hasDiff ||
      hasTooManyAssignments ||
      !canSubmitFrozenIntent
    )
      return;
    if (session.submittedInput) {
      await onChangeMemberships(session.submittedInput);
      return;
    }
    const diffShopIds = [...addedShops, ...removedShops].map((shop) => shop.shopId);
    const authorizationShop =
      visibleShops.find((shop) => shop.shopStatus === "active" && diffShopIds.includes(shop.shopId)) ?? activeShops[0];
    if (!authorizationShop) return;
    const removalPreviews = removedMemberships.flatMap((membership) =>
      membership.removalPreview.kind === "ready"
        ? [
            {
              shopId: membership.shopId,
              staffId: membership.staffId,
              assignmentCount: membership.removalPreview.assignmentCount,
              fingerprint: membership.removalPreview.fingerprint,
            },
          ]
        : [],
    );

    const input: UserMembershipChangeInput = {
      shopId: authorizationShop.shopId,
      desiredActiveShopIds: selectedActiveShopIds,
      expectedMembershipFingerprint: session.expectedMembershipFingerprint,
      removalPreviews,
      requestId: session.requestId,
    };
    setSession((current) =>
      current.personId === session.personId && current.requestId === session.requestId
        ? { ...current, submittedInput: input }
        : current,
    );
    await onChangeMemberships(input);
  };

  const handleClose = () => {
    if (isChanging) return;
    onClose();
  };

  return (
    <Dialog
      title="所属店舗を変更"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={handleClose}
      onBackGuardRemoved={handleClose}
      onSubmit={submitChange}
      submitLabel="変更する"
      isLoading={isChanging}
      isSubmitDisabled={
        !isCurrentSession ||
        !data.canWrite ||
        !hasActiveShopContext ||
        !hasDiff ||
        hasTooManyAssignments ||
        !canSubmitFrozenIntent ||
        isChanging
      }
      preventClose={isChanging}
      mobileActionLayout="inline"
      mobileFullScreen
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
    >
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          シフトスタッフとして所属する店舗を選択してください。
          <br />
          店舗から外す場合、チェックを外してください。
        </Text>

        {globalDisabledReason && (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
            <Text id={globalDisabledReasonId} fontSize="sm" color="orange.800" lineHeight="tall">
              {globalDisabledReason}
            </Text>
          </Box>
        )}

        {isFingerprintDirty && (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
            <Text fontSize="sm" color="orange.800" lineHeight="tall">
              {session.submittedInput
                ? "表示中に所属店舗の状態が変わりました。前回の結果が不明な場合は同じ内容で再試行できます。内容を確認するには画面を再読み込みしてください。"
                : "表示中に所属店舗の状態が変わりました。画面を再読み込みしてから、もう一度お試しください。"}
            </Text>
          </Box>
        )}

        {visibleShopRows.length === 0 ? (
          <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" px={4} py={8} textAlign="center">
            <Text fontWeight="semibold" color="gray.900">
              店舗がありません
            </Text>
            <Text mt={1} fontSize="sm" color="fg.muted">
              所属を変更できる店舗が登録されていません。
            </Text>
          </Box>
        ) : (
          <CheckboxListCard ariaLabel="所属する店舗">
            {visibleShopRows.map((shop) => {
              const membership = membershipByShopId.get(shop.shopId);
              const isActive = shop.shopStatus === "active";
              const checked = isActive ? selectedActiveShopIdSet.has(shop.shopId) : Boolean(membership);
              const isRemoved = isActive && initialActiveShopIdSet.has(shop.shopId) && !checked;
              const removalImpactId = isRemoved ? `user-shop-membership-removal-impact-${shop.shopId}` : undefined;
              const disabledReason = globalDisabledReason ? undefined : getMembershipChangeDisabledReason(shop);
              const isDisabled = Boolean(globalDisabledReason || disabledReason) || isChanging;

              return (
                <CheckboxListCardItem
                  key={shop.shopId}
                  checked={checked}
                  disabled={isDisabled}
                  ariaLabel={shop.shopName}
                  ariaDescribedBy={[globalDisabledReasonId, removalImpactId].filter(Boolean).join(" ") || undefined}
                  disabledReason={disabledReason}
                  tone={isRemoved ? "danger" : "default"}
                  leading={
                    <Flex
                      boxSize="40px"
                      borderRadius="lg"
                      bg="teal.100"
                      color="teal.700"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      aria-hidden
                    >
                      <LuStore />
                    </Flex>
                  }
                  trailing={shop.shopStatus !== "active" && <ShopStatusBadge status={shop.shopStatus} />}
                  onCheckedChange={(nextChecked) => changeSelection(shop.shopId, nextChecked)}
                >
                  {isRemoved ? (
                    <MembershipRemovalImpact id={removalImpactId} heading={shop.shopName} badgeLabel="店舗から外す" />
                  ) : (
                    <Text fontWeight="medium" color="gray.900" lineHeight="short">
                      {shop.shopName}
                    </Text>
                  )}
                </CheckboxListCardItem>
              );
            })}
          </CheckboxListCard>
        )}

        {hasTooManyAssignments && (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
            <Text fontSize="sm" color="orange.800" fontWeight="semibold">
              今日以降のシフトが多いため、この画面では変更できません。
            </Text>
            <Text mt={1} fontSize="sm" color="orange.800">
              先にシフトを整理してから、もう一度お試しください。
            </Text>
          </Box>
        )}

        {removesActiveManagerFromShop && (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
            <Text fontSize="sm" color="orange.800" fontWeight="semibold">
              店舗通知を受け取る管理者を、各店舗に1名以上所属させることをおすすめします。
            </Text>
            <Text mt={1} fontSize="sm" color="orange.800" lineHeight="tall">
              外す店舗に所属する別の管理者がいない場合、その店舗のスタッフ参加申請・シフト確定の催促・通知エラーなどは送信されません。
            </Text>
          </Box>
        )}

        {removesAllMemberships && (
          <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
            <Text fontSize="sm" color="orange.800" fontWeight="semibold">
              全店舗から外した場合でも、無所属としてスタッフは残り続けます。
            </Text>
          </Box>
        )}
      </Stack>
    </Dialog>
  );
}

function createSession(data: UserDetailData): MembershipSession {
  const shops = data.shops.map((shop) => ({ ...shop }));
  const memberships = data.memberships.map((membership) => ({
    ...membership,
    removalPreview: { ...membership.removalPreview },
  }));
  const initialActiveShopIds = getActiveMembershipShopIds(shops, memberships);
  return {
    personId: data.person.id,
    shops,
    memberships,
    initialActiveShopIds,
    selectedActiveShopIds: initialActiveShopIds,
    expectedMembershipFingerprint: data.membershipFingerprint,
    requestId: crypto.randomUUID(),
    submittedInput: null,
  };
}

function getActiveMembershipShopIds(shops: UserDetailData["shops"], memberships: UserDetailData["memberships"]) {
  const activeMembershipShopIdSet = new Set(
    memberships.flatMap((membership) => (membership.shopStatus === "active" ? [membership.shopId] : [])),
  );
  return shops.flatMap((shop) =>
    shop.shopStatus === "active" && activeMembershipShopIdSet.has(shop.shopId) ? [shop.shopId] : [],
  );
}

function getMembershipChangeDisabledReason(shop: UserDetailData["shops"][number]) {
  if (shop.shopStatus !== "active") {
    return shop.membershipChangeDisabledReason ?? "稼働中の店舗だけ所属を変更できます。";
  }
  if (!shop.canChangeMembership) {
    return shop.membershipChangeDisabledReason ?? "この店舗の所属は変更できません。";
  }
  return undefined;
}

function ShopStatusBadge({ status }: { status: Exclude<UserDetailData["shops"][number]["shopStatus"], "active"> }) {
  return (
    <Badge colorPalette={status === "archived" ? "gray" : "orange"} variant="subtle" borderRadius="full" flexShrink={0}>
      {status === "archived" ? "アーカイブ済み" : "プラン停止中"}
    </Badge>
  );
}
