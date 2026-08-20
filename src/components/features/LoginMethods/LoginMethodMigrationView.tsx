import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import {
  EMAIL_MIGRATION_CODE_FORM_ID,
  EMAIL_MIGRATION_EMAIL_FORM_ID,
  EMAIL_MIGRATION_PASSWORD_FORM_ID,
  EmailPasswordMigrationView,
} from "./EmailPasswordMigrationView";
import { GoogleConnectionView } from "./GoogleConnectionView";
import {
  isLoginMethodReverificationBusy,
  LoginMethodReverificationActions,
  LoginMethodReverificationView,
} from "./LoginMethodReverificationView";
import type { LoginMethodReverificationController } from "./reverificationTypes";
import type { EmailPasswordMigrationController } from "./useEmailPasswordMigrationController";
import type { GoogleConnectionController } from "./useGoogleConnectionController";

export type LoginMethodMigrationViewProps = {
  reverification: LoginMethodReverificationController;
  onBackToOverview: () => void;
} & (
  | { flow: "add-email-password"; controller: EmailPasswordMigrationController }
  | { flow: "connect-google"; controller: GoogleConnectionController }
);

export function LoginMethodMigrationView(props: LoginMethodMigrationViewProps) {
  const isReverifying = props.reverification.state.status !== "idle";
  const isReverificationBusy = isLoginMethodReverificationBusy(props.reverification);
  const isBusy = props.controller.state.feedback.status === "loading";
  const isInitialRead = props.flow === "add-email-password" && props.controller.state.phase === "loading";
  const dialogBusy = isReverifying ? isReverificationBusy : isBusy && !isInitialRead;
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationBusy) return;
      props.reverification.cancel();
    }
    if (!isBusy || isInitialRead) props.onBackToOverview();
  };

  return (
    <Dialog
      title={isReverifying ? "確認が必要です" : flowTitle(props)}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) requestClose();
      }}
      onClose={requestClose}
      onBackGuardRemoved={requestClose}
      preventClose={dialogBusy}
      isLoading={dialogBusy}
      footer={
        isReverifying ? (
          <LoginMethodReverificationActions controller={props.reverification} />
        ) : (
          <MigrationActions props={props} isBusy={isBusy} />
        )
      }
      mobileFullScreen
      maxW={{ md: "560px" }}
      maxH={{ md: "86dvh" }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 2, pb: { base: 6, md: 6 } }}
    >
      {isReverifying ? <LoginMethodReverificationView controller={props.reverification} /> : null}
      {!isReverifying && props.flow === "add-email-password" ? (
        <EmailPasswordMigrationView controller={props.controller} />
      ) : null}
      {!isReverifying && props.flow === "connect-google" ? (
        <GoogleConnectionView controller={props.controller} />
      ) : null}
    </Dialog>
  );
}

function MigrationActions({ props, isBusy }: { props: LoginMethodMigrationViewProps; isBusy: boolean }) {
  if (props.flow === "connect-google") {
    const isStarting = props.controller.state.phase === "redirecting" || props.controller.state.phase === "settling";
    if (props.controller.state.phase === "methodReady") {
      return (
        <DialogActionArea
          layout="standard"
          endAction={
            <Button type="button" variant="outline" onClick={props.onBackToOverview}>
              閉じる
            </Button>
          }
        />
      );
    }

    return (
      <DialogActionArea
        layout="flow"
        startAction={
          <Button type="button" variant="outline" disabled={isBusy} onClick={props.onBackToOverview}>
            キャンセル
          </Button>
        }
        endAction={
          <Button
            type="button"
            colorPalette="teal"
            loading={isBusy}
            loadingText={isStarting ? "Googleアカウントを確認中" : "確認中"}
            onClick={() => {
              void props.controller.start();
            }}
          >
            {props.controller.state.phase === "unavailable" ? "もう一度試す" : "Googleアカウントを選ぶ"}
          </Button>
        }
      />
    );
  }

  switch (props.controller.state.phase) {
    case "loading":
      return (
        <DialogActionArea
          layout="standard"
          endAction={
            <Button type="button" variant="outline" onClick={props.onBackToOverview}>
              閉じる
            </Button>
          }
        />
      );
    case "choosingEmail":
      return (
        <DialogActionArea
          layout="flow"
          startAction={
            <Button type="button" variant="outline" disabled={isBusy} onClick={props.onBackToOverview}>
              キャンセル
            </Button>
          }
          endAction={
            <Button
              type="submit"
              form={EMAIL_MIGRATION_EMAIL_FORM_ID}
              colorPalette="teal"
              loading={isBusy}
              loadingText="確認コードを送信中"
            >
              確認コードを送る
            </Button>
          }
        />
      );
    case "verifyingEmail":
      return (
        <DialogActionArea
          layout="flow"
          startAction={
            <Button type="button" variant="outline" disabled={isBusy} onClick={props.controller.reset}>
              入力し直す
            </Button>
          }
          endAction={
            <Button
              type="submit"
              form={EMAIL_MIGRATION_CODE_FORM_ID}
              colorPalette="teal"
              loading={isBusy}
              loadingText="確認中"
            >
              メールを確認
            </Button>
          }
        />
      );
    case "settingPassword":
      return (
        <DialogActionArea
          layout="flow"
          startAction={
            <Button type="button" variant="outline" disabled={isBusy} onClick={props.controller.reset}>
              戻る
            </Button>
          }
          endAction={
            <Button
              type="submit"
              form={EMAIL_MIGRATION_PASSWORD_FORM_ID}
              colorPalette="teal"
              loading={isBusy}
              loadingText="パスワードを設定中"
            >
              パスワードを設定
            </Button>
          }
        />
      );
    case "unavailable":
      return (
        <DialogActionArea
          layout="flow"
          startAction={
            <Button type="button" variant="outline" disabled={isBusy} onClick={props.onBackToOverview}>
              戻る
            </Button>
          }
          endAction={
            <Button
              type="button"
              colorPalette="teal"
              loading={isBusy}
              loadingText="もう一度試す"
              onClick={() => {
                void props.controller.refresh();
              }}
            >
              もう一度試す
            </Button>
          }
        />
      );
    case "methodReady":
      return (
        <DialogActionArea
          layout="standard"
          endAction={
            <Button type="button" variant="outline" onClick={props.onBackToOverview}>
              閉じる
            </Button>
          }
        />
      );
  }
}

function flowTitle(props: LoginMethodMigrationViewProps) {
  if (props.flow === "add-email-password" && props.controller.state.phase === "settingPassword") {
    return "パスワード設定";
  }
  return props.flow === "add-email-password" ? "メールアドレスとパスワードを設定" : "Googleログインを追加";
}
