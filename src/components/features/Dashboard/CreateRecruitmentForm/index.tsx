import { Field, Input, Stack } from "@chakra-ui/react";

export const CreateRecruitmentForm = () => {
  return (
    <Stack gap={5}>
      <Field.Root>
        <Field.Label>募集期間（開始）</Field.Label>
        <Input type="date" />
      </Field.Root>
      <Field.Root>
        <Field.Label>募集期間（終了）</Field.Label>
        <Input type="date" />
      </Field.Root>
      <Field.Root>
        <Field.Label>回答締切</Field.Label>
        <Input type="date" />
      </Field.Root>
    </Stack>
  );
};
