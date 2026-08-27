import { Checkbox, Field, Flex, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { normalizePromotionCode } from "@/convex/setup/constants";
import { type ManagerProfileInput, managerProfileSchema } from "@/convex/setup/schemas";
import { LegalDocumentLink } from "@/src/components/shared/LegalDocumentLink";
import { Button } from "@/src/components/ui/Button";
import { useDeadlineActive } from "@/src/hooks/useDeadlineActive";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
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
  onVerifyPromotionCode: (promotionCode: string) => boolean | Promise<boolean>;
  onPromotionCodePendingChange?: (isPending: boolean) => void;
};

const PROMOTION_CODE_INVALID_MESSAGE = "コードが誤っています。";
const PROMOTION_CODE_LOCKED_MESSAGE = `プロモーションコードの確認回数が上限に達しました。${PROMOTION_CODE_LOCKOUT_MS / 60_000}分後にもう一度お試しください。`;

export const SetupStep2 = ({
  onSubmit,
  onVerifyPromotionCode,
  onPromotionCodePendingChange,
  defaultValues,
  formId = "setup-step2",
  promotionCodeAttemptLimit,
}: Props) => {
  const localAttemptLimit = useMemo(
    () => promotionCodeAttemptLimit ?? createPromotionCodeAttemptLimit(),
    [promotionCodeAttemptLimit],
  );
  const [attemptState, setAttemptState] = useState(() => localAttemptLimit.read());
  const [promotionCodeServerError, setPromotionCodeServerError] = useState<string | null>(null);
  const [isPromotionCodeOpen, setIsPromotionCodeOpen] = useState(false);
  const [appliedPromotionCode, setAppliedPromotionCode] = useState<string | null>(null);
  const promotionCodeTriggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestorePromotionCodeTriggerFocusRef = useRef(false);
  const {
    register,
    clearErrors,
    getValues,
    setFocus,
    setValue,
    trigger,
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
  const promotionCode = watch("promotionCode") ?? "";
  const normalizedPromotionCode = normalizePromotionCode(promotionCode);
  const isPromotionCodeBlocked = useDeadlineActive(attemptState.blockedUntil);
  const isPromotionCodePending =
    isPromotionCodeOpen && appliedPromotionCode === null && normalizedPromotionCode.length > 0;

  useEffect(() => {
    if (attemptState.blockedUntil === null || isPromotionCodeBlocked) return;
    setAttemptState(localAttemptLimit.read());
    setPromotionCodeServerError(null);
  }, [attemptState.blockedUntil, isPromotionCodeBlocked, localAttemptLimit]);

  useEffect(() => {
    onPromotionCodePendingChange?.(isPromotionCodePending);
  }, [isPromotionCodePending, onPromotionCodePendingChange]);

  useEffect(() => {
    if (!isPromotionCodeOpen || appliedPromotionCode !== null || isPromotionCodeBlocked) return;
    setFocus("promotionCode");
  }, [appliedPromotionCode, isPromotionCodeBlocked, isPromotionCodeOpen, setFocus]);

  useEffect(() => {
    if (isPromotionCodeOpen || !shouldRestorePromotionCodeTriggerFocusRef.current) return;
    shouldRestorePromotionCodeTriggerFocusRef.current = false;
    promotionCodeTriggerRef.current?.focus();
  }, [isPromotionCodeOpen]);

  const recordPromotionCodeFailure = () => {
    const nextAttemptState = localAttemptLimit.recordFailure();
    setAttemptState(nextAttemptState);
    setAppliedPromotionCode(null);
    if (nextAttemptState.isBlocked) {
      setValue("promotionCode", "", { shouldDirty: true, shouldValidate: true });
      return;
    }
    setPromotionCodeServerError(PROMOTION_CODE_INVALID_MESSAGE);
  };

  const { run: applyPromotionCode, isRunning: isVerifyingPromotionCode } = useSingleFlight(async () => {
    setPromotionCodeServerError(null);
    const isValid = await trigger("promotionCode", { shouldFocus: true });
    if (!isValid || isPromotionCodeBlocked) return;

    const code = normalizePromotionCode(getValues("promotionCode") ?? "");
    if (!code) return;
    const isVerified = await onVerifyPromotionCode(code);
    if (!isVerified) {
      recordPromotionCodeFailure();
      return;
    }

    setValue("promotionCode", code, { shouldDirty: true, shouldValidate: true });
    setAppliedPromotionCode(code);
    setAttemptState(localAttemptLimit.reset());
  });

  const submit = handleSubmit(async (data) => {
    if (isPromotionCodePending) return;
    setPromotionCodeServerError(null);
    const result = await onSubmit({ ...data, promotionCode: appliedPromotionCode ?? undefined });
    if (!result || result.kind === "failed") return;
    if (result.kind === "completed") {
      setAttemptState(localAttemptLimit.reset());
      return;
    }
    recordPromotionCodeFailure();
  });

  const promotionCodeError = errors.promotionCode?.message ?? promotionCodeServerError;

  const stopPromotionCodeInput = () => {
    shouldRestorePromotionCodeTriggerFocusRef.current = true;
    setIsPromotionCodeOpen(false);
    setAppliedPromotionCode(null);
    setPromotionCodeServerError(null);
    clearErrors("promotionCode");
    setValue("promotionCode", "", { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form id={formId} onSubmit={submit}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.name}>
          <Field.Label>あなたの名前</Field.Label>
          <Input {...register("name")} maxLength={PERSON_NAME_MAX_LENGTH} placeholder="サンプル 管理者" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.email}>
          <Field.Label>シフト通知先メールアドレス</Field.Label>
          <Input type="email" {...register("email")} maxLength={EMAIL_MAX_LENGTH} placeholder="manager@example.com" />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.acceptedLegal}>
          <Flex justify="flex-end" w="full">
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
          </Flex>
          {errors.acceptedLegal && <Field.ErrorText>{errors.acceptedLegal.message}</Field.ErrorText>}
        </Field.Root>
        {isPromotionCodeOpen ? (
          <Stack gap={1.5}>
            <Field.Root invalid={!!promotionCodeError || isPromotionCodeBlocked}>
              <Field.Label>プロモーションコード（任意）</Field.Label>
              <HStack align="flex-start" gap={2}>
                <Input
                  {...register("promotionCode", {
                    onChange: () => {
                      setPromotionCodeServerError(null);
                      clearErrors("promotionCode");
                    },
                  })}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABC123"
                  readOnly={appliedPromotionCode !== null}
                  disabled={isPromotionCodeBlocked || isVerifyingPromotionCode}
                  flex={1}
                  minW={0}
                />
                {appliedPromotionCode === null ? (
                  <Button
                    type="button"
                    variant="outline"
                    colorPalette="teal"
                    loading={isVerifyingPromotionCode}
                    loadingText="確認中"
                    disabled={isPromotionCodeBlocked || normalizedPromotionCode.length === 0}
                    onClick={applyPromotionCode}
                    flexShrink={0}
                  >
                    適用
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    colorPalette="teal"
                    onClick={() => {
                      setAppliedPromotionCode(null);
                      setPromotionCodeServerError(null);
                    }}
                    flexShrink={0}
                  >
                    変更する
                  </Button>
                )}
              </HStack>
              {isPromotionCodeBlocked ? (
                <Field.ErrorText>{PROMOTION_CODE_LOCKED_MESSAGE}</Field.ErrorText>
              ) : promotionCodeError ? (
                <Field.ErrorText>{promotionCodeError}</Field.ErrorText>
              ) : appliedPromotionCode !== null ? (
                <Text aria-live="polite" fontSize="sm" color="green.600">
                  無料のProプランを適用
                </Text>
              ) : null}
            </Field.Root>
            <Flex justify="flex-end">
              <Button
                type="button"
                variant="ghost"
                colorPalette="gray"
                size="sm"
                disabled={isVerifyingPromotionCode}
                onClick={stopPromotionCodeInput}
              >
                入力をやめる
              </Button>
            </Flex>
          </Stack>
        ) : (
          <Flex justify="flex-end">
            <Button
              ref={promotionCodeTriggerRef}
              type="button"
              variant="ghost"
              colorPalette="teal"
              size="sm"
              fontWeight="semibold"
              onClick={() => setIsPromotionCodeOpen(true)}
            >
              プロモーションコードお持ちの方はこちら
            </Button>
          </Flex>
        )}
      </Stack>
    </form>
  );
};
