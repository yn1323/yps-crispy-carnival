import {
  Alert,
  Box,
  Card,
  Container,
  Field,
  Flex,
  Grid,
  Heading,
  Icon,
  Image,
  Input,
  Link,
  Separator,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate } from "@tanstack/react-router";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { FcGoogle } from "react-icons/fc";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { z } from "zod";
import { Header } from "@/src/components/templates/Header";
import { Button, IconButton } from "@/src/components/ui/Button";
import loginIllustration from "./login.webp";
import { normalizeAuthRedirect } from "./redirect";

type AuthMode = "login" | "signup" | "forgot-password";
type ForgotStep = "request" | "reset";

type AuthPageProps = {
  mode: AuthMode;
  redirect?: string;
};

const loginSchema = z.object({
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式で入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const signupSchema = z.object({
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式で入力してください"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
});

const emailVerificationSchema = z.object({
  code: z.string().min(1, "確認コードを入力してください"),
});

const forgotRequestSchema = z.object({
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式で入力してください"),
});

const forgotResetSchema = z.object({
  code: z.string().min(1, "確認コードを入力してください"),
  password: z.string().min(8, "新しいパスワードは8文字以上で入力してください"),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
type EmailVerificationValues = z.infer<typeof emailVerificationSchema>;
type ForgotRequestValues = z.infer<typeof forgotRequestSchema>;
type ForgotResetValues = z.infer<typeof forgotResetSchema>;

type LoginFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  redirectTo: string;
  onGoogle: () => void;
  onSubmit: (values: LoginValues) => void;
};

type SignupFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  isVerificationStep?: boolean;
  redirectTo: string;
  onGoogle: () => void;
  onSubmit: (values: SignupValues) => void;
  onVerifyEmail: (values: EmailVerificationValues) => void;
};

type ForgotPasswordFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  step?: ForgotStep;
  email?: string;
  redirectTo: string;
  onRequestReset: (values: ForgotRequestValues) => void;
  onResetPassword: (values: ForgotResetValues) => void;
};

export function AuthPage({ mode, redirect }: AuthPageProps) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const redirectTo = useMemo(() => normalizeAuthRedirect(redirect), [redirect]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>("request");
  const [forgotEmail, setForgotEmail] = useState("");

  if (authLoaded && isSignedIn) {
    return <Navigate to={redirectTo} replace />;
  }

  const completeWithSession = async (sessionId: string | null) => {
    if (!sessionId) {
      setErrorMessage("セッションを作成できませんでした。時間をおいてもう一度お試しください。");
      return;
    }

    const setActive = mode === "signup" ? setSignUpActive : setSignInActive;
    if (!setActive) return;

    await setActive({ session: sessionId });
    window.location.assign(redirectTo);
  };

  const handleGoogle = async () => {
    const resource = mode === "signup" ? signUp : signIn;
    if (!resource || (!signInLoaded && mode !== "signup") || (!signUpLoaded && mode === "signup")) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      await resource.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectTo,
      });
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (values: LoginValues) => {
    if (!signInLoaded) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      const result = await signIn.create({
        strategy: "password",
        identifier: values.email,
        password: values.password,
      });

      if (result.status === "complete") {
        await completeWithSession(result.createdSessionId);
        return;
      }

      setErrorMessage("追加の確認が必要です。Googleログインを使うか、時間をおいてもう一度お試しください。");
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (values: SignupValues) => {
    if (!signUpLoaded) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      const result = await signUp.create({
        emailAddress: values.email,
        password: values.password,
      });

      if (result.status === "complete") {
        await completeWithSession(result.createdSessionId);
        return;
      }

      if (result.unverifiedFields.includes("email_address")) {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setIsVerificationStep(true);
        return;
      }

      setErrorMessage("登録に追加情報が必要です。Google登録を使うか、時間をおいてもう一度お試しください。");
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyEmail = async (values: EmailVerificationValues) => {
    if (!signUpLoaded) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: values.code });
      if (result.status === "complete") {
        await completeWithSession(result.createdSessionId);
        return;
      }

      setErrorMessage("メール確認が完了しませんでした。コードを確認してもう一度お試しください。");
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestReset = async (values: ForgotRequestValues) => {
    if (!signInLoaded) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: values.email,
      });
      setForgotEmail(values.email);
      setForgotStep("reset");
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (values: ForgotResetValues) => {
    if (!signInLoaded) return;

    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      const verified = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: values.code,
      });
      const result =
        verified.status === "needs_new_password"
          ? await verified.resetPassword({ password: values.password })
          : verified;

      if (result.status === "complete") {
        await completeWithSession(result.createdSessionId);
        return;
      }

      setErrorMessage("パスワードを再設定できませんでした。コードを確認してもう一度お試しください。");
    } catch (error) {
      setErrorMessage(getClerkErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthContent
      mode={mode}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting || !authLoaded}
      isVerificationStep={isVerificationStep}
      forgotStep={forgotStep}
      forgotEmail={forgotEmail}
      redirectTo={redirectTo}
      onGoogle={handleGoogle}
      onLogin={handleLogin}
      onSignup={handleSignup}
      onVerifyEmail={handleVerifyEmail}
      onRequestReset={handleRequestReset}
      onResetPassword={handleResetPassword}
    />
  );
}

