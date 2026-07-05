import { Badge, Box, Flex, Heading, HStack, Stack, Switch, Tabs, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { LuBell, LuCalendarCheck, LuMail, LuMessageCircle, LuQrCode, LuSend, LuTrash2 } from "react-icons/lu";
import { LineInviteConfirmContent } from "@/src/components/features/Line/LineInviteConfirmContent";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { EditStaffFormData } from "../EditStaffForm";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { RecruitmentSummaryRow } from "../RecruitmentBoard/RecruitmentSummaryRow";
import type { Recruitment, Staff } from "../types";

type PendingAction = "sendRecruitments" | "sendCurrentShift" | "sendLineInvite" | "delete" | null;

type Props = {
  staff: Staff | null;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  onEdit: (data: EditStaffFormData) => void | Promise<void>;
  isEditing: boolean;
  onDelete: (staff: Staff) => void | Promise<void>;
  isDeleting: boolean;
  onShowLineQr: (staff: Staff) => void | Promise<void>;
  lineQrState: {
    staffId: Staff["_id"] | null;
    authorizeUrl: string | null;
    isLoading: boolean;
  };
  onSendLineInvite: (staff: Staff) => void | Promise<void>;
  isSendingLineInvite: boolean;
  onSendRecruitments: (staff: Staff) => void | Promise<void>;
  isSendingRecruitments: boolean;
  onSendCurrentShift: (staff: Staff) => void | Promise<void>;
  isSendingCurrentShift: boolean;
  onChangeShiftTarget: (staff: Staff, isShiftTarget: boolean) => void | Promise<void>;
  isChangingShiftTarget: boolean;
};

export const StaffDetailDialog = ({
  staff,
  isOpen,
  onOpenChange,
  onClose,
  openRecruitments,
  currentRecruitments,
  onEdit,
  isEditing,
  onDelete,
  isDeleting,
  onShowLineQr,
  lineQrState,
  onSendLineInvite,
  isSendingLineInvite,
  onSendRecruitments,
  isSendingRecruitments,
  onSendCurrentShift,
  isSendingCurrentShift,
  onChangeShiftTarget,
  isChangingShiftTarget,
}: Props) => {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  if (!staff) return null;

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open) setPendingAction(null);
    onOpenChange(details);
  };

  const handleClose = () => {
    setPendingAction(null);
    onClose();
  };

  const isLineActive = staff.isLineLinked && staff.isLineFollowing;
  const isShiftTarget = !staff.excludedFromShift;
  const hasEmail = staff.email.length > 0;
  const canShowLineQr = !isLineActive;
  const canSendLineInvite = hasEmail && !isLineActive;
  const canSendNotification = (hasEmail || isLineActive) && isShiftTarget;
  const canSendRecruitments = canSendNotification && openRecruitments.length > 0;
  const canSendCurrentShift = canSendNotification && currentRecruitments.length > 0;
  const showLineQr = lineQrState.staffId === staff._id;

  const handleConfirm = async (action: Exclude<PendingAction, null>) => {
    if (action === "sendRecruitments") await onSendRecruitments(staff);
    if (action === "sendCurrentShift") await onSendCurrentShift(staff);
    if (action === "sendLineInvite") await onSendLineInvite(staff);
    if (action === "delete") await onDelete(staff);
    setPendingAction(null);
  };

  return (
    <Dialog
      title="スタッフ詳細"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      hideFooter
      maxW={{ base: "100vw", lg: "960px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "86dvh" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{
        px: { base: 4, lg: 6 },
        pt: 0,
        pb: { base: 6, lg: 6 },
      }}
    >
      <Stack gap={5}>
        <StaffSummary staff={staff} />

        <Tabs.Root defaultValue="basic" colorPalette="teal" variant="line">
          <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
            <Tabs.Trigger value="basic" flexShrink={0}>
              基本
            </Tabs.Trigger>
            <Tabs.Trigger value="notification" flexShrink={0}>
              通知
            </Tabs.Trigger>
            <Tabs.Trigger value="line" flexShrink={0}>
              LINE連携
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" flexShrink={0}>
              設定
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="basic" pt={4}>
            <Stack gap={5}>
              <EditStaffForm key={staff._id} staff={staff} onSubmit={onEdit} />
              <Flex justify="flex-end">
                <Button type="submit" form="edit-staff-form" colorPalette="teal" loading={isEditing}>
                  変更を保存
                </Button>
              </Flex>
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="notification" pt={4}>
            <Stack gap={5}>
              {!isShiftTarget && (
                <InfoPanel tone="muted">
                  <Text fontWeight="semibold">このスタッフはシフト対象外です</Text>
                  <Text fontSize="sm" color="fg.muted">
                    シフト表、提出依頼、確定シフト通知の対象から外れています。
                  </Text>
                </InfoPanel>
              )}
              <Text fontSize="sm" color="fg.muted">
                通常は自動で送っています。届いていない場合だけ、ここからもう一度送れます。
              </Text>
              <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
                対象とするシフト
              </Heading>
              <NotificationSection
                title="募集中"
                icon={<LuSend />}
                recruitments={openRecruitments}
                emptyText="送信できる募集中シフトはありません。"
                actionLabel="募集中のシフトを送る"
                isDisabled={!canSendRecruitments}
                onAction={() => setPendingAction("sendRecruitments")}
              />
              {pendingAction === "sendRecruitments" && (
                <ConfirmPanel
                  title="募集中のシフトを送る"
                  description={`${staff.name}さんに、現在送れる募集中シフトを送ります。`}
                  confirmLabel="送る"
                  isLoading={isSendingRecruitments}
                  onCancel={() => setPendingAction(null)}
                  onConfirm={() => handleConfirm("sendRecruitments")}
                />
              )}
              <NotificationSection
                title="確定シフト"
                icon={<LuCalendarCheck />}
                recruitments={currentRecruitments}
                emptyText="送信できる現在の確定シフトはありません。"
                actionLabel="確定シフトを送る"
                isDisabled={!canSendCurrentShift}
                onAction={() => setPendingAction("sendCurrentShift")}
              />
              {pendingAction === "sendCurrentShift" && (
                <ConfirmPanel
                  title="現在の確定シフトを送る"
                  description={`${staff.name}さんに、現在の期間に含まれる確定済みシフトを送ります。`}
                  confirmLabel="送る"
                  isLoading={isSendingCurrentShift}
                  onCancel={() => setPendingAction(null)}
                  onConfirm={() => handleConfirm("sendCurrentShift")}
                />
              )}
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="line" pt={4}>
            <Stack gap={5}>
              <LineStatusPanel staff={staff} />
              {!isLineActive && (
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  スタッフ本人に連携リンクを開いてもらうと、次回からシフト通知がLINEに届きます。
                </Text>
              )}
              {canShowLineQr && (
                <Stack gap={3}>
                  <Button variant="outline" colorPalette="teal" gap={1.5} onClick={() => onShowLineQr(staff)}>
                    <LuQrCode />
                    LINE連携リンクを表示
                  </Button>
                  {showLineQr && (
                    <LineLinkQrDialog
                      authorizeUrl={lineQrState.authorizeUrl}
                      isLoading={lineQrState.isLoading}
                      staffName={staff.name}
                    />
                  )}
                </Stack>
              )}
              <Stack gap={3}>
                <Button
                  variant="outline"
                  colorPalette="teal"
                  gap={1.5}
                  disabled={!canSendLineInvite}
                  onClick={() => setPendingAction("sendLineInvite")}
                >
                  <LuMail />
                  メールでLINE連携リンクを送る
                </Button>
                {!hasEmail && (
                  <Text fontSize="xs" color="fg.muted">
                    メールアドレスがないため、メールでは送れません。QRコードかリンクを直接共有してください。
                  </Text>
                )}
                {pendingAction === "sendLineInvite" && (
                  <ConfirmPanel
                    title="LINE連携リンクをメールで送る"
                    description={<LineInviteConfirmContent staffName={staff.name} staffEmail={staff.email} />}
                    confirmLabel="送信"
                    isLoading={isSendingLineInvite}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={() => handleConfirm("sendLineInvite")}
                  />
                )}
              </Stack>
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="settings" pt={4}>
            <Stack gap={6}>
              <Stack gap={3}>
                <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
                  シフト対象
                </Heading>
                <Switch.Root
                  checked={isShiftTarget}
                  disabled={isChangingShiftTarget}
                  colorPalette="teal"
                  onCheckedChange={(details) => onChangeShiftTarget(staff, details.checked)}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Label>{isShiftTarget ? "シフト対象にする" : "シフト対象外にする"}</Switch.Label>
                </Switch.Root>
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  ONのスタッフは、シフト表、提出依頼、確定シフト通知の対象になります。OFFにすると、今後のシフト作成やシフト関連通知から外れます。
                  LINE連携など、シフト以外の案内には使えます。
                </Text>
              </Stack>

              <Stack gap={3}>
                <Heading as="h3" fontSize="sm" fontWeight="semibold" color="red.700">
                  危険な操作
                </Heading>
                <Button
                  variant="outline"
                  colorPalette="red"
                  gap={1.5}
                  disabled={staff.isManager}
                  onClick={() => setPendingAction("delete")}
                >
                  <LuTrash2 />
                  このスタッフを削除
                </Button>
                {staff.isManager && (
                  <Text fontSize="xs" color="fg.muted">
                    管理者本人のスタッフ情報は削除できません。
                  </Text>
                )}
                {pendingAction === "delete" && (
                  <ConfirmPanel
                    title="このスタッフを削除しますか？"
                    description="削除すると元に戻せません。既存のシフト用リンクやLINE連携も使えなくなります。"
                    confirmLabel="このスタッフを削除"
                    colorPalette="red"
                    isLoading={isDeleting}
                    onCancel={() => setPendingAction(null)}
                    onConfirm={() => handleConfirm("delete")}
                  />
                )}
              </Stack>
            </Stack>
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Dialog>
  );
};

