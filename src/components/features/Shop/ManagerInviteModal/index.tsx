import { Box, Field, HStack, IconButton, Input, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LuCheck, LuCopy } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { type ManagerInviteFormValues, managerInviteSchema } from "./schema";

type ManagerInviteModalProps = {
  shopId: Id<"shops">;
  authId: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSuccess: () => void;
};

export const ManagerInviteModal = ({
  shopId,
  authId,
  isOpen,
  onOpenChange,
  onClose,
  onSuccess,
}: ManagerInviteModalProps) => {
  const createInvite = useMutation(api.invite.mutations.create);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ManagerInviteFormValues>({
    resolver: zodResolver(managerInviteSchema),
    defaultValues: {
      displayName: "",
    },
  });

  const onSubmit = async (data: ManagerInviteFormValues) => {
    try {
      const result = await createInvite({
        shopId,
        authId,
        displayName: data.displayName,
        role: "manager",
      });

      if (result.success) {
        const url = `${window.location.origin}/invite?token=${result.data.token}`;
        setInviteUrl(url);
        toaster.success({
          title: "招待リンクを作成しました",
        });
        onSuccess();
      }
    } catch (error) {
      toaster.error({
        title: "招待の作成に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toaster.success({
        title: "コピーしました",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toaster.error({
        title: "コピーに失敗しました",
      });
    }
  };

  const handleClose = () => {
    reset();
    setInviteUrl(null);
    setCopied(false);
    onClose();
  };

  // 招待URL表示モード
  if (inviteUrl) {
    return (
      <Dialog title="招待リンク" isOpen={isOpen} onOpenChange={onOpenChange} onClose={handleClose} closeLabel="閉じる">
        <VStack align="stretch" gap={4}>
          <Text>以下のリンクを招待したい相手に共有してください。</Text>
          <Text fontSize="sm" color="gray.600">
            ※ 有効期限は14日間です
          </Text>
          <HStack>
            <Box flex={1} p={3} bg="gray.100" borderRadius="md" fontSize="sm" wordBreak="break-all" fontFamily="mono">
              {inviteUrl}
            </Box>
            <IconButton
              aria-label="コピー"
              onClick={handleCopy}
              colorPalette={copied ? "green" : "gray"}
              variant="outline"
            >
              {copied ? <LuCheck /> : <LuCopy />}
            </IconButton>
          </HStack>
        </VStack>
      </Dialog>
    );
  }

  // 招待フォームモード
  return (
    <Dialog
      title="マネージャーを招待"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={handleClose}
      closeLabel="キャンセル"
      onSubmit={handleSubmit(onSubmit)}
      submitLabel="招待リンクを作成"
      isLoading={isSubmitting}
    >
      <VStack align="stretch" gap={4}>
        <Field.Root invalid={!!errors.displayName}>
          <Field.Label>名前</Field.Label>
          <Input {...register("displayName")} placeholder="山田 太郎" />
          <Field.ErrorText>{errors.displayName?.message}</Field.ErrorText>
        </Field.Root>
      </VStack>
    </Dialog>
  );
};
