import { Alert, Field, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/FormControls";
import { AuthError } from "../AuthFormControls";
import { type EmailVerificationValues, emailVerificationSchema } from "./schema";

type EmailCodeVerificationFormProps = {
  description?: ReactNode;
  errorMessage?: string;
  infoMessage?: string;
  isSubmitting?: boolean;
  codeInputAction?: ReactNode;
  secondaryActions?: ReactNode;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EmailVerificationValues) => void | Promise<void>;
};

export function EmailCodeVerificationForm({
  description,
  errorMessage,
  infoMessage,
  isSubmitting,
  codeInputAction,
  secondaryActions,
  submitLabel,
  submittingLabel,
  onSubmit,
}: EmailCodeVerificationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailVerificationValues>({ resolver: zodResolver(emailVerificationSchema) });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      <AuthError message={errorMessage} />
      {description ? (
        <Alert.Root status="info" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description whiteSpace="pre-line">{description}</Alert.Description>
        </Alert.Root>
      ) : null}
      {infoMessage && (
        <Alert.Root status="success" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description whiteSpace="pre-line">{infoMessage}</Alert.Description>
        </Alert.Root>
      )}
      <Field.Root invalid={!!errors.code}>
        <Field.Label>確認コード</Field.Label>
        <Input
          inputMode="numeric"
          autocompletePolicy="auth"
          autoComplete="one-time-code"
          placeholder="123456"
          {...register("code")}
        />
        <Field.ErrorText>{errors.code?.message}</Field.ErrorText>
      </Field.Root>
      {codeInputAction}
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText={submittingLabel}>
        {submitLabel}
      </Button>
      {secondaryActions}
    </Stack>
  );
}

export type { EmailVerificationValues } from "./schema";
