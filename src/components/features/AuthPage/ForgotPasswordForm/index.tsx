import { Alert, Field, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/Button";
import { AuthError, AuthModeLink, PasswordInput } from "../AuthFormControls";
import { type ForgotRequestValues, type ForgotResetValues, forgotRequestSchema, forgotResetSchema } from "./schema";

type ForgotPasswordFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  step?: "request" | "reset";
  email?: string;
  redirectTo: string;
  onRequestReset: (values: ForgotRequestValues) => void | Promise<void>;
  onResetPassword: (values: ForgotResetValues) => void | Promise<void>;
};

export function ForgotPasswordForm({
  errorMessage,
  isSubmitting,
  step = "request",
  email,
  redirectTo,
  onRequestReset,
  onResetPassword,
}: ForgotPasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotRequestValues>({ resolver: zodResolver(forgotRequestSchema) });
  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors },
  } = useForm<ForgotResetValues>({ resolver: zodResolver(forgotResetSchema) });

  if (step === "reset") {
    return (
      <Stack as="form" gap={5} onSubmit={handleResetSubmit(onResetPassword)}>
        <AuthError message={errorMessage} />
        <Alert.Root status="info" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>
            {email ? `${email} に届いたコード` : "メールに届いたコード"}と新しいパスワードを入力してください。
          </Alert.Description>
        </Alert.Root>
        <Field.Root invalid={!!resetErrors.code}>
          <Field.Label>確認コード</Field.Label>
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...registerReset("code")} />
          <Field.ErrorText>{resetErrors.code?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!resetErrors.password}>
          <Field.Label>新しいパスワード</Field.Label>
          <PasswordInput autoComplete="new-password" placeholder="8文字以上" {...registerReset("password")} />
          <Field.ErrorText>{resetErrors.password?.message}</Field.ErrorText>
        </Field.Root>
        <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="再設定中">
          パスワードを再設定
        </Button>
        <Text textAlign="center" textStyle="sm">
          <AuthModeLink to="/login" redirectTo={redirectTo} color="teal.700" fontWeight="bold">
            ログインに戻る
          </AuthModeLink>
        </Text>
      </Stack>
    );
  }

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onRequestReset)}>
      <AuthError message={errorMessage} />
      <Field.Root invalid={!!errors.email}>
        <Field.Label>メールアドレス</Field.Label>
        <Input type="email" autoComplete="email" placeholder="example@example.com" {...register("email")} />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="送信中">
        再設定コードを送る
      </Button>
      <Text textAlign="center" textStyle="sm">
        <AuthModeLink to="/login" redirectTo={redirectTo} color="teal.700" fontWeight="bold">
          ログインに戻る
        </AuthModeLink>
      </Text>
    </Stack>
  );
}

export type { ForgotRequestValues, ForgotResetValues } from "./schema";
