import { Button, Field, Input, Separator, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type ReissueFormValues, reissueSchema } from "@/convex/staffAuth/schemas";

type Props = {
  onSubmit: (values: ReissueFormValues) => void;
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
          お店に伝えたメールアドレスを入力してください。新しい閲覧リンクをお送りします。
        </Text>

        <Field.Root invalid={!!errors.email}>
          <Field.Label>メールアドレス</Field.Label>
          <Input type="email" placeholder="example@email.com" {...register("email")} />
          {errors.email && <Field.ErrorText>{errors.email.message}</Field.ErrorText>}
        </Field.Root>

        <Button type="submit" colorPalette="teal" w="full" borderRadius="lg" loading={isSubmitting}>
          リンクを送信する
        </Button>

        <Separator />

        <Text fontSize="xs" color="fg.subtle">
          ※ お心当たりのないメールが届いた場合は無視してください。
        </Text>
      </VStack>
    </form>
  );
};
