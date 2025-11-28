import { Badge, Box, Button, Card, Flex, Heading, Icon, Stack, Text } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuClock, LuCopy, LuInfo, LuLink2, LuTrash2, LuUserPlus } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { convertRole } from "@/src/helpers/domain/convertShopData";
import { userAtom } from "@/src/stores/user";
import { CancelInviteModal } from "./CancelInviteModal";

export type InvitationType = {
  _id: string;
  displayName: string;
  role: string;
  inviteExpiresAt: number | undefined;
  inviteToken: string | undefined;
  createdAt: number;
  isExpired: boolean;
  invitedBy: { _id: string; name: string } | null;
};

type ManageTabProps = {
  invitations: InvitationType[];
};

export const ManageTab = ({ invitations }: ManageTabProps) => {
  const user = useAtomValue(userAtom);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<{
    id: string;
    displayName: string;
    isExpired: boolean;
  } | null>(null);

  const { isOpen, open, close, onOpenChange } = useDialog();

  const cancelInvitation = useMutation(api.invite.mutations.cancel);

  const handleCopyUrl = async (token: string) => {
    const url = `${window.location.origin}/invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toaster.create({
        description: "URLをコピーしました",
        type: "success",
      });
    } catch {
      toaster.create({
        description: "コピーに失敗しました",
        type: "error",
      });
    }
  };

  const handleOpenCancelModal = (id: string, displayName: string, isExpired: boolean) => {
    setSelectedInvite({ id, displayName, isExpired });
    open();
  };

  const handleCancelInvitation = async () => {
    if (!user.authId || !selectedInvite) return;
    setProcessingId(selectedInvite.id);
    try {
      await cancelInvitation({
        belongingId: selectedInvite.id as Id<"shopUserBelongings">,
        authId: user.authId,
      });
      toaster.create({
        description: "招待を取り消しました",
        type: "success",
      });
      close();
    } catch {
      toaster.create({
        description: "招待の取り消しに失敗しました",
        type: "error",
      });
    } finally {
      setProcessingId(null);
    }
  };

  // 残り日数を計算
  const getRemainingDays = (expiresAt: number | null | undefined) => {
    if (!expiresAt) return 0;
    const remaining = dayjs(expiresAt).diff(dayjs(), "day");
    return Math.max(0, remaining);
  };

  // 有効な招待と期限切れの招待を分ける
  const activeInvitations = invitations.filter((inv) => !inv.isExpired);
  const expiredInvitations = invitations.filter((inv) => inv.isExpired);

  return (
    <>
      <Stack gap={6}>
        {/* 説明メッセージ */}
        <Box p={3} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
          <Flex align="flex-start" gap={2}>
            <Icon as={LuInfo} boxSize={4} color="blue.600" mt={0.5} />
            <Text fontSize="sm" color="blue.800">
              招待URLを再送する場合は、現在の招待を取り消して新しく作成してください。
            </Text>
          </Flex>
        </Box>

        {/* 招待中 */}
        <Box>
          <Flex align="center" justify="space-between" mb={3}>
            <Heading as="h3" size="md" color="gray.900">
              招待中
            </Heading>
          </Flex>

          {activeInvitations.length > 0 ? (
            <Stack gap={3}>
              {activeInvitations.map((invite) => (
                <Card.Root key={invite._id} variant="elevated">
                  <Card.Body p={4}>
                    <Flex align="flex-start" justify="space-between" gap={3} mb={3}>
                      <Flex align="flex-start" gap={3} flex={1} minW={0}>
                        <Flex p={2} bg="teal.50" borderRadius="lg">
                          <Icon as={LuUserPlus} boxSize={4} color="teal.600" />
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Flex align="center" gap={2} mb={1} flexWrap="wrap">
                            <Text fontWeight="medium" color="gray.900">
                              {invite.displayName}
                            </Text>
                            <Badge colorPalette={convertRole.toBadgeColor(invite.role)} fontSize="xs">
                              {convertRole.toLabel(invite.role)}
                            </Badge>
                          </Flex>
                          <Flex align="center" gap={1} fontSize="xs" color="gray.600" mb={2}>
                            <Icon as={LuClock} boxSize={3} />
                            <Text>有効期限: あと{getRemainingDays(invite.inviteExpiresAt)}日</Text>
                          </Flex>
                          <Flex align="center" gap={3} fontSize="xs" color="gray.500">
                            <Text>作成: {dayjs(invite.createdAt).format("M/D")}</Text>
                            {invite.invitedBy && <Text>招待者: {invite.invitedBy.name}</Text>}
                          </Flex>
                        </Box>
                      </Flex>
                    </Flex>

                    <Flex gap={2} flexWrap="wrap">
                      <Button
                        size="sm"
                        onClick={() => invite.inviteToken && handleCopyUrl(invite.inviteToken)}
                        flex={1}
                        colorPalette="teal"
                        gap={2}
                        disabled={!invite.inviteToken}
                      >
                        <Icon as={LuCopy} boxSize={4} />
                        招待URLをコピー
                      </Button>
                      <Button
                        size="sm"
                        colorPalette="red"
                        variant="outline"
                        gap={2}
                        onClick={() => handleOpenCancelModal(invite._id, invite.displayName, false)}
                      >
                        <Icon as={LuTrash2} boxSize={4} />
                        取消
                      </Button>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              ))}
            </Stack>
          ) : (
            <Card.Root variant="elevated">
              <Card.Body p={8} textAlign="center">
                <Icon as={LuLink2} boxSize={12} color="gray.300" mx="auto" mb={3} />
                <Text fontSize="sm" color="gray.500">
                  招待中のスタッフはいません
                </Text>
              </Card.Body>
            </Card.Root>
          )}
        </Box>

        {/* 期限切れ */}
        {expiredInvitations.length > 0 && (
          <Box>
            <Flex align="center" justify="space-between" mb={3}>
              <Heading as="h3" size="md" color="gray.900">
                期限切れ
              </Heading>
              <Badge variant="outline" borderColor="gray.300" color="gray.700">
                {expiredInvitations.length}件
              </Badge>
            </Flex>

            <Stack gap={3}>
              {expiredInvitations.map((invite) => (
                <Card.Root key={invite._id} variant="subtle" bg="gray.50">
                  <Card.Body p={4}>
                    <Flex align="flex-start" gap={3}>
                      <Flex p={2} bg="gray.100" borderRadius="lg">
                        <Icon as={LuUserPlus} boxSize={4} color="gray.400" />
                      </Flex>
                      <Box flex={1} minW={0}>
                        <Flex align="center" gap={2} mb={1}>
                          <Text fontWeight="medium" color="gray.600">
                            {invite.displayName}
                          </Text>
                          <Badge variant="outline" borderColor="gray.300" color="gray.600" bg="gray.100" fontSize="xs">
                            期限切れ
                          </Badge>
                        </Flex>
                        <Flex align="center" gap={3} fontSize="xs" color="gray.500">
                          <Text>作成: {dayjs(invite.createdAt).format("M/D")}</Text>
                          {invite.invitedBy && <Text>招待者: {invite.invitedBy.name}</Text>}
                        </Flex>
                        <Text fontSize="xs" color="gray.500" mt={2}>
                          再度招待する場合は「招待を送る」タブから新しく作成してください
                        </Text>
                      </Box>
                      <Button
                        size="sm"
                        colorPalette="red"
                        variant="ghost"
                        gap={2}
                        onClick={() => handleOpenCancelModal(invite._id, invite.displayName, true)}
                      >
                        <Icon as={LuTrash2} boxSize={4} />
                      </Button>
                    </Flex>
                  </Card.Body>
                </Card.Root>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>

      {/* キャンセルモーダル */}
      {selectedInvite && (
        <CancelInviteModal
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onClose={close}
          onSubmit={handleCancelInvitation}
          isLoading={processingId === selectedInvite.id}
          displayName={selectedInvite.displayName}
          isExpired={selectedInvite.isExpired}
        />
      )}
    </>
  );
};
