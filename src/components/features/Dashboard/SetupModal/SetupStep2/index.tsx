import { Checkbox, Field, Input, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { PROMOTION_CODE_LENGTH } from "@/convex/setup/constants";
import { type ManagerProfileInput, managerProfileSchema } from "@/convex/setup/schemas";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { useDeadlineActive } from "@/src/hooks/useDeadlineActive";
import {
  createPromotionCodeAttemptLimit,
  PROMOTION_CODE_LOCKOUT_MS,
  type PromotionCodeAttemptLimit,
} from "../promotionCodeAttemptLimit";
import type { SetupCompletionResult } from "../types";

export type Step2Data = ManagerProfileInput;

type Props = {
  onSubmit: (data: Step2Data) => SetupCompletionResult | undefined | Promise<SetupCompletionResult | undefined>;
  defaultValues?: Pick<Step2Data, "name" | "email">;
  formId?: string;
  promotionCodeAttemptLimit?: PromotionCodeAttemptLimit;
};

const PROMOTION_CODE_INVALID_MESSAGE = "プロモーションコードを確認してください。";
const PROMOTION_CODE_LOCKED_MESSAGE = `プロモーションコードの確認回数が上限に達しました。${PROMOTION_CODE_LOCKOUT_MS / 60_000}分後にもう一度お試しください。コードなしの通常登録は続けられます。`;

export const SetupStep2 = ({ onSubmit, defaultValues, formId = "setup-step2", promotionCodeAttemptLimit }: Props) => {
  const localAttemptLimit = useMemo(
    () => promotionCodeAttemptLimit ?? createPromotionCodeAttemptLimit(),
    [promotionCodeAttemptLimit],
  );
  const [attemptState, setAttemptState] = useState(() => localAttemptLimit.read());
  const [promotionCodeServerError, setPromotionCodeServerError] = useState<string | null>(null);
  const {
    register,
    clearErrors,
    setValue,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(managerProfileSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      email: defaultValues?.email ?? "",
      promotionCode: "",
      acceptedLegal: false,
    },
  });

  const acceptedLegal = watch("acceptedLegal");
  const isPromotionCodeBlocked = useDeadlineActive(attemptState.blockedUntil);

  useEffect(() => {
    if (attemptState.blockedUntil === null || isPromotionCodeBlocked) return;
    setAttemptState(localAttemptLimit.read());
    setPromotionCodeServerError(null);
  }, [attemptState.blockedUntil, isPromotionCodeBlocked, localAttemptLimit]);

  const submit = handleSubmit(async (data) => {
    setPromotionCodeServerError(null);
    const result = await onSubmit(data);
    if (!result || result.kind === "failed") return;
    if (result.kind === "completed") {
      setAttemptState(localAttemptLimit.reset());
      return;
    }

    const nextAttemptState = localAttemptLimit.recordFailure();
    setAttemptState(nextAttemptState);
    if (nextAttemptState.isBlocked) {
      setValue("promotionCode", "", { shouldDirty: true, shouldValidate: true });
      return;
    }
    setPromotionCodeServerError(
      `${PROMOTION_CODE_INVALID_MESSAGE}残り${nextAttemptState.remainingAttempts}回確認できます。`,
    );
  });

  const promotionCodeError = errors.promotionCode?.message ?? promotionCodeServerError;

  return (
    <form id={formId} onSubmit={submit}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>あなたの名前</Field.Label>
          <Input {...register("name")} maxLength={PERSON_NAME_MAX_LENGTH} placeholder="例：山田 太郎" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.email}>
          <Field.Label>シフト通知先メールアドレス</Field.Label>
          <Input
            type="email"
            {...register("email")}
            maxLength={EMAIL_MAX_LENGTH}
            placeholder="例：yamada@example.com"
          />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!promotionCodeError || isPromotionCodeBlocked}>
          <Field.Label>プロモーションコード（任意）</Field.Label>
          <Input
            {...register("promotionCode", {
              onChange: () => {
                setPromotionCodeServerError(null);
                clearErrors("promotionCode");
              },
            })}
            maxLength={PROMOTION_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="例：ABC123"
            disabled={isPromotionCodeBlocked}
          />
          {isPromotionCodeBlocked ? (
            <Field.ErrorText>{PROMOTION_CODE_LOCKED_MESSAGE}</Field.ErrorText>
          ) : promotionCodeError ? (
            <Field.ErrorText>{promotionCodeError}</Field.ErrorText>
          ) : (
            <Field.HelperText>お持ちの場合のみ入力してください。</Field.HelperText>
          )}
        </Field.Root>
        <Field.Root invalid={!!errors.acceptedLegal}>
          <Checkbox.Root
            colorPalette="teal"
            checked={acceptedLegal}
            cursor="pointer"
            onCheckedChange={(details) => {
              setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
            }}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control cursor="pointer" />
            <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
              <LegalDocumentLink href="/terms/manager">利用規約</LegalDocumentLink>と
              <LegalDocumentLink href="/privacy/manager">プライバシーポリシー</LegalDocumentLink>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {errors.acceptedLegal && <Field.ErrorText>{errors.acceptedLegal.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
