import { Field, Input, Link, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/src/components/ui/Button";
import { AuthError, AuthModeLink, ClerkCaptcha, OAuthSection, PasswordInput } from "../AuthFormControls";
import { EmailCodeVerificationForm, type EmailVerificationValues } from "../EmailCodeVerificationForm";
import { type SignupValues, signupSchema } from "./schema";

type SignupFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  isVerificationStep?: boolean;
  isLineBrowser?: boolean;
  redirectTo: string;
  onGoogle: () => void | Promise<void>;
  onSubmit: (values: SignupValues) => void | Promise<void>;
  onVerifyEmail: (values: EmailVerificationValues) => void | Promise<void>;
  onRestartSignup: () => void | Promise<void>;
};

export function SignupForm({
  errorMessage,
  isSubmitting,
  isVerificationStep,
  isLineBrowser,
  redirectTo,
  onGoogle,
  onSubmit,
  onVerifyEmail,
  onRestartSignup,
}: SignupFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  if (isVerificationStep) {
    return (
      <EmailCodeVerificationForm
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        description="メールに届いた確認コードを入力してください。"
        submitLabel="登録を完了する"
        submittingLabel="確認中"
        onSubmit={onVerifyEmail}
        secondaryActions={
          <Text color="gray.700" textAlign="center" textStyle="sm">
            登録方法を変える場合は{" "}
            <Link
              asChild
              color="teal.700"
              fontWeight="bold"
              cursor="pointer"
              _hover={{ color: "teal.800", textDecoration: "underline" }}
            >
              <button type="button" onClick={onRestartSignup}>
                最初からやり直す
              </button>
            </Link>
          </Text>
        }
      />
    );
  }

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={2} bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="md" px={4} py={3}>
        <Text color="gray.800" textStyle="sm" lineHeight="1.8">
          初回登録で作る最初の組織には、支払い不要のBusinessが適用されます。2ヶ月のトライアル期限や支払い情報の登録はありません。
        </Text>
        <Link
          href="/pricing"
          target="_blank"
          rel="noreferrer"
          color="teal.700"
          fontWeight="bold"
          textStyle="sm"
          alignSelf="flex-start"
        >
          料金・プランを見る（新しいタブ）
        </Link>
      </Stack>
      <OAuthSection isLineBrowser={isLineBrowser} isSubmitting={isSubmitting} onClick={onGoogle} label="Googleで登録" />
      <AuthError message={errorMessage} />
      <Field.Root invalid={!!errors.email}>
        <Field.Label>ログインに使うメールアドレス</Field.Label>
        <Input type="email" autoComplete="email" placeholder="example@example.com" {...register("email")} />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={!!errors.password}>
        <Field.Label>パスワード</Field.Label>
        <PasswordInput autoComplete="new-password" placeholder="8文字以上" {...register("password")} />
        <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
      </Field.Root>
      <ClerkCaptcha />
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="作成中">
        アカウントを作成
      </Button>
      <Text color="gray.700" textAlign="center" textStyle="sm">
        すでにアカウントをお持ちの方は{" "}
        <AuthModeLink to="/login" redirectTo={redirectTo} color="teal.700" fontWeight="bold">
          ログイン
        </AuthModeLink>
      </Text>
    </Stack>
  );
}

export type { SignupValues } from "./schema";
