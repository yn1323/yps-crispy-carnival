import { Badge, Box, Checkbox, Flex, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuStore } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
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
  const [isRemovalConfirmationOpen, setIsRemovalConfirmationOpen] = useState(false);

  useEffect(() => {
    const previous = openStateRef.current;
    if (isOpen && (!previous.isOpen || previous.personId !== data.person.id)) {
      setSession(createSession(dataRef.current));
      setIsRemovalConfirmationOpen(false);
    } else if (!isOpen && previous.isOpen) {
      setIsRemovalConfirmationOpen(false);
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
    setIsRemovalConfirmationOpen(false);
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

  const handleSubmit = async () => {
    if (removedShops.length > 0) {
      setIsRemovalConfirmationOpen(true);
      return;
    }
    await submitChange();
  };

  const handleClose = () => {
    if (isChanging) return;
    setIsRemovalConfirmationOpen(false);
    onClose();
  };

  return (
    <>
      <Dialog
        title="所属店舗を変更"
        isOpen={isOpen}
        onOpenChange={(details) => {
          if (!details.open) setIsRemovalConfirmationOpen(false);
          onOpenChange(details);
        }}
        onClose={handleClose}
        onBackGuardRemoved={handleClose}
        onSubmit={handleSubmit}
        submitLabel="変更する"
        isLoading={isChanging}
        isSubmitDisabled={
          !isCurrentSession ||
          !data.canWrite ||
          !hasActiveShopContext ||
          !hasDiff ||
          !canSubmitFrozenIntent ||
          isChanging
        }
        preventClose={isChanging}
        maxW={{ base: "100vw", lg: "640px" }}
        maxH={{ base: "100dvh", lg: "86dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
        bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
      >
        <Stack gap={4}>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            シフトスタッフとして所属する店舗を選択してください。
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
            <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
              <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
                {visibleShopRows.map((shop) => {
                  const membership = membershipByShopId.get(shop.shopId);
                  const isActive = shop.shopStatus === "active";
                  const checked = isActive ? selectedActiveShopIdSet.has(shop.shopId) : Boolean(membership);
                  const disabledReason = globalDisabledReason ? undefined : getMembershipChangeDisabledReason(shop);
                  const isDisabled = Boolean(globalDisabledReason || disabledReason) || isChanging;
                  const reasonId =
                    globalDisabledReasonId ??
                    (disabledReason ? `membership-change-disabled-${shop.shopId}` : undefined);

                  return (
                    <Checkbox.Root
                      key={shop.shopId}
                      colorPalette="teal"
                      checked={checked}
                      disabled={isDisabled}
                      display="flex"
                      w="full"
                      alignItems="center"
                      gap={3}
                      px={{ base: 3, lg: 4 }}
                      py={3.5}
                      minH="72px"
                      bg="white"
                      transition="background-color 150ms ease"
                      cursor={isDisabled ? "not-allowed" : "pointer"}
                      _hover={isDisabled ? undefined : { bg: "teal.50" }}
                      onCheckedChange={(details) => changeSelection(shop.shopId, details.checked === true)}
                    >
                      <Checkbox.HiddenInput aria-describedby={reasonId} />
                      <Checkbox.Control
                        flexShrink={0}
                        bg="white"
                        borderColor="gray.300"
                        cursor={isDisabled ? "not-allowed" : "pointer"}
                        _checked={{ bg: "teal.500", borderColor: "teal.500" }}
                      />
                      <Checkbox.Label
                        flex={1}
                        minW={0}
                        cursor={isDisabled ? "not-allowed" : "pointer"}
                        opacity={isDisabled ? 0.75 : 1}
                      >
                        <Flex align="center" gap={3} minW={0}>
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
                          <Text flex={1} minW={0} fontWeight="medium" color="gray.900" truncate>
                            {shop.shopName}
                          </Text>
                          {shop.shopStatus !== "active" && <ShopStatusBadge status={shop.shopStatus} />}
                        </Flex>
                        {disabledReason && (
                          <Text id={reasonId} mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
                            {disabledReason}
                          </Text>
                        )}
                      </Checkbox.Label>
                    </Checkbox.Root>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Stack>
      </Dialog>

      {isRemovalConfirmationOpen && (
        <Dialog
          title="所属店舗の変更を確認"
          isOpen
          role="alertdialog"
          submitLabel="変更する"
          submitColorPalette="red"
          closeLabel="戻る"
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
          onOpenChange={({ open }) => {
            if (!open && !isChanging) setIsRemovalConfirmationOpen(false);
          }}
          onClose={() => {
            if (!isChanging) setIsRemovalConfirmationOpen(false);
          }}
          onSubmit={submitChange}
          maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
          maxH={{ base: "calc(100dvh - 24px)", md: "86dvh" }}
        >
          <Stack gap={4} fontSize="sm" color="fg.muted" lineHeight="tall">
            <Text fontWeight="semibold" color="gray.900">
              {data.person.name}さんの所属店舗を変更しますか？
            </Text>

            {isFingerprintDirty && (
              <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
                <Text color="orange.800">
                  {session.submittedInput
                    ? "表示中に所属店舗の状態が変わりました。前回の結果が不明な場合は同じ内容で再試行できます。内容を確認するには画面を再読み込みしてください。"
                    : "表示中に所属店舗の状態が変わりました。画面を再読み込みしてから、もう一度お試しください。"}
                </Text>
              </Box>
            )}

            {addedShops.length > 0 && <ShopChangeList title="追加する店舗" shops={addedShops} />}

            <Stack gap={2}>
              <Text fontWeight="semibold" color="gray.900">
                外す店舗
              </Text>
              <Box as="ul" ps={5}>
                {removedMemberships.map((membership) => (
                  <Text as="li" key={membership.shopId}>
                    {membership.shopName}（{formatRemovalAssignmentCount(membership.removalPreview)}）
                  </Text>
                ))}
              </Box>
            </Stack>

            {hasTooManyAssignments && (
              <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
                <Text color="orange.800" fontWeight="semibold">
                  今日以降のシフトが多いため、この画面では変更できません。
                </Text>
                <Text mt={1} color="orange.800">
                  先にシフトを整理してから、もう一度お試しください。
                </Text>
              </Box>
            )}

            <Box bg="red.50" borderWidth="1px" borderColor="red.200" borderRadius="lg" px={3} py={2.5}>
              <Stack gap={1.5} color="red.800">
                <Text fontWeight="semibold">
                  店舗から外すと、その店舗のスタッフ画面へのアクセス、LINE連携、未送信の通知は終了します。
                </Text>
                <Text>表示した本日以降のシフト割り当ては削除されます。</Text>
                <Text>過去のシフト記録は保持されます。</Text>
              </Stack>
            </Box>

            {removesAllMemberships && (
              <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={3} py={2.5}>
                <Text color="orange.800" fontWeight="semibold">
                  組織への所属や管理者権限は変更されません。また、利用人数のカウントも残ります。
                </Text>
              </Box>
            )}
          </Stack>
        </Dialog>
      )}
    </>
  );
}

function createSession(data: UserDetailData): MembershipSession {
  const shops = data.shops.map((shop) => ({ ...shop }));
  const memberships = data.memberships.map((membership) => ({
    ...membership,
    removalPreview: { ...membership.removalPreview },
    line: { ...membership.line },
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

function ShopChangeList({ title, shops }: { title: string; shops: UserDetailData["shops"] }) {
  return (
    <Stack gap={2}>
      <Text fontWeight="semibold" color="gray.900">
        {title}
      </Text>
      <Box as="ul" ps={5}>
        {shops.map((shop) => (
          <Text as="li" key={shop.shopId}>
            {shop.shopName}
          </Text>
        ))}
      </Box>
    </Stack>
  );
}

function formatRemovalAssignmentCount(preview: UserDetailData["memberships"][number]["removalPreview"]) {
  if (preview.kind === "tooMany") return `今日以降のシフト ${preview.assignmentCountAtLeast}件以上`;
  return `今日以降のシフト ${preview.assignmentCount}件`;
}
