import { Field, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";

type Props = {
  isOpen: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
};

export function ManagerInvitationDialog({
  isOpen,
  managerInvitationMode,
  freeManagerExchangeCandidates,
  peopleCapacityResolution,
  isRunning,
  onClose,
  onSubmit,
}: Props) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (isOpen) setEmail("");
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedEmail = email.trim();
  const isFreeManagerExchange = managerInvitationMode === "freeManagerExchange";

  return (
    <Dialog
      title={isFreeManagerExchange ? "Freeの管理者を交代" : "管理者を招待"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId="invite-manager-form"
      submitLabel={isFreeManagerExchange ? "交代の招待を送る" : "招待メールを送る"}
      isLoading={isRunning}
      isSubmitDisabled={!isEmail(normalizedEmail)}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <form
        id="invite-manager-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isEmail(normalizedEmail)) onSubmit(normalizedEmail);
        }}
      >
        <Stack gap={4}>
          {peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert resolution={peopleCapacityResolution} retryActionLabel="管理者を招待" />
          )}

          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isFreeManagerExchange
              ? "承認後、新しい管理者へ交代し、現在の管理者はこのグループの管理画面を開けなくなります。現在の管理者の既存の店舗スタッフ所属、シフト対象、通知設定は維持されます。"
              : "招待された管理者は、このグループのすべての店舗と、プラン・支払いを含む設定を管理できます。管理者と招待中の管理者は合計5名までです。"}
          </Text>

          {isFreeManagerExchange ? (
            <Field.Root required>
              <Field.Label>新しい管理者</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field value={email} onChange={(event) => setEmail(event.currentTarget.value)}>
                  <option value="">選択してください</option>
                  {freeManagerExchangeCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.email}>
                      {candidate.name}（{candidate.email}）
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.HelperText>招待URLは7日間有効で、一度だけ使用できます。</Field.HelperText>
            </Field.Root>
          ) : (
            <Field.Root required>
              <Field.Label>招待先メールアドレス</Field.Label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                maxLength={EMAIL_MAX_LENGTH}
                placeholder="manager@example.com"
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <Field.HelperText>招待URLは7日間有効で、一度だけ使用できます。</Field.HelperText>
            </Field.Root>
          )}
        </Stack>
      </form>
    </Dialog>
  );
}

function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
