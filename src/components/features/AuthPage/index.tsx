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
  Skeleton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, Link as RouterLink } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { FcGoogle } from "react-icons/fc";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { z } from "zod";
import { withOpenExternalBrowser } from "@/convex/_lib/lineUrl";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { Button, IconButton } from "@/src/components/ui/Button";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { isLineInAppBrowser } from "@/src/utils/inAppBrowser";
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
  isLineBrowser?: boolean;
  redirectTo: string;
  onGoogle: () => void | Promise<void>;
  onSubmit: (values: LoginValues) => void | Promise<void>;
};

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

type ForgotPasswordFormProps = {
  errorMessage?: string;
  isSubmitting?: boolean;
  step?: ForgotStep;
  email?: string;
  redirectTo: string;
  onRequestReset: (values: ForgotRequestValues) => void | Promise<void>;
  onResetPassword: (values: ForgotResetValues) => void | Promise<void>;
};

type AuthRoutePath = "/login" | "/signup" | "/forgot-password";

export function AuthPage({ mode, redirect }: AuthPageProps) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const redirectTo = useMemo(() => normalizeAuthRedirect(redirect), [redirect]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>("request");
  const [forgotEmail, setForgotEmail] = useState("");

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

  const { run: runAuthAction, isRunning: isSubmitting } = useSingleFlight(async (action: () => Promise<void>) => {
    await action();
  });

  if (!authLoaded) {
    return (
      <AuthContent
        mode={mode}
        isInitialLoading
        redirectTo={redirectTo}
        onGoogle={() => {}}
        onLogin={() => {}}
        onSignup={() => {}}
        onVerifyEmail={() => {}}
        onRestartSignup={() => {}}
        onRequestReset={() => {}}
        onResetPassword={() => {}}
      />
    );
  }

  if (isSignedIn) {
    return <Navigate to={redirectTo} replace />;
  }

  const isLineBrowser = isLineInAppBrowser(navigator.userAgent);

  const handleGoogle = () =>
    runAuthAction(async () => {
      // LINE内ブラウザではGoogle OAuthがブロックされる（403: disallowed_useragent）ため、
      // 現在のページを外部ブラウザで開き直してもらう
      if (isLineBrowser) {
        window.location.assign(withOpenExternalBrowser(window.location.href));
        return;
      }

      const resource = mode === "signup" ? signUp : signIn;
      if (!resource || (!signInLoaded && mode !== "signup") || (!signUpLoaded && mode === "signup")) return;

      setErrorMessage(undefined);
      try {
        await resource.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: redirectTo,
        });
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleLogin = (values: LoginValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
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
      }
    });

  const handleSignup = (values: SignupValues) =>
    runAuthAction(async () => {
      if (!signUpLoaded) return;

      setErrorMessage(undefined);
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
      }
    });

  const handleVerifyEmail = (values: EmailVerificationValues) =>
    runAuthAction(async () => {
      if (!signUpLoaded) return;

      setErrorMessage(undefined);
      try {
        const result = await signUp.attemptEmailAddressVerification({ code: values.code });
        if (result.status === "complete") {
          await completeWithSession(result.createdSessionId);
          return;
        }

        setErrorMessage("メール確認が完了しませんでした。コードを確認してもう一度お試しください。");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleRequestReset = (values: ForgotRequestValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
      try {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: values.email,
        });
        setForgotEmail(values.email);
        setForgotStep("reset");
      } catch (error) {
        setErrorMessage(getClerkErrorMessage(error));
      }
    });

  const handleResetPassword = (values: ForgotResetValues) =>
    runAuthAction(async () => {
      if (!signInLoaded) return;

      setErrorMessage(undefined);
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
      }
    });

  const handleRestartSignup = () => {
    setErrorMessage(undefined);
    setIsVerificationStep(false);
  };

  return (
    <AuthContent
      mode={mode}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      isVerificationStep={isVerificationStep}
      forgotStep={forgotStep}
      forgotEmail={forgotEmail}
      redirectTo={redirectTo}
      isLineBrowser={isLineBrowser}
      onGoogle={handleGoogle}
      onLogin={handleLogin}
      onSignup={handleSignup}
      onVerifyEmail={handleVerifyEmail}
      onRestartSignup={handleRestartSignup}
      onRequestReset={handleRequestReset}
      onResetPassword={handleResetPassword}
    />
  );
}

type AuthContentProps = {
  mode: AuthMode;
  errorMessage?: string;
  isInitialLoading?: boolean;
  isSubmitting?: boolean;
  isVerificationStep?: boolean;
  forgotStep?: ForgotStep;
  forgotEmail?: string;
  redirectTo?: string;
  isLineBrowser?: boolean;
  onGoogle: () => void | Promise<void>;
  onLogin: (values: LoginValues) => void | Promise<void>;
  onSignup: (values: SignupValues) => void | Promise<void>;
  onVerifyEmail: (values: EmailVerificationValues) => void | Promise<void>;
  onRestartSignup: () => void | Promise<void>;
  onRequestReset: (values: ForgotRequestValues) => void | Promise<void>;
  onResetPassword: (values: ForgotResetValues) => void | Promise<void>;
};

