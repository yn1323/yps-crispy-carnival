import { Alert, Box, Checkbox, Field, Input, Link, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link as RouterLink } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { LuCheck } from "react-icons/lu";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANIZATION_MAX_LENGTH,
} from "@/convex/constants";
import {
  CONTACT_TYPE_OPTIONS,
  type ContactFormData,
  contactFormSchema,
  type SubmitContactInput,
} from "@/convex/contact/schemas";
import { Button } from "@/src/components/ui/Button";
import { CONVEX_SITE_URL, TURNSTILE_SITE_KEY } from "@/src/constants/env";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { TurnstileWidget } from "./TurnstileWidget";

type ContactSubmitData = Omit<SubmitContactInput, "turnstileToken" | "requestId"> & {
  turnstileToken: string;
  requestId: string;
};

async function submitContactRequest(data: ContactSubmitData): Promise<void> {
  const response = await fetch(`${CONVEX_SITE_URL}/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
  if (!response.ok || body?.status !== "accepted") {
    throw new Error(body?.error ?? "問い合わせを送信できませんでした。少し時間をおいてお試しください");
  }
}

type ContactFormViewProps = {
  onSubmit: (data: ContactSubmitData) => Promise<void>;
  verification: { siteKey: string } | { token: string };
};

export function ContactFormView({ onSubmit, verification }: ContactFormViewProps) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("token" in verification ? verification.token : "");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      type: "introduction",
      name: "",
      email: "",
      organization: "",
      message: "",
      acceptedPrivacy: false,
    },
  });
  const acceptedPrivacy = watch("acceptedPrivacy");
  const messageLength = watch("message").length;
  const handleVerified = useCallback((token: string) => {
    setTurnstileToken(token);
    setVerificationError(null);
  }, []);
  const handleVerificationError = useCallback((errorCode?: string) => {
    if (import.meta.env.DEV && errorCode) console.warn("Turnstile client verification failed", { errorCode });
    setTurnstileToken("");
    setVerificationError("セキュリティ確認をやり直してください");
  }, []);
  const { run: submitOnce, isRunning } = useSingleFlight(async (values: ContactFormData) => {
    if (!turnstileToken) {
      setVerificationError("セキュリティ確認を完了してください");
      return;
    }
    setServerError(null);
    try {
      await onSubmit({ ...values, turnstileToken, requestId: crypto.randomUUID() });
      setSubmitted(true);
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "問い合わせを送信できませんでした。少し時間をおいてお試しください",
      );
      if ("siteKey" in verification) {
        setTurnstileToken("");
        setTurnstileKey((current) => current + 1);
      }
    }
  });

  if (submitted) {
    return (
      <Stack align="center" bg="teal.50" borderRadius="xl" gap={4} p={{ base: 6, md: 10 }} textAlign="center">
        <Box bg="teal.500" borderRadius="full" color="white" p={3}>
          <LuCheck aria-hidden size={28} />
        </Box>
        <Text as="h2" color="gray.950" fontSize="xl" fontWeight="bold">
          お問い合わせを受け付けました
        </Text>
        <Text color="fg.muted" fontSize="sm" lineHeight="tall">
          内容を確認してご連絡します。
        </Text>
        <Button asChild colorPalette="teal" minW="160px" mt={2}>
          <RouterLink to="/">TOPに戻る</RouterLink>
        </Button>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit((values) => void submitOnce(values))} noValidate>
      <Stack gap={5}>
        {serverError ? (
          <Alert.Root status="error" borderRadius="md">
            <Alert.Indicator />
            <Alert.Description>{serverError}</Alert.Description>
          </Alert.Root>
        ) : null}

        <Field.Root invalid={!!errors.type}>
          <Field.Label>問い合わせ種別</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field {...register("type")} bg="white">
              {CONTACT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          {errors.type && <Field.ErrorText>{errors.type.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.name}>
          <Field.Label>氏名</Field.Label>
          <Input {...register("name")} bg="white" maxLength={CONTACT_NAME_MAX_LENGTH} autoComplete="name" />
          {errors.name && <Field.ErrorText>{errors.name.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input {...register("email")} bg="white" type="email" autoComplete="email" />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.organization}>
          <Field.Label>店舗名または会社名（任意）</Field.Label>
          <Input
            {...register("organization")}
            bg="white"
            maxLength={CONTACT_ORGANIZATION_MAX_LENGTH}
            autoComplete="organization"
          />
          {errors.organization && <Field.ErrorText>{errors.organization.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.message}>
          <Field.Label>問い合わせ内容</Field.Label>
          <Textarea
            {...register("message")}
            bg="white"
            maxLength={CONTACT_MESSAGE_MAX_LENGTH}
            minH="180px"
            resize="vertical"
          />
          <Text alignSelf="flex-end" color="fg.muted" fontSize="xs">
            {messageLength}/{CONTACT_MESSAGE_MAX_LENGTH}
          </Text>
          {errors.message && <Field.ErrorText>{errors.message.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!errors.acceptedPrivacy}>
          <Checkbox.Root
            colorPalette="teal"
            checked={acceptedPrivacy}
            onCheckedChange={(details) =>
              setValue("acceptedPrivacy", details.checked === true, { shouldDirty: true, shouldValidate: true })
            }
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label fontSize="sm" lineHeight="tall">
              <Link href="/privacy" color="teal.700" fontWeight="bold">
                プライバシーポリシー
              </Link>
              に同意します
            </Checkbox.Label>
          </Checkbox.Root>
          {errors.acceptedPrivacy && <Field.ErrorText>{errors.acceptedPrivacy.message}</Field.ErrorText>}
        </Field.Root>

        {"siteKey" in verification ? (
          <TurnstileWidget
            key={turnstileKey}
            onError={handleVerificationError}
            onVerify={handleVerified}
            siteKey={verification.siteKey}
          />
        ) : null}
        {verificationError ? (
          <Text color="red.600" fontSize="sm">
            {verificationError}
          </Text>
        ) : null}

        <Button colorPalette="teal" loading={isRunning} size="lg" type="submit">
          問い合わせを送る
        </Button>
      </Stack>
    </form>
  );
}

export function ContactForm() {
  return <ContactFormView onSubmit={submitContactRequest} verification={{ siteKey: TURNSTILE_SITE_KEY }} />;
}
