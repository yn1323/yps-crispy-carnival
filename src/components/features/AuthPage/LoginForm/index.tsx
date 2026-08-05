import { Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/Button";
import { AuthError, AuthModeLink, OAuthSection, PasswordInput } from "../AuthFormControls";
import { type LoginValues, loginSchema } from "./schema";

type LoginFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  isLineBrowser?: boolean;
  redirectTo: string;
  onGoogle: () => void | Promise<void>;
  onSubmit: (values: LoginValues) => void | Promise<void>;
};

export function LoginForm({
  errorMessage,
  isSubmitting,
  isLineBrowser,
  redirectTo,
  onGoogle,
  onSubmit,
}: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      <OAuthSection
        isLineBrowser={isLineBrowser}
        isSubmitting={isSubmitting}
        onClick={onGoogle}
        label="Googleでログイン"
      />
      <Text as="h2" color="gray.900" fontWeight="semibold">
        メールアドレスとパスワードでログイン
      </Text>
      <AuthError message={errorMessage} />
      <Field.Root invalid={!!errors.email}>
        <Field.Label>メールアドレス</Field.Label>
        <Input type="email" autoComplete="email" placeholder="example@example.com" {...register("email")} />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={!!errors.password}>
        <Field.Label>パスワード</Field.Label>
        <PasswordInput autoComplete="current-password" placeholder="パスワード" {...register("password")} />
        <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
      </Field.Root>
      <Flex justify="end">
        <AuthModeLink to="/forgot-password" redirectTo={redirectTo} color="teal.700" fontWeight="bold" textStyle="sm">
          パスワードを忘れた方
        </AuthModeLink>
      </Flex>
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="ログイン中">
        ログイン
      </Button>
      <Text color="gray.700" textAlign="center" textStyle="sm">
        はじめての方は{" "}
        <AuthModeLink to="/signup" redirectTo={redirectTo} color="teal.700" fontWeight="bold">
          新規登録
        </AuthModeLink>
      </Text>
    </Stack>
  );
}

export type { LoginValues } from "./schema";
