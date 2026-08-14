import { Alert, Badge, Box, Flex, Skeleton, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuUser } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { MembershipRemovalImpact } from "@/src/components/shared/MembershipRemovalImpact";
import { Button } from "@/src/components/ui/Button";
import { CheckboxListCard, CheckboxListCardItem } from "@/src/components/ui/CheckboxListCard";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import type { ShopDetailData, ShopStaffMembershipChangeInput, ShopStaffMembershipData } from "./types";
import {
  buildShopStaffRemovalPreviewKey,
  type ShopStaffMembershipRemovalPreviewState,
  type ShopStaffMembershipSubmitResult,
  useShopStaffMembershipController,
} from "./useShopStaffMembershipController";

type MembershipPerson = ShopStaffMembershipData["people"][number];
type ShopId = NonNullable<ShopStaffMembershipChangeInput["shopId"]>;

type MembershipSession = {
  shopId: string;
  people: ShopStaffMembershipData["people"];
  preservedStaffs: ShopStaffMembershipData["preservedStaffs"];
  initialSelectedPersonIds: MembershipPerson["personId"][];
  selectedPersonIds: MembershipPerson["personId"][];
  expectedMembershipFingerprint: string;
  requestId: string;
  submittedInput: ShopStaffMembershipChangeInput | null;
};

export type ShopStaffMembershipDialogController = {
  data: ShopStaffMembershipData | null | undefined;
  removalPreviewState: ShopStaffMembershipRemovalPreviewState;
  isChanging: boolean;
  errorMessage?: string;
  ensureRemovalPreview: (personIds: MembershipPerson["personId"][], expectedMembershipFingerprint: string) => boolean;
  clearRemovalPreview: () => void;
  clearError: () => void;
  submitChange: (input: ShopStaffMembershipChangeInput) => Promise<ShopStaffMembershipSubmitResult | undefined>;
};

type DialogProps = {
  shopId: string;
  shopName: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  controller: ShopStaffMembershipDialogController;
};

export function ConnectedShopStaffMembershipDialog({
  shop,
  expectedOrganizationId,
  isOpen,
  onOpenChange,
  onClose,
}: {
  shop: ShopDetailData;
  expectedOrganizationId?: Id<"organizations">;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
}) {
  const controller = useShopStaffMembershipController({
    shopId: shop.id as ShopId,
    expectedOrganizationId,
    isOpen,
    onSucceeded: onClose,
  });

  return (
    <ShopStaffMembershipDialog
      shopId={shop.id}
      shopName={shop.name}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      controller={controller}
    />
  );
}

