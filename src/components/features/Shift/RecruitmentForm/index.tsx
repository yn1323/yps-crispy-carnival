import { Box, Button, Field, Flex, Grid, GridItem, Input, VStack } from "@chakra-ui/react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { LuCalendar, LuClock } from "react-icons/lu";
import { FormCard } from "@/src/components/ui/FormCard";
import type { RecruitmentFormSchemaType } from "./schema";

type RecruitmentFormProps = {
  register: UseFormRegister<RecruitmentFormSchemaType>;
  errors: FieldErrors<RecruitmentFormSchemaType>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

export const RecruitmentForm = ({ register, errors, isSubmitting, onSubmit }: RecruitmentFormProps) => {
  return (
    <Box as="form" onSubmit={onSubmit}>
      <VStack gap="6">
        {/* 募集期間 */}
        <FormCard icon={LuCalendar} iconColor="teal.600" title="募集期間">
          <VStack gap="4" align="stretch">
            <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="4">
              <GridItem>
                <Field.Root invalid={!!errors.startDate}>
                  <Field.Label>開始日</Field.Label>
                  <Input {...register("startDate")} type="date" />
                  <Field.ErrorText>{errors.startDate?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>
              <GridItem>
                <Field.Root invalid={!!errors.endDate}>
                  <Field.Label>終了日</Field.Label>
                  <Input {...register("endDate")} type="date" />
                  <Field.ErrorText>{errors.endDate?.message}</Field.ErrorText>
                </Field.Root>
              </GridItem>
            </Grid>
          </VStack>
        </FormCard>

        {/* 申請締切 */}
        <FormCard icon={LuClock} iconColor="orange.500" title="申請締切">
          <VStack gap="4" align="stretch">
            <Field.Root invalid={!!errors.deadline}>
              <Field.Label>締切日</Field.Label>
              <Field.HelperText>スタッフがシフト希望を申請できる期限です</Field.HelperText>
              <Input {...register("deadline")} type="date" />
              <Field.ErrorText>{errors.deadline?.message}</Field.ErrorText>
            </Field.Root>
          </VStack>
        </FormCard>

        {/* 送信ボタン */}
        <Flex justifyContent={{ base: "stretch", sm: "flex-end" }} pt="2" w="full">
          <Button
            type="submit"
            disabled={isSubmitting}
            colorPalette="teal"
            loading={isSubmitting}
            size="lg"
            w={{ base: "full", sm: "auto" }}
          >
            募集を開始する
          </Button>
        </Flex>
      </VStack>
    </Box>
  );
};
