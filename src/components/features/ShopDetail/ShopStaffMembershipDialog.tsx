import { Alert, Badge, Box, Flex, Skeleton, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuUser } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { CheckboxListCard, CheckboxListCardItem } from "@/src/components/ui/CheckboxListCard";
import { Dialog } from "@/src/components/ui/Dialog";
import type {
  ShopDetailData,
  ShopStaffMembershipChangeInput,
  ShopStaffMembershipData,
  ShopStaffMembershipRemovalPreview,
} from "./types";
import {
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
  removalPreview: ShopStaffMembershipRemovalPreview | null | undefined;
  isPreviewLoading: boolean;
  isChanging: boolean;
  errorMessage?: string;
  requestRemovalPreview: (personIds: MembershipPerson["personId"][], expectedMembershipFingerprint: string) => boolean;
  clearPreview: () => void;
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
  isOpen,
  onOpenChange,
  onClose,
}: {
  shop: ShopDetailData;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
}) {
  const controller = useShopStaffMembershipController({
    shopId: shop.id as ShopId,
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
  const submittedPreviewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSession(null);
      submittedPreviewKeyRef.current = null;
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
  const addedPeople =
    session?.people.filter(
      (person) => selectedPersonIdSet.has(person.personId) && !initialSelectedPersonIdSet.has(person.personId),
    ) ?? [];
  const removedPeople =
    session?.people.filter(
      (person) => initialSelectedPersonIdSet.has(person.personId) && !selectedPersonIdSet.has(person.personId),
    ) ?? [];
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
  const previewReady = controller.removalPreview?.kind === "ready" ? controller.removalPreview : null;
  const previewTooMany = controller.removalPreview?.kind === "tooMany" ? controller.removalPreview : null;

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
    controller.clearPreview();
    controller.clearError();
    submittedPreviewKeyRef.current = null;
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
            controller.clearPreview();
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
        controller.clearPreview();
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
      submittedPreviewKeyRef.current = null;
      controller.requestRemovalPreview(
        removedPeople.map((person) => person.personId),
        session.expectedMembershipFingerprint,
      );
      return;
    }
    await submitInput([]);
  };

  const previewKey = previewReady ? JSON.stringify(previewReady.removals) : null;

  const closeMainDialog = () => {
    if (controller.isChanging || controller.isPreviewLoading) return;
    submittedPreviewKeyRef.current = null;
    controller.clearPreview();
    controller.clearError();
    onClose();
  };

  const isLoading = controller.data === undefined || (controller.data !== null && session === null);
  const isBusy = controller.isChanging || controller.isPreviewLoading;
  const isSubmitDisabled =
    isLoading ||
    controller.data === null ||
    !session ||
    !controller.data?.canWrite ||
    !hasDiff ||
    !canSubmitFrozenIntent ||
    Boolean(previewTooMany) ||
    isBusy;

  useEffect(() => {
    if (
      !isOpen ||
      !session ||
      !previewReady ||
      !previewKey ||
      removedPeople.length === 0 ||
      session.submittedInput ||
      isStale ||
      isBusy ||
      submittedPreviewKeyRef.current === previewKey
    ) {
      return;
    }

    submittedPreviewKeyRef.current = previewKey;
    void submitInput(previewReady.removals);
  }, [isBusy, isOpen, isStale, previewKey, previewReady, removedPeople.length, session, submitInput]);

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
      preventClose={isBusy}
      footer={
        <>
          <Button variant="outline" disabled={isBusy} onClick={closeMainDialog}>
            キャンセル
          </Button>
          <Button colorPalette="teal" loading={isBusy} disabled={isSubmitDisabled} onClick={handleSubmit}>
            変更する
          </Button>
        </>
      }
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
                  ariaDescribedBy={[listDisabledReasonIds, personContextId].filter(Boolean).join(" ")}
                  disabledReason={disabledReason}
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
                      {person.otherShopNames.length > 0
                        ? `所属：${person.otherShopNames.join("、")}。`
                        : "所属：なし。"}
                    </VisuallyHidden>
                    <Text fontWeight="medium" color="gray.900" lineHeight="short" overflowWrap="anywhere">
                      {person.name}
                    </Text>
                    <Text fontSize="xs" color="fg.subtle" overflowWrap="anywhere">
                      {person.otherShopNames.length > 0 ? `所属：${person.otherShopNames.join("、")}` : "所属：なし"}
                    </Text>
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

        {session && session.people.length > 0 && (
          <Alert.Root status="error" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>スタッフを外すと起きること</Alert.Title>
              <Alert.Description>
                スタッフ画面へのアクセス、LINE連携、未送信の通知は終了します。今日以降のシフト割り当ては削除されますが、過去のシフト記録は保持されます。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        {previewTooMany && (
          <Alert.Root status="warning" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>今日以降のシフトが多いため、この画面では変更できません</Alert.Title>
              <Alert.Description>
                {previewTooMany.assignmentCountAtLeast}件以上の割り当てがあります。先にシフトを整理してください。
              </Alert.Description>
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

        {addedPeople.length > 0 && (
          <Alert.Root status="info" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                追加したスタッフには、シフト提出やLINE連携に必要な案内を予約します。
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
      maxW={{ base: "100vw", lg: "640px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "auto" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
    >
      <Stack gap={4} minH="220px" align="stretch" justify="center">
        <InlineError message="所属スタッフを読み込めませんでした。通信状態を確認してページを再読み込みしてください。" />
        <Button colorPalette="teal" alignSelf="center" onClick={() => window.location.reload()}>
          ページを再読み込みする
        </Button>
      </Stack>
    </Dialog>
  );
}

function createSession(shopId: string, data: ShopStaffMembershipData): MembershipSession {
  const people = data.people.map((person) => ({ ...person, otherShopNames: [...person.otherShopNames] }));
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