export function ShopStaffMembershipDialog({
  shopId,
  shopName,
  isOpen,
  onOpenChange,
  onClose,
  controller,
}: DialogProps) {
  const [session, setSession] = useState<MembershipSession | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasFocusedEditableCheckboxRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setSession(null);
      return;
    }
    if (controller.data && session?.shopId !== shopId) {
      setSession(createSession(shopId, controller.data));
    }
  }, [controller.data, isOpen, session?.shopId, shopId]);

  useEffect(() => {
    if (!isOpen) {
      hasFocusedEditableCheckboxRef.current = false;
      return;
    }
    if (!session || hasFocusedEditableCheckboxRef.current) return;
    hasFocusedEditableCheckboxRef.current = true;

    const focusFirstEditableCheckbox = () =>
      contentRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')?.focus();
    if (typeof window.requestAnimationFrame !== "function") {
      focusFirstEditableCheckbox();
      return;
    }
    const frameId = window.requestAnimationFrame(focusFirstEditableCheckbox);
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, session]);

  const selectedPersonIdSet = useMemo(() => new Set(session?.selectedPersonIds ?? []), [session?.selectedPersonIds]);
  const initialSelectedPersonIdSet = useMemo(
    () => new Set(session?.initialSelectedPersonIds ?? []),
    [session?.initialSelectedPersonIds],
  );
  const { addedPeople, removedPeople } = useMemo(() => {
    if (!session) return { addedPeople: [], removedPeople: [] };
    return {
      addedPeople: session.people.filter(
        (person) => selectedPersonIdSet.has(person.personId) && !initialSelectedPersonIdSet.has(person.personId),
      ),
      removedPeople: session.people.filter(
        (person) => initialSelectedPersonIdSet.has(person.personId) && !selectedPersonIdSet.has(person.personId),
      ),
    };
  }, [initialSelectedPersonIdSet, selectedPersonIdSet, session]);
  const removedPersonIds = useMemo(() => removedPeople.map((person) => person.personId), [removedPeople]);
  const hasDiff = addedPeople.length > 0 || removedPeople.length > 0;
  const isStale = Boolean(
    session && controller.data && controller.data.membershipFingerprint !== session.expectedMembershipFingerprint,
  );
  const canSubmitFrozenIntent = !isStale || Boolean(session?.submittedInput);
  const isIntentFrozen = Boolean(session?.submittedInput);
  const globalDisabledReason = controller.data
    ? controller.data.canWrite
      ? undefined
      : (controller.data.writeDisabledReason ?? "現在、この店舗の所属スタッフを変更できません。")
    : undefined;
  const globalDisabledReasonId = globalDisabledReason ? "shop-staff-membership-change-disabled" : undefined;
  const staleReasonId = isStale ? "shop-staff-membership-change-stale" : undefined;
  const listDisabledReasonIds = [globalDisabledReasonId, staleReasonId].filter(Boolean).join(" ") || undefined;
  const removesAllEditableStaff = Boolean(
    removedPeople.length > 0 && session?.selectedPersonIds.length === 0 && session.preservedStaffs.length === 0,
  );
  const removesLastManagerNotificationRecipient = Boolean(
    removedPeople.some((person) => person.isActiveManager && person.email.trim().length > 0) &&
      !session?.people.some(
        (person) =>
          person.isActiveManager && person.email.trim().length > 0 && selectedPersonIdSet.has(person.personId),
      ),
  );
  const currentRemovalPreviewKey = useMemo(
    () =>
      session && removedPersonIds.length > 0
        ? buildShopStaffRemovalPreviewKey(removedPersonIds, session.expectedMembershipFingerprint)
        : null,
    [removedPersonIds, session],
  );
  const currentRemovalPreviewState =
    currentRemovalPreviewKey &&
    controller.removalPreviewState.kind !== "idle" &&
    controller.removalPreviewState.key === currentRemovalPreviewKey
      ? controller.removalPreviewState
      : null;
  const previewReady = currentRemovalPreviewState?.kind === "ready" ? currentRemovalPreviewState.preview : null;
  const previewTooMany = currentRemovalPreviewState?.kind === "tooMany";
  const isPreviewLoading = currentRemovalPreviewState?.kind === "loading";

  useEffect(() => {
    if (!isOpen || !session || !controller.data?.canWrite || isStale || isIntentFrozen) return;
    if (!currentRemovalPreviewKey) {
      if (controller.removalPreviewState.kind !== "idle") controller.clearRemovalPreview();
      return;
    }
    controller.ensureRemovalPreview(removedPersonIds, session.expectedMembershipFingerprint);
  }, [
    controller.clearRemovalPreview,
    controller.data?.canWrite,
    controller.ensureRemovalPreview,
    controller.removalPreviewState.kind,
    currentRemovalPreviewKey,
    isIntentFrozen,
    isOpen,
    isStale,
    removedPersonIds,
    session,
  ]);

  const changeSelection = (personId: MembershipPerson["personId"], checked: boolean) => {
    if (controller.isChanging || isStale || isIntentFrozen) return;
    setSession((current) => {
      if (!current || current.shopId !== shopId) return current;
      const selected = new Set(current.selectedPersonIds);
      if (checked === selected.has(personId)) return current;
      if (checked) selected.add(personId);
      else selected.delete(personId);
      return {
        ...current,
        selectedPersonIds: current.people.flatMap((person) => (selected.has(person.personId) ? [person.personId] : [])),
        requestId: crypto.randomUUID(),
        submittedInput: null,
      };
    });
    controller.clearRemovalPreview();
    controller.clearError();
  };

  const submitInput = useCallback(
    async (removalPreviews: ShopStaffMembershipChangeInput["removalPreviews"]) => {
      if (!session || !controller.data?.canWrite || !hasDiff || !canSubmitFrozenIntent) return;
      if (session.submittedInput) {
        const result = await controller.submitChange(session.submittedInput);
        if (result === "rejected") {
          setSession((current) =>
            current?.shopId === session.shopId && current.requestId === session.requestId
              ? { ...current, submittedInput: null }
              : current,
          );
          if (session.submittedInput.removalPreviews.length > 0) {
            controller.clearRemovalPreview();
          }
        }
        return;
      }

      const input: ShopStaffMembershipChangeInput = {
        shopId: shopId as ShopStaffMembershipChangeInput["shopId"],
        desiredActivePersonIds: session.selectedPersonIds,
        expectedMembershipFingerprint: session.expectedMembershipFingerprint,
        removalPreviews,
        requestId: session.requestId,
      };
      const result = await controller.submitChange(input);
      if (result === "rejected" && input.removalPreviews.length > 0) {
        controller.clearRemovalPreview();
        return;
      }
      if (result !== "unknown") return;
      setSession((current) =>
        current?.shopId === session.shopId && current.requestId === session.requestId
          ? { ...current, submittedInput: input }
          : current,
      );
    },
    [canSubmitFrozenIntent, controller, hasDiff, session, shopId],
  );

  const handleSubmit = async () => {
    if (!session || !hasDiff || !controller.data?.canWrite) return;
    if (session.submittedInput) {
      await submitInput(session.submittedInput.removalPreviews);
      return;
    }
    if (isStale) return;
    if (removedPeople.length > 0) {
      if (!previewReady) return;
      await submitInput(previewReady.removals);
      return;
    }
    await submitInput([]);
  };

  const isLoading = controller.data === undefined || (controller.data !== null && session === null);
  const isRemovalPreviewReady = removedPeople.length === 0 || Boolean(previewReady) || isIntentFrozen;
  const isSubmitDisabled =
    isLoading ||
    controller.data === null ||
    !session ||
    !controller.data?.canWrite ||
    !hasDiff ||
    !canSubmitFrozenIntent ||
    previewTooMany ||
    !isRemovalPreviewReady ||
    controller.isChanging;

  const closeMainDialog = () => {
    if (controller.isChanging) return;
    controller.clearRemovalPreview();
    controller.clearError();
    onClose();
  };

  return (
    <Dialog
      title="所属スタッフを変更"
      isOpen={isOpen}
      onOpenChange={(details) => {
        if (!details.open) closeMainDialog();
        else onOpenChange(details);
      }}
      onClose={closeMainDialog}
      onBackGuardRemoved={closeMainDialog}
      preventClose={controller.isChanging}
      onSubmit={handleSubmit}
      submitLabel="変更する"
      isLoading={controller.isChanging}
      isSubmitDisabled={isSubmitDisabled}
      mobileActionLayout="inline"
      mobileFullScreen
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
    >
      <Stack ref={contentRef} gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {shopName}のシフトスタッフを選択してください。管理者権限と、ほかの店舗への所属は変更されません。
        </Text>

        {globalDisabledReason && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description id={globalDisabledReasonId}>{globalDisabledReason}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {isStale && (
          <Alert.Root status="warning" borderRadius="lg" role="alert">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description id={staleReasonId}>
                {session?.submittedInput
                  ? "表示中に所属状態が変わりました。前回の結果が不明な場合は、同じ内容で再試行できます。内容を確認するには画面を再読み込みしてください。"
                  : "表示中に所属状態が変わりました。画面を再読み込みしてから、もう一度お試しください。"}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {controller.errorMessage && <InlineError message={controller.errorMessage} />}

        {isLoading ? (
          <MembershipListSkeleton />
        ) : controller.data === null ? (
          <InlineError message="所属スタッフを読み込めませんでした。画面を再読み込みしてください。" />
        ) : session && session.people.length + session.preservedStaffs.length === 0 ? (
          <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" px={4} py={8} textAlign="center">
            <Text fontWeight="semibold" color="gray.900">
              選択できるスタッフがいません
            </Text>
            <Text mt={1} fontSize="sm" color="fg.muted">
              先に組織設定からスタッフを登録してください。
            </Text>
          </Box>
        ) : session ? (
          <CheckboxListCard ariaLabel={`${shopName}の所属スタッフ`}>
            {session.people.map((person) => {
              const disabledReason = globalDisabledReason ? null : person.changeDisabledReason;
              const personContextId = `shop-staff-membership-person-context-${person.personId}`;
              const membershipShopNames = person.isSelected
                ? [shopName, ...person.otherShopNames]
                : person.otherShopNames;
              const membershipDescription =
                membershipShopNames.length > 0 ? `所属：${membershipShopNames.join("、")}` : "所属：なし";
              const isRemoved =
                initialSelectedPersonIdSet.has(person.personId) && !selectedPersonIdSet.has(person.personId);
              const isFirstRemoved = removedPeople[0]?.personId === person.personId;
              const removalImpactId = isRemoved ? `shop-staff-membership-removal-impact-${person.personId}` : undefined;
              const isDisabled =
                Boolean(globalDisabledReason) ||
                !person.canChange ||
                controller.isChanging ||
                isStale ||
                isIntentFrozen;
              return (
                <CheckboxListCardItem
                  key={person.personId}
                  checked={selectedPersonIdSet.has(person.personId)}
                  disabled={isDisabled}
                  ariaLabel={`${person.name}を所属スタッフにする`}
                  ariaDescribedBy={[listDisabledReasonIds, personContextId, removalImpactId].filter(Boolean).join(" ")}
                  disabledReason={disabledReason}
                  tone={isRemoved ? "danger" : "default"}
                  hoverBg="teal.50"
                  onCheckedChange={(checked) => changeSelection(person.personId, checked)}
                  leading={<PersonAvatar name={person.name} isManager={person.isManager} />}
                  trailing={
                    person.isManager ? (
                      <Badge
                        colorPalette="teal"
                        variant="subtle"
                        bg="teal.100"
                        borderRadius="full"
                        px={2}
                        textStyle="2xs"
                      >
                        管理者
                      </Badge>
                    ) : undefined
                  }
                >
                  <Stack gap={0.5} minW={0}>
                    <VisuallyHidden id={personContextId}>
                      {person.isManager ? "管理者。" : "スタッフ。"}
                      {`${membershipDescription}。`}
                    </VisuallyHidden>
                    {isRemoved ? (
                      <MembershipRemovalImpact
                        id={removalImpactId}
                        heading={person.name}
                        description={membershipDescription}
                        badgeLabel="この店舗から外す"
                        statusMessage={isFirstRemoved && isPreviewLoading ? "変更内容を確認しています…" : undefined}
                      />
                    ) : (
                      <>
                        <Text fontWeight="medium" color="gray.900" lineHeight="short" overflowWrap="anywhere">
                          {person.name}
                        </Text>
                        <Text fontSize="xs" color="fg.subtle" overflowWrap="anywhere">
                          {membershipDescription}
                        </Text>
                      </>
                    )}
                  </Stack>
                </CheckboxListCardItem>
              );
            })}
            {session.preservedStaffs.map((staff) => (
              <CheckboxListCardItem
                key={staff.staffId}
                checked
                disabled
                ariaLabel={`${staff.name}は所属スタッフです`}
                disabledReason={staff.changeDisabledReason}
                onCheckedChange={() => {}}
                leading={<PersonAvatar name={staff.name} isManager={false} />}
              >
                <Stack gap={0.5} minW={0}>
                  <Text fontWeight="medium" color="gray.900" lineHeight="short" overflowWrap="anywhere">
                    {staff.name}
                  </Text>
                </Stack>
              </CheckboxListCardItem>
            ))}
          </CheckboxListCard>
        ) : null}

        {previewTooMany && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>今日以降のシフトが多いため、この画面では変更できません</Alert.Title>
              <Alert.Description>先にシフトを整理してください。</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {removesAllEditableStaff && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>変更後、この店舗のスタッフは0名になります</Alert.Title>
              <Alert.Description>
                組織への所属や管理者権限は変更されません。また、利用人数のカウントも残ります。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {removesLastManagerNotificationRecipient && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>変更後、この店舗の管理通知は送信されません</Alert.Title>
              <Alert.Description>
                通知が必要な場合は、有効な管理者を1名以上、この店舗の所属スタッフに残してください。管理者権限自体は変更されません。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {addedPeople.length > 0 && (
          <Alert.Root status="info" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                シフト提出に必要な案内を予約します。LINE未連携の場合だけ、組織共通の連携案内も送ります。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Stack>
    </Dialog>
  );
}

export function ShopStaffMembershipDialogError({
  isOpen,
  onOpenChange,
  onClose,
}: {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="所属スタッフを変更"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      closeLabel="閉じる"
      footer={
        <DialogActionArea
          layout="standard"
          mobileLayout="stacked"
          startAction={
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          }
          endAction={
            <Button colorPalette="teal" onClick={() => window.location.reload()}>
              ページを再読み込みする
            </Button>
          }
        />
      }
      mobileFullScreen
    >
      <Stack gap={4} minH="220px" align="stretch" justify="center">
        <InlineError message="所属スタッフを読み込めませんでした。通信状態を確認してページを再読み込みしてください。" />
      </Stack>
    </Dialog>
  );
}

function createSession(shopId: string, data: ShopStaffMembershipData): MembershipSession {
  const people = data.people.map((person) => ({
    ...person,
    otherShopNames: [...person.otherShopNames],
  }));
  return {
    shopId,
    people,
    preservedStaffs: data.preservedStaffs.map((staff) => ({ ...staff })),
    initialSelectedPersonIds: people.flatMap((person) => (person.isSelected ? [person.personId] : [])),
    selectedPersonIds: people.flatMap((person) => (person.isSelected ? [person.personId] : [])),
    expectedMembershipFingerprint: data.membershipFingerprint,
    requestId: crypto.randomUUID(),
    submittedInput: null,
  };
}

function PersonAvatar({ name, isManager }: { name: string; isManager: boolean }) {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg={isManager ? "teal.500" : "teal.100"}
      color={isManager ? "white" : "teal.700"}
      align="center"
      justify="center"
      fontWeight="semibold"
      fontSize="sm"
      flexShrink={0}
      aria-hidden
    >
      {name.trim().charAt(0) || <LuUser />}
    </Flex>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <Alert.Root status="error" borderRadius="lg" role="alert">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description whiteSpace="pre-line">{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

function MembershipListSkeleton() {
  return (
    <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden" aria-busy>
      {Array.from({ length: 3 }, (_, index) => (
        <Flex key={index} gap={3} px={{ base: 3, lg: 4 }} py={3.5} minH="72px" align="center">
          <Skeleton boxSize="20px" borderRadius="sm" />
          <Skeleton boxSize="40px" borderRadius="full" />
          <Stack gap={2} flex={1}>
            <Skeleton h="18px" w="128px" />
            <Skeleton h="14px" w="72%" />
          </Stack>
        </Flex>
      ))}
    </Stack>
  );
}
