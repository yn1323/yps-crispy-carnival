import { Box, Button, Field, Flex, IconButton, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { LuPlus, LuX } from "react-icons/lu";
import { type AddStaffFormData, addStaffSchema } from "./index";

const EMPTY_ENTRY = { name: "", email: "" };

type Props = {
  onSubmit: (data: AddStaffFormData) => void;
  onEntriesChange?: (hasValidEntry: boolean) => void;
};

export const AddStaffForm = ({ onSubmit, onEntriesChange }: Props) => {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AddStaffFormData>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { entries: [EMPTY_ENTRY, EMPTY_ENTRY, EMPTY_ENTRY] },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({ control, name: "entries" });

  const entries = watch("entries");
  useEffect(() => {
    const hasValid = entries.some((e) => e.name.trim() !== "" || e.email.trim() !== "");
    onEntriesChange?.(hasValid);
  }, [entries, onEntriesChange]);

  return (
    <form id="add-staff-form" onSubmit={handleSubmit(onSubmit)}>
      <Stack gap={4}>
        <Flex gap={3} display={{ base: "none", lg: "flex" }} align="center">
          <Text fontSize="sm" fontWeight="medium" w="200px" flexShrink={0}>
            名前
          </Text>
          <Text fontSize="sm" fontWeight="medium" flex={1}>
            メールアドレス
          </Text>
          <Box w="32px" flexShrink={0} />
        </Flex>

        {fields.map((field, index) => {
          const emailError = errors.entries?.[index]?.email;

          return (
            <Stack key={field.id} gap={1}>
              <Flex display={{ base: "flex", lg: "none" }} justify="space-between" align="center">
                <Text fontSize="sm" fontWeight="medium">
                  スタッフ {index + 1}
                </Text>
                {fields.length > 1 && (
                  <IconButton aria-label="削除" variant="ghost" size="xs" onClick={() => remove(index)}>
                    <LuX />
                  </IconButton>
                )}
              </Flex>

              <Flex gap={3} direction={{ base: "column", lg: "row" }} align={{ lg: "center" }}>
                <Field.Root w={{ lg: "200px" }} flexShrink={0}>
                  <Input placeholder="例: 田中 花子" {...register(`entries.${index}.name`)} />
                </Field.Root>

                <Field.Root invalid={!!emailError} flex={1}>
                  <Input type="email" placeholder="例: hanako@example.com" {...register(`entries.${index}.email`)} />
                  {emailError && <Field.ErrorText>{emailError.message}</Field.ErrorText>}
                </Field.Root>

                <Box display={{ base: "none", lg: "block" }} flexShrink={0}>
                  {fields.length > 1 ? (
                    <IconButton aria-label="削除" variant="ghost" size="xs" onClick={() => remove(index)}>
                      <LuX />
                    </IconButton>
                  ) : (
                    <Box w="32px" />
                  )}
                </Box>
              </Flex>
            </Stack>
          );
        })}

        <Button
          variant="plain"
          size="sm"
          colorPalette="teal"
          alignSelf="flex-start"
          onClick={() => append(EMPTY_ENTRY)}
        >
          <LuPlus />
          追加
        </Button>
      </Stack>
    </form>
  );
};
