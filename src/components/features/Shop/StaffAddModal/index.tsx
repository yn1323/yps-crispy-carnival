import { Field, Input, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useForm } from "react-hook-form";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { type StaffAddFormValues, staffAddSchema } from "./schema";

type StaffAddModalProps = {
  shopId: Id<"shops">;
  authId: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSuccess: () => void;
};

export const StaffAddModal = ({ shopId, authId, isOpen, onOpenChange, onClose, onSuccess }: StaffAddModalProps) => {
  const addStaff = useMutation(api.shop.mutations.addStaff);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffAddFormValues>({
    resolver: zodResolver(staffAddSchema),
    defaultValues: {
      email: "",
      displayName: "",
    },
  });

  const onSubmit = async (data: StaffAddFormValues) => {
    try {
      await addStaff({
        shopId,
        authId,
        email: data.email,
        displayName: data.displayName,
      });

      toaster.success({
        title: `${data.displayName} を追加しました`,
      });
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      toaster.error({
        title: "スタッフの追加に失敗しました",
        description: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      title="スタッフを追加"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={handleClose}
      closeLabel="キャンセル"
      onSubmit={handleSubmit(onSubmit)}
      submitLabel="追加"
      isLoading={isSubmitting}
    >
      <VStack align="stretch" gap={4}>
        <Field.Root invalid={!!errors.displayName}>
          <Field.Label>名前</Field.Label>
          <Input {...register("displayName")} placeholder="山田 太郎" />
          <Field.ErrorText>{errors.displayName?.message}</Field.ErrorText>
        </Field.Root>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input type="email" {...register("email")} placeholder="example@email.com" />
          <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
        </Field.Root>
      </VStack>
    </Dialog>
  );
};
