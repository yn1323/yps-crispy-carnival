import { Field, Input, Separator, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { EMAIL_MAX_LENGTH } from "@/convex/constants";
import { type ReissueFormValues, reissueSchema } from "@/convex/staffAuth/schemas";
import { Button } from "@/src/components/ui/Button";

type Props = {
  onSubmit: (values: ReissueFormValues) => void | Promise<void>;
  isSubmitting: boolean;
};

export const ReissueForm = ({ onSubmit, isSubmitting }: Props) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReissueFormValues>({
    resolver: zodResolver(reissueSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <VStack gap={5} align="stretch">
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          スタッフとして登録したメールアドレスを入力してください。
          <br />
          シフト閲覧リンクを再発行します。
        </Text>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input type="email" placeholder="staff@example.com" maxLength={EMAIL_MAX_LENGTH} {...register("email")} />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>

        <Button type="submit" colorPalette="teal" w="full" borderRadius="lg" loading={isSubmitting}>
          再発行を申し込む
        </Button>

        <Separator />

        <Text fontSize="xs" color="fg.subtle">
          ※ お心当たりのないメールが届いた場合は無視してください。
        </Text>
      </VStack>
    </form>
  );
};
