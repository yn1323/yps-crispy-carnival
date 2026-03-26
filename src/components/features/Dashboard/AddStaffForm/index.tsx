import { Field, Input, Stack } from "@chakra-ui/react";

export const AddStaffForm = () => {
  return (
    <Stack gap={5}>
      <Field.Root>
        <Field.Label>名前</Field.Label>
        <Input placeholder="例：山田太郎" />
      </Field.Root>
      <Field.Root>
        <Field.Label>メールアドレス</Field.Label>
        <Input type="email" placeholder="例：yamada@example.com" />
      </Field.Root>
    </Stack>
  );
};
