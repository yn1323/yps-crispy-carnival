import { Field, Input, RadioCard, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Controller, useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { type MemberAddFormValues, type MemberRole, memberAddSchema } from "./schema";

type MemberAddModalProps = {
  shopId: Id<"shops">;
  authId: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSuccess: () => void;
};

const roleOptions: { value: MemberRole; label: string; description: string; subDescription: string }[] = [
  {
    value: "staff",
    label: "スタッフ",
    description: "ログイン不要",
    subDescription: "シフト希望の提出・確認ができます",
  },
  {
    value: "manager",
    label: "マネージャー",
    description: "ログインして店舗運営に参加",
    subDescription: "シフト作成・スタッフ管理ができます",
  },
];

export const MemberAddModal = ({ shopId, authId, isOpen, onOpenChange, onClose, onSuccess }: MemberAddModalProps) => {
  const addStaff = useMutation(api.shop.mutations.addStaff);
  const createInvite = useMutation(api.invite.mutations.create);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MemberAddFormValues>({
    resolver: zodResolver(memberAddSchema),
    defaultValues: {
      role: "staff",
      displayName: "",
      email: "",
    },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: MemberAddFormValues) => {
    try {
      if (data.role === "staff") {
        await addStaff({
          shopId,
          authId,
          email: data.email,
          displayName: data.displayName,
        });

        toaster.success({
          title: `${data.displayName} を追加しました`,
        });
      } else {
        const result = await createInvite({
          shopId,
          authId,
          displayName: data.displayName,
          email: data.email,
          role: "manager",
        });

        if (result.success) {
          toaster.success({
            title: "招待リンクを作成しました",
          });
        }
      }

      onSuccess();
      handleClose();
    } catch (error) {
      toaster.error({
        title: data.role === "staff" ? "スタッフの追加に失敗しました" : "招待の作成に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitLabel = selectedRole === "staff" ? "追加する" : "招待する";

  return (
    <Dialog
      title="メンバーを追加"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={handleClose}
      closeLabel="キャンセル"
      onSubmit={handleSubmit(onSubmit)}
      submitLabel={submitLabel}
      isLoading={isSubmitting}
    >
      <VStack align="stretch" gap={5}>
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <RadioCard.Root
              value={field.value}
              onValueChange={({ value }) => field.onChange(value)}
              colorPalette="teal"
            >
              <VStack align="stretch" gap={3}>
                {roleOptions.map((option) => (
                  <RadioCard.Item key={option.value} value={option.value}>
                    <RadioCard.ItemHiddenInput />
                    <RadioCard.ItemControl>
                      <RadioCard.ItemContent>
                        <RadioCard.ItemText fontWeight="bold">{option.label}</RadioCard.ItemText>
                        <RadioCard.ItemDescription>
                          <Text fontSize="sm">{option.description}</Text>
                          <Text fontSize="xs" color="gray.500">
                            {option.subDescription}
                          </Text>
                        </RadioCard.ItemDescription>
                      </RadioCard.ItemContent>
                      <RadioCard.ItemIndicator />
                    </RadioCard.ItemControl>
                  </RadioCard.Item>
                ))}
              </VStack>
            </RadioCard.Root>
          )}
        />

        <Field.Root invalid={!!errors.displayName}>
          <Field.Label>名前</Field.Label>
          <Input {...register("displayName")} placeholder="山田 太郎" />
          <Field.ErrorText>{errors.displayName?.message}</Field.ErrorText>
        </Field.Root>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input {...register("email")} type="email" placeholder="example@example.com" />
          <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
        </Field.Root>
      </VStack>
    </Dialog>
  );
};
