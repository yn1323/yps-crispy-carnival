import { Alert, Field, Input, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/src/components/ui/Button";

const verificationCodeSchema = z.object({
  code: z.string().min(1, "確認コードを入力してください"),
});

type VerificationCodeValues = z.infer<typeof verificationCodeSchema>;

export function LoginMethodEmailCodeForm({
  formId,
  errorMessage,
  isBusy,
  onSubmit,
  onResend,
}: {
  formId: string;
  errorMessage?: string;
  isBusy: boolean;
  onSubmit: (code: string) => unknown | Promise<unknown>;
  onResend: () => unknown | Promise<unknown>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerificationCodeValues>({ resolver: zodResolver(verificationCodeSchema) });

  return (
    <Stack
      as="form"
      id={formId}
      gap={4}
      onSubmit={handleSubmit(async ({ code }) => {
        await onSubmit(code);
      })}
    >
      {errorMessage ? (
        <Alert.Root status="error" role="alert" aria-live="assertive" borderRadius="lg" alignItems="flex-start">
          <Alert.Indicator />
          <Alert.Description whiteSpace="pre-line">{errorMessage}</Alert.Description>
        </Alert.Root>
      ) : null}
      <Field.Root invalid={Boolean(errors.code)}>
        <Field.Label>確認コード</Field.Label>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          disabled={isBusy}
          {...register("code")}
        />
        <Field.ErrorText>{errors.code?.message}</Field.ErrorText>
      </Field.Root>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        alignSelf="flex-end"
        disabled={isBusy}
        onClick={() => {
          void onResend();
        }}
      >
        確認コードを再送する
      </Button>
    </Stack>
  );
}