const StaffSummary = ({ staff }: { staff: Staff }) => {
  const initial = staff.name.trim().charAt(0) || "?";
  const lineStatus = getLineStatus(staff);

  return (
    <HStack gap={3} align="center">
      <Flex
        boxSize="48px"
        borderRadius="full"
        bg={staff.isManager ? "teal.500" : "teal.50"}
        color={staff.isManager ? "white" : "teal.700"}
        align="center"
        justify="center"
        fontWeight="semibold"
        flexShrink={0}
      >
        {initial}
      </Flex>
      <Stack gap={1} minW={0}>
        <HStack gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold" color="gray.900" truncate>
            {staff.name}
          </Text>
          {staff.isManager && (
            <Badge colorPalette="teal" variant="subtle" borderRadius="full" px={2}>
              管理者
            </Badge>
          )}
          <Badge colorPalette={lineStatus.colorPalette} variant="subtle" borderRadius="full" px={2}>
            {lineStatus.label}
          </Badge>
          <Badge colorPalette={staff.excludedFromShift ? "gray" : "green"} variant="subtle" borderRadius="full" px={2}>
            {staff.excludedFromShift ? "シフト対象外" : "シフト対象"}
          </Badge>
        </HStack>
        {staff.email && (
          <Text fontSize="sm" color="fg.muted" truncate>
            {staff.email}
          </Text>
        )}
      </Stack>
    </HStack>
  );
};

