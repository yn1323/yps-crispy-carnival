import { Alert, Field, Flex, HStack, Input, Stack, Tabs, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuCheck, LuStore } from "react-icons/lu";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import type { ManagerInvitationStaffCandidate, ManagerInvitationSubmitInput } from "./types";

type Props = {
  isOpen: boolean;
  isResendOnly?: boolean;
  defaultTab?: InvitationTab;
  managerInvitationMode: "addition" | "freeManagerExchange";
  staffCandidates: ManagerInvitationStaffCandidate[];
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (input: ManagerInvitationSubmitInput) => void;
};

type InvitationTab = "staff" | "external";

export function ManagerInvitationDialog({
  isOpen,
  isResendOnly = false,
  defaultTab = "staff",
  managerInvitationMode,
  staffCandidates,
  peopleCapacityResolution,
  isRunning,
  onClose,
  onSubmit,
}: Props) {
  const [activeTab, setActiveTab] = useState<InvitationTab>("staff");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isConfirmingFreeManagerExchange, setIsConfirmingFreeManagerExchange] = useState(false);

  useEffect(() => {
    setIsConfirmingFreeManagerExchange(false);
    if (isOpen) {
      setActiveTab(defaultTab);
      setSelectedPersonId(null);
      setEmail("");
      setName("");
    }
  }, [defaultTab, isOpen]);

  const isFreeManagerExchange = managerInvitationMode === "freeManagerExchange";
  const selectedStaff = staffCandidates.find((candidate) => candidate.id === selectedPersonId);
  const isShowingFreeManagerExchangeConfirmation =
    isFreeManagerExchange && isConfirmingFreeManagerExchange && selectedStaff !== undefined;

  useEffect(() => {
    if (
      !isFreeManagerExchange ||
      !selectedPersonId ||
      !staffCandidates.some((candidate) => candidate.id === selectedPersonId)
    ) {
      setIsConfirmingFreeManagerExchange(false);
    }
  }, [isFreeManagerExchange, selectedPersonId, staffCandidates]);

  if (!isOpen) return null;

  const normalizedEmail = email.trim();
  const normalizedName = name.trim();
  const canSubmit =
    activeTab === "staff"
      ? selectedStaff !== undefined
      : !isFreeManagerExchange && normalizedName.length > 0 && isEmail(normalizedEmail);
  const submitLabel =
    isFreeManagerExchange && activeTab === "staff"
      ? "交代内容を確認"
      : activeTab === "staff" && selectedStaff?.isResend
        ? "ログイン案内を再送"
        : isResendOnly && activeTab === "external"
          ? "ログイン案内を再送"
          : "ログイン案内を送る";
  const closeDialog = () => {
    setIsConfirmingFreeManagerExchange(false);
    onClose();
  };

  return (
    <Dialog
      title={isResendOnly ? "ログイン案内を再送" : isFreeManagerExchange ? "次の管理者を招待" : "新しい管理者を招待"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) closeDialog();
      }}
      onClose={closeDialog}
      formId={isShowingFreeManagerExchangeConfirmation ? undefined : "invite-manager-form"}
      submitLabel={submitLabel}
      isLoading={isRunning}
      isSubmitDisabled={!canSubmit}
      hideFooter={isShowingFreeManagerExchangeConfirmation}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
      maxH={{ base: "calc(100dvh - 24px)", md: "min(760px, calc(100dvh - 48px))" }}
    >
      {isShowingFreeManagerExchangeConfirmation && (
        <ManagerAssignmentConfirmation
          personName={selectedStaff.name}
          personEmail={selectedStaff.email}
          mode="freeManagerExchange"
          isResend={selectedStaff.isResend}
          isRunning={isRunning}
          onCancel={() => setIsConfirmingFreeManagerExchange(false)}
          onConfirm={() => onSubmit({ kind: "person", personId: selectedStaff.id })}
        />
      )}
      <form
        id="invite-manager-form"
        hidden={isShowingFreeManagerExchangeConfirmation}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          if (activeTab === "staff" && selectedStaff) {
            if (isFreeManagerExchange) {
              setIsConfirmingFreeManagerExchange(true);
              return;
            }
            onSubmit({ kind: "person", personId: selectedStaff.id });
            return;
          }
          if (activeTab === "external") {
            onSubmit({ kind: "external", name: normalizedName, email: normalizedEmail });
          }
        }}
      >
        <Stack gap={4}>
          {peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert resolution={peopleCapacityResolution} retryActionLabel="管理者を招待" />
          )}

          <Alert.Root status="warning" alignItems="flex-start" borderRadius="lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>管理者権限を確認してください</Alert.Title>
              <Alert.Description>
                管理者になると、グループ内の全店舗と契約・支払い設定を操作できます。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>

          <Tabs.Root
            value={activeTab}
            onValueChange={({ value }) => {
              setActiveTab(value as InvitationTab);
              setIsConfirmingFreeManagerExchange(false);
            }}
            colorPalette="teal"
            variant="line"
          >
            <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
              <Tabs.Trigger value="staff" flexShrink={0} disabled={isRunning}>
                現在のスタッフ
              </Tabs.Trigger>
              <Tabs.Trigger value="external" flexShrink={0} disabled={isRunning}>
                名前・メールを入力
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="staff" pt={4}>
              <Stack gap={4}>
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  {isFreeManagerExchange
                    ? "次の管理者にするスタッフを1名選んでください。本人のアカウント連携が完了するまでは、現在の管理者が利用を継続します。"
                    : "管理者として招待するスタッフを1名選んでください。本人がログインしてアカウントを連携すると、管理者になります。"}
                </Text>
                {staffCandidates.length === 0 ? (
                  <Stack
                    gap={1}
                    py={6}
                    px={4}
                    borderWidth="1px"
                    borderStyle="dashed"
                    borderRadius="xl"
                    textAlign="center"
                  >
                    <Text fontWeight="medium">招待できるスタッフはいません</Text>
                    <Text fontSize="sm" color="fg.muted">
                      スタッフのメールアドレスと管理者の招待状況を確認してください。
                    </Text>
                  </Stack>
                ) : (
                  <Stack
                    gap={0}
                    borderWidth="1px"
                    borderColor="blackAlpha.100"
                    borderRadius="xl"
                    overflowY="auto"
                    maxH="320px"
                    divideY="1px"
                    divideColor="blackAlpha.100"
                  >
                    {staffCandidates.map((candidate) => {
                      const isSelected = candidate.id === selectedPersonId;
                      return (
                        <Button
                          type="button"
                          key={candidate.id}
                          aria-pressed={isSelected}
                          aria-label={`${candidate.name}を選択`}
                          gap={3}
                          px={3}
                          py={3}
                          h="auto"
                          w="full"
                          justifyContent="flex-start"
                          textAlign="left"
                          whiteSpace="normal"
                          fontWeight="normal"
                          borderRadius={0}
                          variant="ghost"
                          bg={isSelected ? "teal.50" : "white"}
                          cursor="pointer"
                          disabled={isRunning}
                          _hover={{ bg: isSelected ? "teal.50" : "blackAlpha.50" }}
                          _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "-2px" }}
                          _disabled={{ cursor: "not-allowed", opacity: 0.6 }}
                          onClick={() => setSelectedPersonId(candidate.id)}
                        >
                          <Flex
                            boxSize="40px"
                            borderRadius="full"
                            bg={isSelected ? "teal.500" : "teal.50"}
                            color={isSelected ? "white" : "teal.700"}
                            align="center"
                            justify="center"
                            fontWeight="semibold"
                            fontSize="sm"
                            flexShrink={0}
                          >
                            {candidate.name.trim().charAt(0) || "?"}
                          </Flex>
                          <Stack gap={0.5} flex={1} minW={0}>
                            <HStack gap={2} wrap="wrap">
                              <Text fontWeight="semibold" truncate>
                                {candidate.name}
                              </Text>
                              {candidate.isResend && (
                                <Text fontSize="xs" color="teal.700">
                                  案内送信済み
                                </Text>
                              )}
                            </HStack>
                            <Text fontSize="xs" color="fg.muted" truncate>
                              {candidate.email}
                            </Text>
                            <HStack gap={1.5} color="fg.muted" minW={0}>
                              <LuStore aria-hidden />
                              <Text fontSize="xs" truncate>
                                {candidate.shopNames.join("、") || "店舗所属なし"}
                              </Text>
                            </HStack>
                          </Stack>
                          <Flex
                            boxSize="24px"
                            borderRadius="full"
                            borderWidth="1px"
                            borderColor={isSelected ? "teal.500" : "blackAlpha.300"}
                            bg={isSelected ? "teal.500" : "white"}
                            color="white"
                            align="center"
                            justify="center"
                            flexShrink={0}
                            aria-hidden
                          >
                            {isSelected && <LuCheck />}
                          </Flex>
                        </Button>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </Tabs.Content>

            <Tabs.Content value="external" pt={4}>
              {isFreeManagerExchange ? (
                <Alert.Root status="info" alignItems="flex-start" borderRadius="lg">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Freeでは現在のスタッフから選択してください</Alert.Title>
                    <Alert.Description>
                      名前とメールアドレスを入力して、新しいユーザーを管理者として招待することはできません。
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              ) : (
                <Stack gap={4}>
                  <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                    {isResendOnly
                      ? "送信済みの案内と同じ対象者を入力してください。新しいURLを送り、以前のURLは利用できなくなります。"
                      : "本人へログイン案内を送ります。既にシフトリを利用している場合も、案内先のメールアドレスでログインすると管理者になります。"}
                  </Text>
                  <Field.Root required={activeTab === "external"}>
                    <Field.Label>名前</Field.Label>
                    <Input
                      autoComplete="name"
                      disabled={isRunning || activeTab !== "external"}
                      value={name}
                      maxLength={PERSON_NAME_MAX_LENGTH}
                      placeholder="例：田中 花子"
                      onChange={(event) => setName(event.currentTarget.value)}
                    />
                  </Field.Root>
                  <Field.Root required={activeTab === "external"}>
                    <Field.Label>メールアドレス</Field.Label>
                    <Input
                      type="email"
                      autoComplete="email"
                      disabled={isRunning || activeTab !== "external"}
                      value={email}
                      maxLength={EMAIL_MAX_LENGTH}
                      placeholder="manager@example.com"
                      onChange={(event) => setEmail(event.currentTarget.value)}
                    />
                    <Field.HelperText>ログイン案内のURLは7日間有効で、一度だけ使用できます。</Field.HelperText>
                  </Field.Root>
                </Stack>
              )}
            </Tabs.Content>
          </Tabs.Root>
        </Stack>
      </form>
    </Dialog>
  );
}

function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
