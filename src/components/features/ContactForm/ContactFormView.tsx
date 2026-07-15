import { Alert, Box, Checkbox, Field, Input, Link, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { FormEventHandler } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { LuCheck } from "react-icons/lu";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANIZATION_MAX_LENGTH,
} from "@/convex/constants";
import { CONTACT_TYPE_OPTIONS } from "@/convex/contact/schemas";
import { Button } from "@/src/components/ui/Button";
import { TurnstileWidget } from "./TurnstileWidget";

type ContactFormFields = {
  type: UseFormRegisterReturn<"type">;
  name: UseFormRegisterReturn<"name">;
  email: UseFormRegisterReturn<"email">;
  organization: UseFormRegisterReturn<"organization">;
  message: UseFormRegisterReturn<"message">;
};

type ContactFormFieldErrors = {
  type?: string;
  name?: string;
  email?: string;
  organization?: string;
  message?: string;
  acceptedPrivacy?: string;
};

type TurnstileViewModel = {
  widgetKey: number;
  siteKey: string;
  onError: (errorCode?: string) => void;
  onVerify: (token: string) => void;
};

export type ContactFormViewProps =
  | { status: "submitted" }
  | {
      status: "editing";
      acceptedPrivacy: boolean;
      errors: ContactFormFieldErrors;
      fields: ContactFormFields;
      isSubmitting: boolean;
      messageLength: number;
      messagePlaceholder: string;
      onAcceptedPrivacyChange: (accepted: boolean) => void;
      onSubmit: FormEventHandler<HTMLFormElement>;
      serverError: string | null;
      showTroubleGuidance: boolean;
      turnstile: TurnstileViewModel | null;
      verificationError: string | null;
    };

export function ContactFormView(props: ContactFormViewProps) {
  if (props.status === "submitted") {
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
    <form onSubmit={props.onSubmit} noValidate>
      <Stack gap={5}>
        {props.serverError ? (
          <Alert.Root status="error" borderRadius="md">
            <Alert.Indicator />
            <Alert.Description>{props.serverError}</Alert.Description>
          </Alert.Root>
        ) : null}

        <Field.Root invalid={!!props.errors.type}>
          <Field.Label>問い合わせ種別</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field {...props.fields.type} bg="white">
              {CONTACT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          {props.errors.type && <Field.ErrorText>{props.errors.type}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!props.errors.name}>
          <Field.Label>氏名</Field.Label>
          <Input
            {...props.fields.name}
            bg="white"
            maxLength={CONTACT_NAME_MAX_LENGTH}
            autoComplete="name"
            placeholder="例：山田 太郎"
          />
          {props.errors.name && <Field.ErrorText>{props.errors.name}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!props.errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input
            {...props.fields.email}
            bg="white"
            type="email"
            autoComplete="email"
            placeholder="例：yamada@example.com"
          />
          {props.errors.email && <Field.ErrorText>{props.errors.email}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!props.errors.organization}>
          <Field.Label>店舗名または会社名（任意）</Field.Label>
          <Input
            {...props.fields.organization}
            bg="white"
            maxLength={CONTACT_ORGANIZATION_MAX_LENGTH}
            autoComplete="organization"
            placeholder="例：シフトリ渋谷店"
          />
          {props.errors.organization && <Field.ErrorText>{props.errors.organization}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!props.errors.message}>
          <Field.Label>問い合わせ内容</Field.Label>
          <Textarea
            {...props.fields.message}
            bg="white"
            maxLength={CONTACT_MESSAGE_MAX_LENGTH}
            minH="180px"
            placeholder={props.messagePlaceholder}
            resize="vertical"
          />
          {props.showTroubleGuidance ? (
            <Text color="fg.muted" fontSize="xs" lineHeight="tall">
              エラーメッセージや直前の操作もご記載いただくと、解決時間が早くなります。
            </Text>
          ) : null}
          <Text alignSelf="flex-end" color="fg.muted" fontSize="xs">
            {props.messageLength}/{CONTACT_MESSAGE_MAX_LENGTH}
          </Text>
          {props.errors.message && <Field.ErrorText>{props.errors.message}</Field.ErrorText>}
        </Field.Root>

        <Field.Root invalid={!!props.errors.acceptedPrivacy}>
          <Checkbox.Root
            colorPalette="teal"
            checked={props.acceptedPrivacy}
            onCheckedChange={(details) => props.onAcceptedPrivacyChange(details.checked === true)}
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
          {props.errors.acceptedPrivacy && <Field.ErrorText>{props.errors.acceptedPrivacy}</Field.ErrorText>}
        </Field.Root>

        {props.turnstile ? (
          <TurnstileWidget
            key={props.turnstile.widgetKey}
            onError={props.turnstile.onError}
            onVerify={props.turnstile.onVerify}
            siteKey={props.turnstile.siteKey}
          />
        ) : null}
        {props.verificationError ? (
          <Text color="red.600" fontSize="sm">
            {props.verificationError}
          </Text>
        ) : null}

        <Button colorPalette="teal" loading={props.isSubmitting} size="lg" type="submit">
          問い合わせを送る
        </Button>
      </Stack>
    </form>
  );
}