const NotificationSection = ({
  title,
  icon,
  recruitments,
  emptyText,
  actionLabel,
  isDisabled,
  onAction,
}: {
  title: string;
  icon: ReactNode;
  recruitments: Recruitment[];
  emptyText: string;
  actionLabel: string;
  isDisabled: boolean;
  onAction: () => void;
}) => (
  <Stack gap={3}>
    <HStack gap={2} color="gray.900">
      {icon}
      <Heading as="h3" fontSize="sm" fontWeight="semibold">
        {title}
      </Heading>
    </HStack>
    {recruitments.length > 0 ? (
      <Stack gap={2}>
        {recruitments.map((recruitment) => (
          <RecruitmentSummaryRow key={recruitment._id} recruitment={recruitment} />
        ))}
      </Stack>
    ) : (
      <Text fontSize="sm" color="fg.muted">
        {emptyText}
      </Text>
    )}
    <Button alignSelf="flex-start" colorPalette="teal" gap={1.5} disabled={isDisabled} onClick={onAction}>
      <LuBell />
      {actionLabel}
    </Button>
  </Stack>
);

const LineStatusPanel = ({ staff }: { staff: Staff }) => {
  const lineStatus = getLineStatus(staff);

  return (
    <InfoPanel tone={lineStatus.tone}>
      <HStack gap={2}>
        <LuMessageCircle />
        <Text fontWeight="semibold">{lineStatus.label}</Text>
      </HStack>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        {lineStatus.description}
      </Text>
    </InfoPanel>
  );
};

const ConfirmPanel = ({
  title,
  description,
  confirmLabel,
  colorPalette = "teal",
  isLoading,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  colorPalette?: "teal" | "red";
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) => (
  <Box borderWidth="1px" borderColor={colorPalette === "red" ? "red.200" : "teal.200"} borderRadius="md" p={3}>
    <Stack gap={3}>
      <Stack gap={1}>
        <Text fontWeight="semibold" color={colorPalette === "red" ? "red.700" : "gray.900"}>
          {title}
        </Text>
        {typeof description === "string" ? (
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        ) : (
          description
        )}
      </Stack>
      <HStack justify="flex-end" gap={2}>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          やめる
        </Button>
        <Button colorPalette={colorPalette} loading={isLoading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </HStack>
    </Stack>
  </Box>
);

const InfoPanel = ({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "muted" }) => (
  <Box
    borderWidth="1px"
    borderColor={tone === "brand" ? "teal.100" : "blackAlpha.100"}
    bg={tone === "brand" ? "teal.50/60" : "blackAlpha.50"}
    borderRadius="md"
    p={3}
  >
    <Stack gap={1}>{children}</Stack>
  </Box>
);

function getLineStatus(staff: Staff): {
  label: string;
  description: string;
  colorPalette: "green" | "orange" | "gray";
  tone: "brand" | "muted";
} {
  if (staff.isLineLinked && staff.isLineFollowing) {
    return {
      label: "LINE連携済み",
      description: "このスタッフには、次回からシフト通知がLINEに届きます。",
      colorPalette: "green",
      tone: "brand",
    };
  }
  if (staff.isLineLinked && !staff.isLineFollowing) {
    return {
      label: "LINEで受け取れません",
      description: "LINE連携はありますが、スタッフが友だち追加を解除している可能性があります。",
      colorPalette: "orange",
      tone: "muted",
    };
  }
  return {
    label: "LINE未連携",
    description: "LINE連携リンクを案内すると、スタッフ本人がLINEでシフト通知を受け取れるようになります。",
    colorPalette: "gray",
    tone: "muted",
  };
}
