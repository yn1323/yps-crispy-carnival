import { Badge, Box, Flex, Heading, HStack, Stack, Switch, Tabs, Text, VisuallyHidden } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { LuBell, LuCalendarCheck, LuMail, LuMessageCircle, LuQrCode, LuSend, LuTrash2 } from "react-icons/lu";
import { LineLinkQrDialog } from "@/src/components/features/Line/LineLinkQrDialog";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { EditStaffFormData } from "../EditStaffForm";
import { EditStaffForm } from "../EditStaffForm/index.tsx";
import { RecruitmentSummaryRow } from "../RecruitmentBoard/RecruitmentSummaryRow";
import type { Recruitment, Staff } from "../types";

type PendingAction = "delete" | null;
type DirectAction = "sendRecruitments" | "sendCurrentShift" | "sendLineInvite";

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
  const directActionRef = useRef<DirectAction | null>(null);
  const [directAction, setDirectAction] = useState<DirectAction | null>(null);

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
    if (action === "delete") await onDelete(staff);
    setPendingAction(null);
  };

  const runDirectAction = async (action: DirectAction, handler: () => void | Promise<void>) => {
    if (directActionRef.current !== null) return;

    directActionRef.current = action;
    setDirectAction(action);
    try {
      await handler();
    } finally {
      directActionRef.current = null;
      setDirectAction(null);
    }
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
              情報
            </Tabs.Trigger>
            <Tabs.Trigger value="notification" flexShrink={0}>
              通知
            </Tabs.Trigger>
            <Tabs.Trigger value="line" flexShrink={0}>
              LINE
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
            <Stack gap={8}>
              {!isShiftTarget && (
                <InfoPanel tone="muted">
                  <Text fontWeight="semibold">このスタッフはシフト対象外です</Text>
                  <Text fontSize="sm" color="fg.muted">
                    シフト表、提出依頼、確定シフト通知の対象から外れています。
                  </Text>
                </InfoPanel>
              )}
              <Text fontSize="sm" color="fg.muted">
                シフト関連の重要な通知を再送します。
                <br />
                通常はスタッフ登録時、シフト作成・確定時に自動で送信しています。
              </Text>
              <NotificationSection
                title="現在の募集中シフト"
                icon={<LuSend />}
                recruitments={openRecruitments}
                emptyText="送信できる募集中シフトはありません。"
                actionLabel="募集中のシフトを送る"
                isDisabled={!canSendRecruitments || directAction !== null}
                isLoading={isSendingRecruitments || directAction === "sendRecruitments"}
                onAction={() => runDirectAction("sendRecruitments", () => onSendRecruitments(staff))}
              />
              <NotificationSection
                title="確定シフト"
                icon={<LuCalendarCheck />}
                recruitments={currentRecruitments}
                emptyText="送信できる現在の確定シフトはありません。"
                actionLabel="確定シフトを送る"
                isDisabled={!canSendCurrentShift || directAction !== null}
                isLoading={isSendingCurrentShift || directAction === "sendCurrentShift"}
                onAction={() => runDirectAction("sendCurrentShift", () => onSendCurrentShift(staff))}
              />
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="line" pt={4}>
            <Stack gap={5}>
              <LineStatusPanel staff={staff} />
              {!isLineActive && (
                <Stack gap={5}>
                  <Stack gap={3}>
                    <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                      次のいずれかの方法でLINE連携できます。
                    </Text>
                    <Text fontSize="xs" color="fg.muted" lineHeight="tall">
                      ※シフトリ登録時、自動でLINE連携リンクをメールでお送りしています。
                    </Text>
                  </Stack>

                  {canShowLineQr && (
                    <LineConnectionMethod
                      number="1"
                      title="LINE連携リンクを表示"
                      description="表示されたリンクを直接スタッフに共有してください。"
                    >
                      <Button colorPalette="teal" gap={1.5} onClick={() => onShowLineQr(staff)}>
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
                    </LineConnectionMethod>
                  )}

                  <LineConnectionMethod
                    number="2"
                    title="LINE連携リンクをメールで送る"
                    description="スタッフのメールアドレスにLINE連携リンクをお送りします。"
                  >
                    <Button
                      colorPalette="teal"
                      gap={1.5}
                      disabled={!canSendLineInvite || isSendingLineInvite || directAction !== null}
                      loading={isSendingLineInvite || directAction === "sendLineInvite"}
                      onClick={() => runDirectAction("sendLineInvite", () => onSendLineInvite(staff))}
                    >
                      <LuMail />
                      メールでLINE連携リンクを送る
                    </Button>
                    {!hasEmail && (
                      <Text fontSize="xs" color="fg.muted">
                        メールアドレスがないため、メールでは送れません。リンクを直接共有してください。
                      </Text>
                    )}
                  </LineConnectionMethod>
                </Stack>
              )}
              {isLineActive && (
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  このスタッフはLINE連携済みです。必要な場合は、通知タブからシフト関連の通知を再送できます。
                </Text>
              )}
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="settings" pt={4}>
            <Stack gap={6}>
              <Stack gap={2}>
                <Flex align="center" justify="space-between" gap={4}>
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
                    <Switch.Label>
                      <VisuallyHidden>シフト対象</VisuallyHidden>
                    </Switch.Label>
                  </Switch.Root>
                </Flex>
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  OFFにするとシフト表から非表示になり、シフト募集、確定通知も来なくなります。
                </Text>
              </Stack>

              <Stack gap={3}>
                <Flex justify="flex-end">
                  <Button
                    colorPalette="red"
                    gap={1.5}
                    disabled={staff.isManager}
                    onClick={() => setPendingAction("delete")}
                  >
                    <LuTrash2 />
                    スタッフを削除
                  </Button>
                </Flex>
                {staff.isManager && (
                  <Text fontSize="xs" color="fg.muted" textAlign="right">
                    管理者は削除できません
                  </Text>
                )}
                {pendingAction === "delete" && (
                  <ConfirmPanel
                    title="スタッフを削除しますか？"
                    description="削除すると元に戻せません。既存のシフト用リンクやLINE連携も使えなくなります。"
                    confirmLabel="スタッフを削除"
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
  isLoading = false,
  onAction,
}: {
  title: string;
  icon: ReactNode;
  recruitments: Recruitment[];
  emptyText: string;
  actionLabel: string;
  isDisabled: boolean;
  isLoading?: boolean;
  onAction: () => void | Promise<void>;
}) => (
  <Stack gap={3}>
    <Flex align="center" gap={3} justify="space-between">
      <HStack gap={2} color="gray.900" minW={0}>
        {icon}
        <Heading as="h3" fontSize="sm" fontWeight="semibold">
          {title}
        </Heading>
      </HStack>
      <Button
        colorPalette="teal"
        flexShrink={0}
        gap={1.5}
        disabled={isDisabled || isLoading}
        loading={isLoading}
        onClick={onAction}
        size="sm"
      >
        <LuBell />
        {actionLabel}
      </Button>
    </Flex>
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

const LineConnectionMethod = ({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Stack gap={3}>
    <Stack gap={1}>
      <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
        {number}. {title}
      </Heading>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        {description}
      </Text>
    </Stack>
    <Stack gap={3} align="flex-start">
      {children}
    </Stack>
  </Stack>
);

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
      description: "シフトのお知らせはLINEで送ります。",
      colorPalette: "green",
      tone: "brand",
    };
  }
  if (staff.isLineLinked && !staff.isLineFollowing) {
    return {
      label: "LINEで受け取れません",
      description:
        "LINE連携されていますが、友だち追加を解除している可能性があります。シフトのお知らせはメールで送ります。",
      colorPalette: "orange",
      tone: "muted",
    };
  }
  return {
    label: "LINE未連携",
    description: "LINE未連携です。シフトのお知らせはメールで送ります。",
    colorPalette: "gray",
    tone: "muted",
  };
}
