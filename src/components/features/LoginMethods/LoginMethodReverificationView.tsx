import { Alert, Field, Input, Spinner, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import type { LoginMethodReverificationController, LoginMethodReverificationFactor } from "./reverificationTypes";

export function LoginMethodReverificationView({ controller }: { controller: LoginMethodReverificationController }) {
  const { state } = controller;
  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <Stack gap={5} aria-live="polite">
        <Alert.Root status="error" borderRadius="lg" alignItems="flex-start">
          <Alert.Indicator />
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Root>
        <Button type="button" variant="outline" alignSelf="flex-start" onClick={controller.cancel}>
          閉じる
        </Button>
      </Stack>
    );
  }

  if (state.status === "starting" || state.status === "completing") {
    return (
      <Stack gap={4} align="center" py={6} aria-live="polite">
        <Spinner color="teal.600" />
        <Text>{state.status === "starting" ? "本人確認方法を確認しています。" : state.message}</Text>
        {state.status === "starting" ? (
          <Button type="button" variant="ghost" onClick={controller.cancel}>
            変更をやめる
          </Button>
        ) : null}
      </Stack>
    );
  }

  if (state.status === "selecting_factor") {
    return (
      <Stack gap={5}>
        <Stack gap={1}>
          <Text fontWeight="semibold">
            {state.stage === "second" ? "二段階認証の方法を選択" : "本人確認方法を選択"}
          </Text>
          <Text color="fg.muted">続行するため、利用できる方法から一つ選んでください。</Text>
        </Stack>
        {state.message ? (
          <Alert.Root status="info" borderRadius="lg" alignItems="flex-start" role="status" aria-live="polite">
            <Alert.Indicator />
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Root>
        ) : null}
        <Stack gap={2}>
          {state.factors.map((factor) => (
            <Button
              key={factor.key}
              type="button"
              variant="outline"
              justifyContent="flex-start"
              onClick={() => {
                void controller.selectFactor(factor.key);
              }}
            >
              {factorLabel(factor)}
            </Button>
          ))}
        </Stack>
        <Button type="button" variant="ghost" alignSelf="flex-start" onClick={controller.cancel}>
          変更をやめる
        </Button>
      </Stack>
    );
  }

  if (!state.selectedFactor) return null;

  if (state.status === "submitting") {
    return (
      <Stack gap={4} align="center" py={6} aria-live="polite">
        <Spinner color="teal.600" />
        <Text>{state.selectedFactor.input === "passkey" ? "パスキーを確認しています。" : "確認しています。"}</Text>
      </Stack>
    );
  }

  return (
    <FactorInput
      key={`${state.operationId}-${state.selectedFactor.key}`}
      factor={state.selectedFactor}
      factorCount={state.factors.length}
      message={state.message}
      controller={controller}
    />
  );
}

function FactorInput({
  factor,
  factorCount,
  message,
  controller,
}: {
  factor: LoginMethodReverificationFactor;
  factorCount: number;
  message: string | null;
  controller: LoginMethodReverificationController;
}) {
  const [value, setValue] = useState("");
  const isPassword = factor.input === "password";

  return (
    <Stack
      as="form"
      gap={5}
      onSubmit={(event) => {
        event.preventDefault();
        void controller.submit(value);
      }}
    >
      <Stack gap={1}>
        <Text fontWeight="semibold">{factorHeading(factor)}</Text>
        <Text color="fg.muted">{factorDescription(factor)}</Text>
      </Stack>
      {message ? (
        <Alert.Root status={message.includes("送信しました") ? "success" : "error"} borderRadius="lg">
          <Alert.Indicator />
          <Alert.Description>{message}</Alert.Description>
        </Alert.Root>
      ) : null}
      <Field.Root>
        <Field.Label>
          {isPassword ? "現在のパスワード" : factor.strategy === "backup_code" ? "バックアップコード" : "確認コード"}
        </Field.Label>
        <Input
          type={isPassword ? "password" : "text"}
          inputMode={isPassword || factor.strategy === "backup_code" ? undefined : "numeric"}
          autoComplete={isPassword ? "current-password" : "one-time-code"}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </Field.Root>
      <Stack direction={{ base: "column-reverse", sm: "row" }} justify="space-between" gap={3}>
        <Button type="button" variant="outline" onClick={controller.cancel}>
          変更をやめる
        </Button>
        <Button type="submit" colorPalette="teal">
          続ける
        </Button>
      </Stack>
      <Stack direction={{ base: "column", sm: "row" }} gap={2}>
        {factor.canResend ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void controller.resend();
            }}
          >
            確認コードを再送
          </Button>
        ) : null}
        {factorCount > 1 ? (
          <Button type="button" variant="ghost" onClick={controller.useAnotherFactor}>
            別の方法を使う
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function factorLabel(factor: LoginMethodReverificationFactor) {
  const destination = factor.safeIdentifier ? `（${factor.safeIdentifier}）` : "";
  switch (factor.strategy) {
    case "password":
      return "現在のパスワード";
    case "email_code":
      return `メールで確認${destination}`;
    case "phone_code":
      return `SMSで確認${destination}`;
    case "passkey":
      return "パスキーで確認";
    case "totp":
      return "認証アプリで確認";
    case "backup_code":
      return "バックアップコードで確認";
  }
}

function factorHeading(factor: LoginMethodReverificationFactor) {
  if (factor.strategy === "password") return "現在のパスワードを入力";
  if (factor.strategy === "totp") return "認証アプリのコードを入力";
  if (factor.strategy === "backup_code") return "バックアップコードを入力";
  return "確認コードを入力";
}

function factorDescription(factor: LoginMethodReverificationFactor) {
  if (factor.strategy === "password") return "続行するには、現在のパスワードで本人確認してください。";
  if (factor.strategy === "totp") return "認証アプリに表示されているコードを入力してください。";
  if (factor.strategy === "backup_code") return "保存している未使用のバックアップコードを入力してください。";
  return factor.safeIdentifier
    ? `${factor.safeIdentifier}に届いた確認コードを入力してください。`
    : "届いた確認コードを入力してください。";
}