type AuthContentProps = {
  mode: AuthMode;
  errorMessage?: string;
  isSubmitting?: boolean;
  isVerificationStep?: boolean;
  forgotStep?: ForgotStep;
  forgotEmail?: string;
  redirectTo?: string;
  onGoogle: () => void;
  onLogin: (values: LoginValues) => void;
  onSignup: (values: SignupValues) => void;
  onVerifyEmail: (values: EmailVerificationValues) => void;
  onRequestReset: (values: ForgotRequestValues) => void;
  onResetPassword: (values: ForgotResetValues) => void;
};

export function AuthContent({
  mode,
  errorMessage,
  isSubmitting,
  isVerificationStep,
  forgotStep,
  forgotEmail,
  redirectTo = "/dashboard",
  onGoogle,
  onLogin,
  onSignup,
  onVerifyEmail,
  onRequestReset,
  onResetPassword,
}: AuthContentProps) {
  const title =
    mode === "login" ? "シフトリにログイン" : mode === "signup" ? "シフトリをはじめる" : "パスワードを再設定";
  const description = mode === "forgot-password" ? "登録済みメールアドレスに再設定コードを送信します。" : undefined;

  return (
    <Box minH="100dvh" bgGradient="to-b" gradientFrom="#E6F7F5" gradientVia="#F3FBFA" gradientTo="white">
      <Header variant="public" showLinks={false} showLogin={false} />
      <Container
        as="main"
        maxW="7xl"
        minH="100dvh"
        display="flex"
        alignItems="center"
        px={{ base: 4, md: 8 }}
        pt={{ base: "66px", md: "80px" }}
        pb={0}
      >
        <Grid
          w="full"
          mt={0}
          templateColumns={{ base: "1fr", lg: "minmax(0, 1.1fr) minmax(420px, 0.9fr)" }}
          gap={{ base: 7, lg: 12 }}
          alignItems="center"
        >
          <AuthIllustrationPanel mode={mode} />
          <Card.Root
            w="full"
            maxW={{ base: "640px", lg: "none" }}
            mx={{ base: "auto", lg: 0 }}
            borderWidth={0}
            shadow="xl"
            borderRadius="2xl"
            overflow="hidden"
          >
            <Card.Body p={{ base: 6, md: 8 }}>
              <VStack align="stretch" gap={8}>
                <Stack gap={2}>
                  <Heading as="h1" size={{ base: "xl", md: "2xl" }} color="gray.950">
                    {title}
                  </Heading>
                  {description && (
                    <Text color="gray.700" textStyle="bodySm" lineHeight="1.8">
                      {description}
                    </Text>
                  )}
                </Stack>

                {mode === "login" && (
                  <LoginForm
                    errorMessage={errorMessage}
                    isSubmitting={isSubmitting}
                    redirectTo={redirectTo}
                    onGoogle={onGoogle}
                    onSubmit={onLogin}
                  />
                )}
                {mode === "signup" && (
                  <SignupForm
                    errorMessage={errorMessage}
                    isSubmitting={isSubmitting}
                    isVerificationStep={isVerificationStep}
                    redirectTo={redirectTo}
                    onGoogle={onGoogle}
                    onSubmit={onSignup}
                    onVerifyEmail={onVerifyEmail}
                  />
                )}
                {mode === "forgot-password" && (
                  <ForgotPasswordForm
                    errorMessage={errorMessage}
                    isSubmitting={isSubmitting}
                    step={forgotStep}
                    email={forgotEmail}
                    redirectTo={redirectTo}
                    onRequestReset={onRequestReset}
                    onResetPassword={onResetPassword}
                  />
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        </Grid>
      </Container>
    </Box>
  );
}

export function LoginForm({ errorMessage, isSubmitting, redirectTo, onGoogle, onSubmit }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      <OAuthButton isSubmitting={isSubmitting} onClick={onGoogle} label="Googleでログイン" />
      <FormDivider />
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
        <Link href={buildAuthHref("/forgot-password", redirectTo)} color="teal.700" fontWeight="bold" textStyle="sm">
          パスワードを忘れた方
        </Link>
      </Flex>
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="ログイン中">
        ログイン
      </Button>
      <Text color="gray.700" textAlign="center" textStyle="sm">
        はじめての方は{" "}
        <Link href={buildAuthHref("/signup", redirectTo)} color="teal.700" fontWeight="bold">
          新規登録
        </Link>
      </Text>
    </Stack>
  );
}

export function SignupForm({
  errorMessage,
  isSubmitting,
  isVerificationStep,
  redirectTo,
  onGoogle,
  onSubmit,
  onVerifyEmail,
}: SignupFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });
  const {
    register: registerCode,
    handleSubmit: handleCodeSubmit,
    formState: { errors: codeErrors },
  } = useForm<EmailVerificationValues>({ resolver: zodResolver(emailVerificationSchema) });

  if (isVerificationStep) {
    return (
      <Stack as="form" gap={5} onSubmit={handleCodeSubmit(onVerifyEmail)}>
        <AuthError message={errorMessage} />
        <Alert.Root status="info" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>メールに届いた確認コードを入力してください。</Alert.Description>
        </Alert.Root>
        <Field.Root invalid={!!codeErrors.code}>
          <Field.Label>確認コード</Field.Label>
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...registerCode("code")} />
          <Field.ErrorText>{codeErrors.code?.message}</Field.ErrorText>
        </Field.Root>
        <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="確認中">
          登録を完了する
        </Button>
        <Text color="gray.700" textAlign="center" textStyle="sm">
          登録方法を変える場合は{" "}
          <Link href={buildAuthHref("/signup", redirectTo)} color="teal.700" fontWeight="bold">
            最初からやり直す
          </Link>
        </Text>
      </Stack>
    );
  }

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      <OAuthButton isSubmitting={isSubmitting} onClick={onGoogle} label="Googleで登録" />
      <FormDivider />
      <AuthError message={errorMessage} />
      <Field.Root invalid={!!errors.email}>
        <Field.Label>メールアドレス</Field.Label>
        <Input type="email" autoComplete="email" placeholder="example@example.com" {...register("email")} />
        <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={!!errors.password}>
        <Field.Label>パスワード</Field.Label>
        <PasswordInput autoComplete="new-password" placeholder="8文字以上" {...register("password")} />
        <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
      </Field.Root>
      <Button type="submit" colorPalette="teal" size="lg" loading={isSubmitting} loadingText="作成中">
        アカウントを作成
      </Button>
      <Text color="gray.700" textAlign="center" textStyle="sm">
        すでにアカウントをお持ちの方は{" "}
        <Link href={buildAuthHref("/login", redirectTo)} color="teal.700" fontWeight="bold">
          ログイン
        </Link>
      </Text>
    </Stack>
  );
}

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
          <Link href={buildAuthHref("/login", redirectTo)} color="teal.700" fontWeight="bold">
            ログインに戻る
          </Link>
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
        <Link href={buildAuthHref("/login", redirectTo)} color="teal.700" fontWeight="bold">
          ログインに戻る
        </Link>
      </Text>
    </Stack>
  );
}

