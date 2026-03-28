import { Box, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type CreateRecruitmentData, createRecruitmentSchema } from "./index";

type Props = {
  defaultValues?: CreateRecruitmentData;
  onSubmit: (data: CreateRecruitmentData) => void;
};

const DatePlaceholder = ({ children, visible }: { children: string; visible: boolean }) =>
  visible ? (
    <Text position="absolute" top="50%" left="12px" transform="translateY(-50%)" color="gray.400" pointerEvents="none">
      {children}
    </Text>
  ) : null;

export const CreateRecruitmentForm = ({ defaultValues, onSubmit }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateRecruitmentData>({
    resolver: zodResolver(createRecruitmentSchema),
    defaultValues: defaultValues ?? {
      periodStart: "",
      periodEnd: "",
      deadline: "",
    },
  });

  const periodStart = watch("periodStart");
  const periodEnd = watch("periodEnd");
  const deadline = watch("deadline");

  const deadlineMax = periodStart
    ? new Date(new Date(periodStart).getTime() - 86400000).toISOString().split("T")[0]
    : undefined;

  return (
    <form id="create-recruitment-form" onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={5}>
        <Field.Root invalid={!!errors.periodStart || !!errors.periodEnd}>
          <Field.Label>シフト期間</Field.Label>
          <Flex gap={2} w="100%">
            <Box flex={1}>
              <Box position="relative">
                <Input
                  type="date"
                  {...register("periodStart")}
                  max={periodEnd || undefined}
                  color={periodStart ? undefined : "transparent"}
                />
                <DatePlaceholder visible={!periodStart}>2026/04/01</DatePlaceholder>
              </Box>
              {errors.periodStart && <Field.ErrorText>{errors.periodStart.message}</Field.ErrorText>}
            </Box>
            <Text color="gray.500" flexShrink={0} h="10" display="flex" alignItems="center">
              〜
            </Text>
            <Box flex={1}>
              <Box position="relative">
                <Input
                  type="date"
                  {...register("periodEnd")}
                  min={periodStart || undefined}
                  color={periodEnd ? undefined : "transparent"}
                />
                <DatePlaceholder visible={!periodEnd}>2026/04/30</DatePlaceholder>
              </Box>
              {errors.periodEnd && <Field.ErrorText>{errors.periodEnd.message}</Field.ErrorText>}
            </Box>
          </Flex>
        </Field.Root>
        <Field.Root invalid={!!errors.deadline}>
          <Field.Label>提出締切日</Field.Label>
          <Box position="relative">
            <Input
              type="date"
              {...register("deadline")}
              max={deadlineMax}
              color={deadline ? undefined : "transparent"}
            />
            <DatePlaceholder visible={!deadline}>2026/03/25</DatePlaceholder>
          </Box>
          {errors.deadline && <Field.ErrorText>{errors.deadline.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
