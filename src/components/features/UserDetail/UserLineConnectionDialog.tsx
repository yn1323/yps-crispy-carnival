import { Alert, Box, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { LuMail, LuQrCode, LuUnlink } from "react-icons/lu";
import { LineLinkQrDialog } from "@/src/components/features/Line";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import type { UserDetailData } from "./types";

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  authorizeUrl: string | null;
  showQr: boolean;
  isQrLoading: boolean;
  isSendingInvite: boolean;
  isDisconnecting: boolean;
  onClose: () => void;
  onShowQr: () => Promise<unknown>;
  onSendInvite: () => Promise<unknown>;
  onDisconnect: (requestId: string) => Promise<boolean | undefined>;
};

export function UserLineConnectionDialog({
  data,
  isOpen,
  authorizeUrl,
  showQr,
  isQrLoading,
  isSendingInvite,
  isDisconnecting,
  onClose,
  onShowQr,
  onSendInvite,
  onDisconnect,
}: Props) {
  const [disconnectRequestId, setDisconnectRequestId] = useState<string | null>(null);
  const cancelDisconnectRef = useRef<HTMLButtonElement>(null);
  const disconnectTriggerRef = useRef<HTMLButtonElement>(null);
  const isConfirmingDisconnect = disconnectRequestId !== null;
  const isBusy = isQrLoading || isSendingInvite || isDisconnecting;

  useEffect(() => {
    if (!isOpen || data.line.status === "unlinked") setDisconnectRequestId(null);
  }, [data.line.status, isOpen]);

  useEffect(() => {
    if (isOpen && isConfirmingDisconnect && !isDisconnecting) cancelDisconnectRef.current?.focus();
  }, [isConfirmingDisconnect, isDisconnecting, isOpen]);

  const returnFromDisconnectConfirmation = () => {
    setDisconnectRequestId(null);
    const focusTrigger = () => disconnectTriggerRef.current?.focus();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focusTrigger);
    else focusTrigger();
  };

  const handleCloseRequest = () => {
    if (isBusy) return;
    if (isConfirmingDisconnect) {
      returnFromDisconnectConfirmation();
      return;
    }
    onClose();
  };

  const handleDisconnect = async () => {
    if (!disconnectRequestId) return;
    if ((await onDisconnect(disconnectRequestId)) === true) returnFromDisconnectConfirmation();
  };

  const footer = isConfirmingDisconnect ? (
    <DialogActionArea
      layout="standard"
      mobileLayout="stacked"
      startAction={
        <Button
          ref={cancelDisconnectRef}
          variant="outline"
          disabled={isDisconnecting}
          onClick={returnFromDisconnectConfirmation}
        >
          戻る
        </Button>
      }
      endAction={
        <Button
          colorPalette="red"
          loading={isDisconnecting}
          loadingText="LINE連携を解除する"
          disabled={!data.line.canDisconnect}
          onClick={handleDisconnect}
        >
          LINE連携を解除する
        </Button>
      }
    />
  ) : (
    <DialogActionArea
      layout="standard"
      mobileLayout="inline"
      endAction={
        <Button variant="outline" disabled={isBusy} onClick={handleCloseRequest}>
          閉じる
        </Button>
      }
    />
  );

  return (
    <Dialog
      title={isConfirmingDisconnect ? "LINE連携を解除" : "LINE連携"}
      isOpen={isOpen}
      role={isConfirmingDisconnect ? "alertdialog" : "dialog"}
      onOpenChange={({ open }) => {
        if (!open) handleCloseRequest();
      }}
      onClose={handleCloseRequest}
      preventClose={isBusy}
      footer={footer}
      mobileFullScreen
      maxW={{ base: "100vw", lg: "640px" }}
    >
      {isConfirmingDisconnect ? (
        <DisconnectConfirmation personName={data.person.name} disabledReason={data.line.disconnectDisabledReason} />
      ) : (
        <Stack gap={6}>
          <LineStatus status={data.line.status} />

          {data.line.canLink ? (
            <Stack gap={6}>
              <LineConnectionMethod
                number="1"
                title={data.line.status === "unlinked" ? "LINE連携リンクを表示" : "LINE再連携リンクを表示"}
              >
                <Button
                  alignSelf="flex-end"
                  colorPalette="teal"
                  gap={1.5}
                  onClick={onShowQr}
                  disabled={showQr || isSendingInvite || isDisconnecting}
                  loading={isQrLoading}
                >
                  <LuQrCode aria-hidden />
                  {data.line.status === "unlinked" ? "LINE連携リンクを表示" : "LINE再連携リンクを表示"}
                </Button>
                {showQr && (
                  <Stack gap={3} w="full">
                    <Stack gap={1} fontSize="sm" color="fg.muted" lineHeight="tall">
                      <Text>{data.person.name}さん専用のURL（QRコード）です。</Text>
                      <Text>本人へ直接共有してください。ほかのスタッフには共有しないでください。</Text>
                      <Text>この組織で現在および今後所属する店舗に共通で使われます。</Text>
                    </Stack>
                    <LineLinkQrDialog authorizeUrl={authorizeUrl} isLoading={isQrLoading} />
                  </Stack>
                )}
              </LineConnectionMethod>

              <LineConnectionMethod
                number="2"
                title={data.line.status === "unlinked" ? "LINE連携リンクをメールで送る" : "再連携リンクをメールで送る"}
              >
                <Button
                  alignSelf="flex-end"
                  colorPalette="teal"
                  gap={1.5}
                  disabled={data.person.email.length === 0 || isSendingInvite || isQrLoading || isDisconnecting}
                  loading={isSendingInvite}
                  onClick={onSendInvite}
                >
                  <LuMail aria-hidden />
                  メールで{data.line.status === "unlinked" ? "LINE連携" : "再連携"}リンクを送る
                </Button>
                {data.person.email.length === 0 && (
                  <Text fontSize="xs" color="fg.muted" lineHeight="tall">
                    メールアドレスが未登録のため、メールでは送れません。リンクを本人へ直接共有してください。
                  </Text>
                )}
              </LineConnectionMethod>
            </Stack>
          ) : (
            <Box borderWidth="1px" borderColor="blackAlpha.100" bg="blackAlpha.50" borderRadius="md" p={3}>
              <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                {data.line.linkDisabledReason ?? "現在、LINE連携を変更できません。"}
              </Text>
            </Box>
          )}

          {data.line.status !== "unlinked" && (
            <Stack gap={3} borderTopWidth="1px" borderColor="blackAlpha.100" pt={5}>
              <Stack gap={1}>
                <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
                  連携を解除
                </Heading>
                <Text fontSize="xs" color="fg.muted" lineHeight="tall">
                  解除後はメールで通知が届くようになります。
                </Text>
              </Stack>
              <Button
                ref={disconnectTriggerRef}
                alignSelf="flex-end"
                variant="outline"
                colorPalette="red"
                gap={1.5}
                disabled={!data.line.canDisconnect || isBusy}
                aria-describedby={data.line.disconnectDisabledReason ? "line-disconnect-disabled-reason" : undefined}
                onClick={() => setDisconnectRequestId(crypto.randomUUID())}
              >
                <LuUnlink aria-hidden />
                LINE連携を解除
              </Button>
              {data.line.disconnectDisabledReason && (
                <Text id="line-disconnect-disabled-reason" fontSize="xs" color="orange.700" textAlign="right">
                  {data.line.disconnectDisabledReason}
                </Text>
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Dialog>
  );
}

function LineStatus({ status }: { status: UserDetailData["line"]["status"] }) {
  const presentation = getLineStatusPresentation(status);
  return (
    <Alert.Root status={presentation.alertStatus} borderRadius="md" alignItems="center" p={3}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{presentation.label}</Alert.Title>
      </Alert.Content>
    </Alert.Root>
  );
}

function DisconnectConfirmation({ personName, disabledReason }: { personName: string; disabledReason?: string }) {
  return (
    <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
      <Text fontWeight="semibold" color="gray.900">
        {personName}さんのLINE連携を解除しますか？
      </Text>
      <Text>この組織のすべての所属店舗でLINE通知が停止します。</Text>
      <Text>ほかの組織のLINE連携には影響しません。</Text>
      <Text color="red.700" fontWeight="semibold">
        再び利用するには、本人による新しい連携が必要です。
      </Text>
      {disabledReason && <Text color="orange.700">{disabledReason}</Text>}
    </Stack>
  );
}

function LineConnectionMethod({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <Stack gap={3}>
      <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
        {number}. {title}
      </Heading>
      <Stack gap={3} align="flex-start">
        {children}
      </Stack>
    </Stack>
  );
}

export function getLineStatusPresentation(status: UserDetailData["line"]["status"]) {
  if (status === "linked_following") {
    return {
      label: "LINE連携済み",
      description: "この組織の所属店舗からのシフト通知をLINEで受け取ります。",
      alertStatus: "success" as const,
      badgeColorPalette: "green" as const,
    };
  }
  if (status === "linked_unfollowed") {
    return {
      label: "LINEで受け取れません",
      description:
        "LINE連携は残っていますが、現在はLINEへ通知を送れません。再連携すると、この組織の所属店舗に反映されます。",
      alertStatus: "warning" as const,
      badgeColorPalette: "orange" as const,
    };
  }
  return {
    label: "LINE未連携",
    description: "一度連携すると、この組織で現在および今後所属する店舗のシフト通知をLINEで受け取れます。",
    alertStatus: "info" as const,
    badgeColorPalette: "gray" as const,
  };
}
