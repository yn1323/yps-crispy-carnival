import { Box, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useForm } from "react-hook-form";
import { type CreateRecruitmentData, createRecruitmentFormSchema } from "./index";

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

const today = dayjs().format("YYYY-MM-DD");
const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");

export const CreateRecruitmentForm = ({ defaultValues, onSubmit }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateRecruitmentData>({
    resolver: zodResolver(createRecruitmentFormSchema),
    defaultValues: defaultValues ?? {
      periodStart: "",
      periodEnd: "",
      deadline: "",
    },
  });

  const periodStart = watch("periodStart");
  const periodEnd = watch("periodEnd");
  const deadline = watch("deadline");

  const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
      e.currentTarget.showPicker();
    } catch {
      // showPicker が未対応、もしくは既に開いている場合は無視
    }
  };

  const deadlineMax = (() => {
    if (!periodStart) return undefined;
    const date = new Date(periodStart);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  })();

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
                  min={tomorrow}
                  max={periodEnd || undefined}
                  onClick={openPicker}
                  css={periodStart ? undefined : { "&::-webkit-datetime-edit": { opacity: 0 } }}
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
                  onClick={openPicker}
                  css={periodEnd ? undefined : { "&::-webkit-datetime-edit": { opacity: 0 } }}
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
              min={today}
              max={deadlineMax}
              onClick={openPicker}
              css={deadline ? undefined : { "&::-webkit-datetime-edit": { opacity: 0 } }}
            />
            <DatePlaceholder visible={!deadline}>2026/03/25</DatePlaceholder>
          </Box>
          {errors.deadline && <Field.ErrorText>{errors.deadline.message}</Field.ErrorText>}
        </Field.Root>
      </Stack>
    </form>
  );
};
