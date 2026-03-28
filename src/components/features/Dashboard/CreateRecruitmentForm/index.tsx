import { Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type CreateRecruitmentData, createRecruitmentSchema } from "./index";

type Props = {
  defaultValues?: CreateRecruitmentData;
  onSubmit: (data: CreateRecruitmentData) => void;
};

export const CreateRecruitmentForm = ({ defaultValues, onSubmit }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateRecruitmentData>({
    resolver: zodResolver(createRecruitmentSchema),
    defaultValues: defaultValues ?? { periodStart: "", periodEnd: "", deadline: "" },
  });

  const periodStart = watch("periodStart");
  const periodEnd = watch("periodEnd");

  return (
    <form id="create-recruitment-form" onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.periodStart || !!errors.periodEnd}>
          <Field.Label>シフト期間</Field.Label>
          <Flex gap={2} align="center" w="100%">
            <Input type="date" flex={1} {...register("periodStart")} max={periodEnd || undefined} />
            <Text color="gray.500" flexShrink={0}>
              〜
            </Text>
            <Input type="date" flex={1} {...register("periodEnd")} min={periodStart || undefined} />
          </Flex>
          {errors.periodStart && <Field.ErrorText>{errors.periodStart.message}</Field.ErrorText>}
          {errors.periodEnd && <Field.ErrorText>{errors.periodEnd.message}</Field.ErrorText>}
        </Field.Root>
        <Field.Root invalid={!!errors.deadline}>
          <Field.Label>提出締切日</Field.Label>
          <Input type="date" {...register("deadline")} max={periodStart || undefined} />
          {errors.deadline && <Field.ErrorText>{errors.deadline.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
