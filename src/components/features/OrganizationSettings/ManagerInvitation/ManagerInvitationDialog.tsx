import { Field, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";

type Props = {
  isOpen: boolean;
  isResendOnly?: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; email: string; personId?: string }) => void;
};

export function ManagerInvitationDialog({
  isOpen,
  isResendOnly = false,
  managerInvitationMode,
  freeManagerExchangeCandidates,
  peopleCapacityResolution,
  isRunning,
  onClose,
  onSubmit,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setName("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedEmail = email.trim();
  const isFreeManagerExchange = managerInvitationMode === "freeManagerExchange";
  const selectedExchangeCandidate = isFreeManagerExchange
    ? freeManagerExchangeCandidates.find((candidate) => candidate.email === normalizedEmail)
    : undefined;
  const normalizedName = isFreeManagerExchange ? (selectedExchangeCandidate?.name ?? "") : name.trim();
  const canSubmit = normalizedName.length > 0 && isEmail(normalizedEmail);

  return (
    <Dialog
      title={isResendOnly ? "ログイン案内を再送" : isFreeManagerExchange ? "次の管理者を招待" : "新しい管理者を招待"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      formId="invite-manager-form"
      submitLabel={isResendOnly ? "ログイン案内を再送" : "ログイン案内を送る"}
      isLoading={isRunning}
      isSubmitDisabled={!canSubmit}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <form
        id="invite-manager-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit({
              name: normalizedName,
              email: normalizedEmail,
              ...(selectedExchangeCandidate ? { personId: selectedExchangeCandidate.id } : {}),
            });
          }
        }}
      >
        <Stack gap={4}>
          {peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert resolution={peopleCapacityResolution} retryActionLabel="管理者を招待" />
          )}

          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isResendOnly
              ? "送信済みの案内と同じ対象者を指定してください。新しいURLを送り、以前のURLは利用できなくなります。"
              : isFreeManagerExchange
                ? "選択したスタッフを次の管理者に設定します。本人のアカウント連携が完了すると自動で交代し、現在の管理者の店舗所属、シフト対象、通知設定は維持されます。"
                : "本人へログイン案内を送ります。ログイン後にアカウントとグループの紐付けが完了すると、店舗所属なしの管理者として追加されます。同じメールアドレスへ送信済みの場合は、以前のURLを無効にして再送します。"}
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
              <Field.HelperText>
                本人のアカウント連携が完了するまでは、現在の管理者が利用を継続します。
              </Field.HelperText>
            </Field.Root>
          ) : (
            <Stack gap={4}>
              <Field.Root required>
                <Field.Label>名前</Field.Label>
                <Input
                  autoComplete="name"
                  value={name}
                  maxLength={PERSON_NAME_MAX_LENGTH}
                  placeholder="例：田中 花子"
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>メールアドレス</Field.Label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={EMAIL_MAX_LENGTH}
                  placeholder="manager@example.com"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
                <Field.HelperText>ログイン案内のURLは7日間有効で、一度だけ使用できます。</Field.HelperText>
              </Field.Root>
            </Stack>
          )}
        </Stack>
      </form>
    </Dialog>
  );
}

function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