export function SsoCallbackPage() {
  const clerk = useClerk();
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    clerk
      .handleRedirectCallback({
        signInUrl: "/login",
        signUpUrl: "/signup",
        signInFallbackRedirectUrl: "/dashboard",
        signUpFallbackRedirectUrl: "/dashboard",
        continueSignUpUrl: "/signup",
        resetPasswordUrl: "/forgot-password",
      })
      .catch((error) => setErrorMessage(getClerkErrorMessage(error)));
  }, [clerk]);

  return (
    <AuthContent
      mode="login"
      errorMessage={errorMessage}
      isSubmitting
      onGoogle={() => {}}
      onLogin={() => {}}
      onSignup={() => {}}
      onVerifyEmail={() => {}}
      onRequestReset={() => {}}
      onResetPassword={() => {}}
    />
  );
}

const AuthIllustrationPanel = ({ mode }: { mode: AuthMode }) => (
  <Box display={{ base: "none", lg: mode === "forgot-password" ? "none" : "block" }}>
    <VStack align="stretch">
      <Box maxW={{ base: "320px", md: "640px", lg: "720px" }} mx={{ base: "auto", lg: 0 }}>
        <Box borderRadius="2xl" overflow="hidden">
          <Image
            src={loginIllustration}
            alt="シフト作成の画面イメージ"
            w="full"
            style={{
              WebkitMaskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0, 0, 0, 0.9) 70%, transparent 100%)",
              maskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0, 0, 0, 0.9) 70%, transparent 100%)",
            }}
          />
        </Box>
      </Box>
    </VStack>
  </Box>
);

