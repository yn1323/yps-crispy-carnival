import { Dialog } from "@/src/components/ui/Dialog";
import { EmailPasswordMigrationView } from "./EmailPasswordMigrationView";
import { GoogleConnectionView } from "./GoogleConnectionView";
import { LoginMethodReverificationView } from "./LoginMethodReverificationView";
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
  const isReverificationSubmitting =
    props.reverification.state.status === "submitting" || props.reverification.state.status === "completing";
  const isBusy = props.controller.state.feedback.status === "loading";
  const requestClose = () => {
    if (isReverifying) {
      if (isReverificationSubmitting) return;
      props.reverification.cancel();
    }
    if (!isBusy) props.onBackToOverview();
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
      preventClose={isReverifying ? isReverificationSubmitting : isBusy}
      hideFooter
      keyboardAwareViewport
      maxW={{ base: "100vw", md: "560px" }}
      maxH={{ base: "100dvh", md: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", md: "auto" },
        my: { base: 0, md: "auto" },
        borderRadius: { base: 0, md: "l3" },
      }}
      bodyProps={{ px: { base: 4, md: 6 }, pt: 2, pb: { base: 6, md: 6 } }}
    >
      {isReverifying ? <LoginMethodReverificationView controller={props.reverification} /> : null}
      {!isReverifying && props.flow === "add-email-password" ? (
        <EmailPasswordMigrationView controller={props.controller} onCancel={props.onBackToOverview} />
      ) : null}
      {!isReverifying && props.flow === "connect-google" ? (
        <GoogleConnectionView controller={props.controller} />
      ) : null}
    </Dialog>
  );
}

function flowTitle(props: LoginMethodMigrationViewProps) {
  if (props.flow === "add-email-password" && props.controller.state.phase === "settingPassword") {
    return "パスワード設定";
  }
  return props.flow === "add-email-password" ? "メールアドレスとパスワードを設定" : "Googleログインを追加";
}
