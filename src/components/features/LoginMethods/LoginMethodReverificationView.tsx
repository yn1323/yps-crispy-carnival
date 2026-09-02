import { Alert, Field, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { DialogActionArea } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/FormControls";
import type { LoginMethodReverificationController, LoginMethodReverificationFactor } from "./reverificationTypes";

export const isLoginMethodReverificationBusy = (controller: LoginMethodReverificationController) =>
  controller.state.status === "starting" ||
  controller.state.status === "submitting" ||
  controller.state.status === "completing";

const reverificationFormId = (controller: LoginMethodReverificationController) =>
  `login-method-reverification-${controller.state.operationId ?? "pending"}`;

export function LoginMethodReverificationActions({ controller }: { controller: LoginMethodReverificationController }) {
  const { state } = controller;
  if (state.status === "idle") return null;

  if (state.status === "error") {
    return (
      <DialogActionArea
        layout="standard"
        endAction={
          <Button type="button" variant="outline" onClick={controller.cancel}>
            閉じる
          </Button>
        }
      />
    );
  }

  if (isLoginMethodReverificationBusy(controller)) {
    const isSubmittingFactor = state.status === "submitting" && state.selectedFactor !== null;
    return (
      <DialogActionArea
        layout="standard"
        startAction={
          isSubmittingFactor ? (
            <Button type="button" variant="outline" disabled>
              キャンセル
            </Button>
          ) : undefined
        }
        endAction={
          isSubmittingFactor ? (
            <Button type="button" colorPalette="teal" loading loadingText="確認中">
              続ける
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              閉じる
            </Button>
          )
        }
      />
    );
  }

  if (state.status === "awaiting_input" && state.selectedFactor) {
    return (
      <DialogActionArea
        layout="standard"
        startAction={
          <Button type="button" variant="outline" onClick={controller.cancel}>
            キャンセル
          </Button>
        }
        endAction={
          <Button type="submit" form={reverificationFormId(controller)} colorPalette="teal">
            続ける
          </Button>
        }
      />
    );
  }

  return (
    <DialogActionArea
      layout="standard"
      endAction={
        <Button type="button" variant="outline" onClick={controller.cancel}>
          キャンセル
        </Button>
      }
    />
  );
}

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
      </Stack>
    );
  }

  if (state.status === "starting" || state.status === "completing" || state.status === "submitting") {
    return <ReverificationSkeleton />;
  }

  if (state.status === "selecting_factor") {
    return (
      <Stack gap={5}>
        <Stack gap={1}>
          <Text fontWeight="semibold">
            {state.stage === "second" ? "二段階認証の方法を選択" : "本人確認方法を選択"}
          </Text>
          <Text color="fg.muted">いずれか一つ選んでください。</Text>
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
      </Stack>
    );
  }

  if (!state.selectedFactor) return null;

  return (
    <FactorInput
      key={`${state.operationId}-${state.selectedFactor.key}`}
      factor={state.selectedFactor}
      message={state.message}
      controller={controller}
    />
  );
}

function ReverificationSkeleton() {
  return (
    <Stack gap={5} aria-label="本人確認フォームを読み込み中">
      <Stack gap={2}>
        <Skeleton h="20px" w="176px" />
        <Skeleton h="16px" w="300px" maxW="100%" />
      </Stack>
      <Skeleton h="40px" w="full" borderRadius="md" />
      <Skeleton h="16px" w="128px" alignSelf="flex-end" />
    </Stack>
  );
}

function FactorInput({
  factor,
  message,
  controller,
}: {
  factor: LoginMethodReverificationFactor;
  message: string | null;
  controller: LoginMethodReverificationController;
}) {
  const [value, setValue] = useState("");
  const isPassword = factor.input === "password";
  const heading = factorHeading(factor);

  return (
    <Stack
      as="form"
      id={reverificationFormId(controller)}
      gap={5}
      onSubmit={(event) => {
        event.preventDefault();
        void controller.submit(value);
      }}
    >
      <Stack gap={1}>
        {heading ? <Text fontWeight="semibold">{heading}</Text> : null}
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
          autocompletePolicy="auth"
          autoComplete={isPassword ? "current-password" : "one-time-code"}
          placeholder={isPassword || factor.strategy === "backup_code" ? "******" : "123456"}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </Field.Root>
      {factor.canResend ? (
        <Button
          type="button"
          variant="ghost"
          colorPalette="teal"
          size="sm"
          alignSelf="flex-end"
          fontWeight="semibold"
          onClick={() => {
            void controller.resend();
          }}
        >
          確認コードを再送する
        </Button>
      ) : null}
    </Stack>
  );
}

function factorLabel(factor: LoginMethodReverificationFactor) {
  const destination = factor.displayIdentifier ? `（${factor.displayIdentifier}）` : "";
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

function factorHeading(factor: LoginMethodReverificationFactor): string | null {
  if (factor.strategy === "password") return "";
  if (factor.strategy === "totp") return "認証アプリのコードを入力";
  if (factor.strategy === "backup_code") return "バックアップコードを入力";
  return null;
}

function factorDescription(factor: LoginMethodReverificationFactor) {
  if (factor.strategy === "password") return "現在のパスワードを入力してください。";
  if (factor.strategy === "totp") return "認証アプリに表示されているコードを入力してください。";
  if (factor.strategy === "backup_code") return "保存している未使用のバックアップコードを入力してください。";
  return factor.displayIdentifier
    ? `${factor.displayIdentifier}に届いた確認コードを入力してください。`
    : "届いた確認コードを入力してください。";
}
