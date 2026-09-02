import { Alert, Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuStore } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { CheckboxListCard, CheckboxListCardItem } from "@/src/components/ui/CheckboxListCard";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserMembershipChangeInput } from "./types";

const MEMBERSHIP_REMOVAL_ASSIGNMENT_LIMIT = 500;

type MembershipSession = {
  personId: UserDetailData["person"]["id"];
  shops: UserDetailData["shops"];
  memberships: UserDetailData["memberships"];
  initialShopIds: Id<"shops">[];
  selectedShopIds: Id<"shops">[];
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
  const fallbackMembershipShopIds = getMembershipShopIds(data.shops, data.memberships);
  const initialShopIds = isCurrentSession ? session.initialShopIds : fallbackMembershipShopIds;
  const selectedShopIds = isCurrentSession ? session.selectedShopIds : fallbackMembershipShopIds;
  const initialShopIdSet = useMemo(() => new Set(initialShopIds), [initialShopIds]);
  const selectedShopIdSet = useMemo(() => new Set(selectedShopIds), [selectedShopIds]);
  const membershipByShopId = useMemo(
    () => new Map(visibleMemberships.map((membership) => [membership.shopId, membership])),
    [visibleMemberships],
  );
  const hasShopContext = visibleShops.length > 0;
  const globalDisabledReason = !data.canWrite
    ? (data.writeDisabledReason ?? "現在、この組織の所属店舗を変更できません。")
    : !hasShopContext
      ? "店舗がないため、所属店舗を変更できません。"
      : undefined;
  const globalDisabledReasonId = globalDisabledReason ? "user-shop-membership-change-disabled" : undefined;
  const addedShops = visibleShops.filter(
    (shop) => selectedShopIdSet.has(shop.shopId) && !initialShopIdSet.has(shop.shopId),
  );
  const removedShops = visibleShops.filter(
    (shop) => initialShopIdSet.has(shop.shopId) && !selectedShopIdSet.has(shop.shopId),
  );
  const removalImpactId = removedShops.length > 0 ? "user-shop-membership-removal-impact" : undefined;
  const removedMemberships = removedShops.flatMap((shop) => {
    const membership = membershipByShopId.get(shop.shopId);
    return membership ? [membership] : [];
  });
  const readyRemovalAssignmentCount = removedMemberships.reduce(
    (total, membership) =>
      membership.removalPreview.kind === "ready" ? total + membership.removalPreview.assignmentCount : total,
    0,
  );
  const hasTooManyAssignments =
    removedMemberships.some((membership) => membership.removalPreview.kind === "tooMany") ||
    readyRemovalAssignmentCount > MEMBERSHIP_REMOVAL_ASSIGNMENT_LIMIT;
  const hasDiff = addedShops.length > 0 || removedShops.length > 0;
  const removesAllMemberships = removedShops.length > 0 && selectedShopIds.length === 0;
  const isFingerprintDirty = isCurrentSession && data.membershipFingerprint !== session.expectedMembershipFingerprint;
  const canSubmitFrozenIntent = !isFingerprintDirty || Boolean(session.submittedInput);

  const changeSelection = (shopId: Id<"shops">, checked: boolean) => {
    if (isChanging) return;
    setSession((current) => {
      if (current.personId !== data.person.id) return current;
      const selected = new Set(current.selectedShopIds);
      if (checked === selected.has(shopId)) return current;
      if (checked) selected.add(shopId);
      else selected.delete(shopId);
      return {
        ...current,
        selectedShopIds: current.shops.flatMap((shop) => (selected.has(shop.shopId) ? [shop.shopId] : [])),
        requestId: crypto.randomUUID(),
        submittedInput: null,
      };
    });
  };

  const submitChange = async () => {
    if (
      !isCurrentSession ||
      !data.canWrite ||
      !hasShopContext ||
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
    const authorizationShop = visibleShops.find((shop) => diffShopIds.includes(shop.shopId)) ?? visibleShops[0];
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
      desiredActiveShopIds: selectedShopIds,
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
        !hasShopContext ||
        !hasDiff ||
        hasTooManyAssignments ||
        !canSubmitFrozenIntent ||
        isChanging
      }
      preventClose={isChanging}
      mobileFullScreen
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
    >
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          スタッフとして所属する店舗を選択してください。
        </Text>

        {globalDisabledReason && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description id={globalDisabledReasonId}>{globalDisabledReason}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {isFingerprintDirty && (
          <Alert.Root status="warning" borderRadius="lg" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                {session.submittedInput
                  ? "表示中に所属店舗の状態が変わりました。前回の結果が不明な場合は同じ内容で再試行できます。内容を確認するには画面を再読み込みしてください。"
                  : "表示中に所属店舗の状態が変わりました。画面を再読み込みしてから、もう一度お試しください。"}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {visibleShops.length === 0 ? (
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
            {visibleShops.map((shop) => {
              const checked = selectedShopIdSet.has(shop.shopId);
              const isRemoved = initialShopIdSet.has(shop.shopId) && !checked;
              const isAdded = checked && !initialShopIdSet.has(shop.shopId);
              const disabledReason = globalDisabledReason ? undefined : getMembershipChangeDisabledReason(shop);
              const isDisabled = Boolean(globalDisabledReason || disabledReason) || isChanging;

              return (
                <CheckboxListCardItem
                  key={shop.shopId}
                  checked={checked}
                  disabled={isDisabled}
                  ariaLabel={shop.shopName}
                  ariaDescribedBy={
                    [globalDisabledReasonId, isRemoved ? removalImpactId : undefined].filter(Boolean).join(" ") ||
                    undefined
                  }
                  disabledReason={disabledReason}
                  tone={isRemoved ? "danger" : "default"}
                  hoverBg="teal.50"
                  leading={
                    <Flex
                      boxSize="40px"
                      borderRadius="lg"
                      bg="teal.50"
                      color="teal.700"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      aria-hidden
                    >
                      <LuStore />
                    </Flex>
                  }
                  onCheckedChange={(nextChecked) => changeSelection(shop.shopId, nextChecked)}
                >
                  <Flex align="center" gap={2} wrap="wrap">
                    <Text fontWeight="medium" color="gray.900" lineHeight="short" overflowWrap="anywhere">
                      {shop.shopName}
                    </Text>
                    {isRemoved ? (
                      <Badge colorPalette="red" variant="outline" borderRadius="md" px={2} py={0.5}>
                        店舗から外す
                      </Badge>
                    ) : isAdded ? (
                      <Badge colorPalette="blue" variant="outline" borderRadius="md" px={2} py={0.5}>
                        店舗に追加
                      </Badge>
                    ) : null}
                  </Flex>
                </CheckboxListCardItem>
              );
            })}
          </CheckboxListCard>
        )}

        {removalImpactId && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content id={removalImpactId}>
              <Alert.Title>店舗から外れるスタッフがいます</Alert.Title>
              <Alert.Description>
                店舗から外れると、今日以降のシフトから削除されます。
                <br />
                また、外した店舗のシフト通知は届かなくなります。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {hasTooManyAssignments && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>今日以降のシフトが多いため、この画面では変更できません</Alert.Title>
              <Alert.Description>先にシフトを整理してください。</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {removesAllMemberships && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>変更後、このスタッフの所属店舗は0店舗になります</Alert.Title>
              <Alert.Description>組織への所属や利用人数のカウントは残ります。</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {addedShops.length > 0 && (
          <Alert.Root status="info" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>追加した店舗の募集中シフトを、このスタッフへ送信します。</Alert.Title>
            </Alert.Content>
          </Alert.Root>
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
  const initialShopIds = getMembershipShopIds(shops, memberships);
  return {
    personId: data.person.id,
    shops,
    memberships,
    initialShopIds,
    selectedShopIds: initialShopIds,
    expectedMembershipFingerprint: data.membershipFingerprint,
    requestId: crypto.randomUUID(),
    submittedInput: null,
  };
}

function getMembershipShopIds(shops: UserDetailData["shops"], memberships: UserDetailData["memberships"]) {
  const membershipShopIdSet = new Set(memberships.map((membership) => membership.shopId));
  return shops.flatMap((shop) => (membershipShopIdSet.has(shop.shopId) ? [shop.shopId] : []));
}

function getMembershipChangeDisabledReason(shop: UserDetailData["shops"][number]) {
  if (!shop.canChangeMembership) {
    return shop.membershipChangeDisabledReason ?? "この店舗の所属は変更できません。";
  }
  return undefined;
}