export function AuthContent({
  mode,
  errorMessage,
  isInitialLoading,
  isSubmitting,
  isVerificationStep,
  forgotStep,
  forgotEmail,
  redirectTo = "/dashboard",
  isLineBrowser,
  onGoogle,
  onLogin,
  onSignup,
  onVerifyEmail,
  onRestartSignup,
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
        pt={HEADER_HEIGHT}
        pb={0}
      >
        <Grid
          w="full"
          mt={0}
          templateColumns={{ base: "1fr", lg: "minmax(0, 1.1fr) minmax(420px, 0.9fr)" }}
          gap={{ base: 7, lg: 12 }}
          alignItems="center"
        >
          <AuthIllustrationPanel />
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

                {isInitialLoading && <AuthInitialLoading />}

                {!isInitialLoading && mode === "login" && (
                  <LoginForm
                    errorMessage={errorMessage}
                    isSubmitting={isSubmitting}
                    isLineBrowser={isLineBrowser}
                    redirectTo={redirectTo}
                    onGoogle={onGoogle}
                    onSubmit={onLogin}
                  />
                )}
                {!isInitialLoading && mode === "signup" && (
                  <SignupForm
                    errorMessage={errorMessage}
                    isSubmitting={isSubmitting}
                    isVerificationStep={isVerificationStep}
                    isLineBrowser={isLineBrowser}
                    redirectTo={redirectTo}
                    onGoogle={onGoogle}
                    onSubmit={onSignup}
                    onVerifyEmail={onVerifyEmail}
                    onRestartSignup={onRestartSignup}
                  />
                )}
                {!isInitialLoading && mode === "forgot-password" && (
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
      {isLineBrowser && <LineBrowserNotice />}
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
      </Stack>
    );
  }

  return (
    <Stack as="form" gap={5} onSubmit={handleSubmit(onSubmit)}>
      {isLineBrowser && <LineBrowserNotice />}
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

export function SsoCallbackPage() {
  const clerk = useClerk();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(true);

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
      .catch((error) => {
        setErrorMessage(getClerkErrorMessage(error));
        setIsProcessing(false);
      });
  }, [clerk]);

  if (isProcessing && !errorMessage) {
    return <FullPageSpinner />;
  }

  return (
    <AuthContent
      mode="login"
      errorMessage={errorMessage}
      isSubmitting={false}
      onGoogle={() => {}}
      onLogin={() => {}}
      onSignup={() => {}}
      onVerifyEmail={() => {}}
      onRestartSignup={() => {}}
      onRequestReset={() => {}}
      onResetPassword={() => {}}
    />
  );
}

const AuthInitialLoading = () => (
  <Stack role="status" aria-label="認証情報を確認中" minH={{ base: "340px", md: "360px" }} gap={5}>
    <Text color="gray.600" textStyle="sm">
      認証情報を確認しています
    </Text>
    <Skeleton h="48px" w="full" borderRadius="lg" />
    <Flex align="center" gap={4}>
      <Separator flex={1} />
      <Skeleton h="14px" w="48px" />
      <Separator flex={1} />
    </Flex>
    <Stack gap={4}>
      <Skeleton h="72px" w="full" borderRadius="lg" />
      <Skeleton h="72px" w="full" borderRadius="lg" />
    </Stack>
    <Skeleton h="48px" w="full" borderRadius="lg" />
    <Skeleton h="16px" w="160px" mx="auto" />
  </Stack>
);

const AuthIllustrationPanel = () => (
  <Box display={{ base: "none", lg: "block" }}>
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
  onClick: () => void | Promise<void>;
}) => (
  <Button type="button" size="lg" variant="outline" onClick={onClick} disabled={isSubmitting}>
    <Icon as={FcGoogle} boxSize={5} />
    {label}
  </Button>
);

// LINE内ブラウザではGoogle OAuthが使えないため、Googleボタンが外部ブラウザ起動に変わることを案内する
const LineBrowserNotice = () => (
  <Alert.Root status="warning" borderRadius="lg">
    <Alert.Indicator />
    <Alert.Description>
      LINEアプリ内ではGoogleログインを利用できません。Googleのボタンを押すと、外部ブラウザでこのページを開き直します。
    </Alert.Description>
  </Alert.Root>
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

// Clerk の Bot sign-up protection はこの ID を起点に CAPTCHA を描画する。
const ClerkCaptcha = () => (
  <Box id="clerk-captcha" w="full" minH="1px" data-cl-theme="light" data-cl-size="flexible" data-cl-language="ja-JP" />
);

type AuthModeLinkProps = Omit<ComponentProps<typeof Link>, "asChild" | "children" | "href"> & {
  children: ReactNode;
  redirectTo: string;
  to: AuthRoutePath;
};

const AuthModeLink = ({ children, redirectTo, to, ...linkProps }: AuthModeLinkProps) => (
  <Link asChild _hover={{ color: "teal.800", textDecoration: "underline" }} {...linkProps}>
    <RouterLink to={to} search={{ redirect: redirectTo }}>
      {children}
    </RouterLink>
  </Link>
);

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