const OAuthButton = ({
  label,
  isSubmitting,
  onClick,
}: {
  label: string;
  isSubmitting?: boolean;
  onClick: () => void;
}) => (
  <Button type="button" size="lg" variant="outline" onClick={onClick} disabled={isSubmitting}>
    <Icon as={FcGoogle} boxSize={5} />
    {label}
  </Button>
);

const FormDivider = () => (
  <Flex align="center" gap={4}>
    <Separator flex={1} />
    <Text color="gray.500" fontSize="sm">
      または
    </Text>
    <Separator flex={1} />
  </Flex>
);

const AuthError = ({ message }: { message?: string }) => {
  if (!message) return null;

  return (
    <Alert.Root status="error" borderRadius="lg">
      <Alert.Indicator />
      <Alert.Description>{message}</Alert.Description>
    </Alert.Root>
  );
};

function buildAuthHref(path: "/login" | "/signup" | "/forgot-password", redirectTo: string) {
  return `${path}?redirect=${encodeURIComponent(redirectTo)}`;
}

const PasswordInput = (props: ComponentProps<typeof Input>) => {
  const [visible, setVisible] = useState(false);

  return (
    <Box position="relative" w="full">
      <Input type={visible ? "text" : "password"} w="full" pr="3rem" {...props} />
      <IconButton
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
        type="button"
        variant="ghost"
        size="sm"
        position="absolute"
        top="50%"
        right={1}
        transform="translateY(-50%)"
        onClick={() => setVisible((current) => !current)}
      >
        <Icon as={visible ? LuEyeOff : LuEye} boxSize={4} />
      </IconButton>
    </Box>
  );
};

function getClerkErrorMessage(error: unknown) {
  const clerkError = getFirstClerkError(error);
  if (!clerkError) return "認証に失敗しました。時間をおいてもう一度お試しください。";

  switch (clerkError.code) {
    case "form_identifier_not_found":
      return "このメールアドレスのアカウントが見つかりません。";
    case "form_password_incorrect":
    case "form_password_or_identifier_incorrect":
      return "メールアドレスまたはパスワードが正しくありません。";
    case "form_code_incorrect":
      return "確認コードが正しくありません。";
    case "form_code_expired":
      return "確認コードの有効期限が切れています。もう一度お試しください。";
    case "form_password_length_too_short":
      return "パスワードは8文字以上で入力してください。";
    case "form_password_pwned":
    case "form_password_compromised":
      return "このパスワードは安全性に問題があります。別のパスワードを設定してください。";
    case "form_identifier_exists":
      return "このメールアドレスはすでに登録されています。ログインをお試しください。";
    case "too_many_requests":
      return "試行回数が多すぎます。時間をおいてもう一度お試しください。";
    default:
      return clerkError.longMessage || clerkError.message || "認証に失敗しました。入力内容を確認してください。";
  }
}

function getFirstClerkError(error: unknown): { code?: string; message?: string; longMessage?: string } | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("errors" in error && Array.isArray(error.errors)) {
    return error.errors[0];
  }

  if ("code" in error || "message" in error) {
    return error as { code?: string; message?: string; longMessage?: string };
  }

  return undefined;
}
