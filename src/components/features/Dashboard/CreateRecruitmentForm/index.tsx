import { Field, Flex, Input, Stack, Text } from "@chakra-ui/react";

export const CreateRecruitmentForm = () => {
  return (
    <Stack gap={5}>
      <Field.Root>
        <Field.Label>シフト期間</Field.Label>
        <Flex gap={2} align="center" w="100%">
          <Input type="date" flex={1} />
          <Text color="gray.500" flexShrink={0}>
            〜
          </Text>
          <Input type="date" flex={1} />
        </Flex>
      </Field.Root>
      <Field.Root>
        <Field.Label>提出締切日</Field.Label>
        <Input type="date" />
      </Field.Root>
    </Stack>
  );
};
