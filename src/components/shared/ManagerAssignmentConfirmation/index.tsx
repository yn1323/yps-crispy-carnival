import { Stack, Text } from "@chakra-ui/react";

export type ManagerAssignmentConfirmationProps = {
  personName: string;
  personEmail: string;
  mode: "addition" | "freeManagerExchange";
  replacesStaleInvitation?: boolean;
  isResend?: boolean;
};

export function getManagerAssignmentConfirmationCopy({
  personName,
  personEmail,
  mode,
  isResend = false,
}: ManagerAssignmentConfirmationProps) {
  const isFreeManagerExchange = mode === "freeManagerExchange";
  const title = isFreeManagerExchange
    ? `${personName}さんへ管理者交代の案内を${isResend ? "再送しますか？" : "送りますか？"}`
    : isResend
      ? `${personName}さんへログイン案内を再送しますか？`
      : `${personName}さんを管理者として招待しますか？`;
  const description = isFreeManagerExchange
    ? `${personName}さんがログインして招待を受け入れると、この組織の唯一の管理者になります。\nその時点で、あなたはこの組織の管理者ではなくなり、組織設定や店舗情報へアクセスできなくなります。`
    : isResend
      ? `${personEmail}へ新しいログイン案内を送ります。\n以前のURLは利用できなくなります。`
      : `${personEmail}へログイン案内を送ります。\n本人が案内先のメールアドレスでログインし、招待を受け入れると管理者になります。`;
  const confirmLabel = isFreeManagerExchange
    ? isResend
      ? "交代の案内を再送"
      : "交代の案内を送る"
    : isResend
      ? "ログイン案内を再送"
      : "管理者として招待";

  return { confirmLabel, description, isFreeManagerExchange, title };
}

/** Dialogのtitleとfooterは親shellが担い、ここでは確認本文だけを描画する。 */
export function ManagerAssignmentConfirmation({
  personName,
  personEmail,
  mode,
  replacesStaleInvitation = false,
  isResend = false,
}: ManagerAssignmentConfirmationProps) {
  const { description, isFreeManagerExchange } = getManagerAssignmentConfirmationCopy({
    personName,
    personEmail,
    mode,
    replacesStaleInvitation,
    isResend,
  });

  return (
    <Stack gap={2}>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
        {description}
      </Text>
      {isFreeManagerExchange && isResend && (
        <Text fontSize="sm" color="orange.700" lineHeight="tall">
          {personEmail}へ新しい管理者交代の案内を送ります。
          <br />
          以前のURLは利用できなくなります。
        </Text>
      )}
      {replacesStaleInvitation && !isResend && (
        <Text fontSize="sm" color="orange.700" lineHeight="tall">
          以前の案内を無効にして、現在のメールアドレスへ送り直します。
        </Text>
      )}
      {isFreeManagerExchange && (
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          交代が完了するまでは、あなたが引き続き管理できます。
          <br />
          現在の管理者のスタッフとしての所属、シフト対象の設定、通知設定は変更されません。
        </Text>
      )}
    </Stack>
  );
}
