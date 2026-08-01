import { Box, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { LuPlus, LuX } from "react-icons/lu";
import {
  EMAIL_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
  SHOP_STAFF_COUNT_MAX,
  STAFF_ADD_ENTRIES_MAX,
} from "@/convex/constants";
import { Button, IconButton } from "@/src/components/ui/Button";
import { toaster } from "@/src/components/ui/toaster";
import { STAFF_ADDITION_EMAIL_NOTICE, STAFF_COUNT_LIMIT_TOAST } from "../staffAdditionCopy";
import { type AddStaffFormData, addStaffSchema } from "./index";

const EMPTY_ENTRY = { name: "", email: "" } as const;

type Props = {
  onSubmit: (data: AddStaffFormData) => void | Promise<void>;
  /** 登録済みスタッフ数。これと入力行数の合計が上限を超える場合は追加・送信をさせない */
  currentStaffCount?: number;
};

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton aria-label="削除" variant="ghost" size="xs" onClick={onClick}>
      <LuX />
    </IconButton>
  );
}

export const AddStaffForm = ({ onSubmit, currentStaffCount = 0 }: Props) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AddStaffFormData>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: { entries: [EMPTY_ENTRY, EMPTY_ENTRY, EMPTY_ENTRY] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "entries" });
  const entriesErrorMessage = errors.entries?.root?.message ?? errors.entries?.message;
  const canAppend = fields.length < STAFF_ADD_ENTRIES_MAX;
  // あと何人追加できるか。上限を超えている店舗は 0 になり、追加も送信もできない
  const remainingSlots = Math.max(0, SHOP_STAFF_COUNT_MAX - currentStaffCount);

  const notifyStaffCountLimit = () => {
    toaster.create({ ...STAFF_COUNT_LIMIT_TOAST, type: "warning" });
  };

  const handleAppend = () => {
    if (!canAppend) return;
    if (fields.length >= remainingSlots) {
      notifyStaffCountLimit();
      return;
    }
    append(EMPTY_ENTRY);
  };

  const handleValidSubmit = (data: AddStaffFormData) => {
    const filledCount = data.entries.filter((entry) => entry.name !== "").length;
    if (filledCount > remainingSlots) {
      notifyStaffCountLimit();
      return;
    }
    return onSubmit(data);
  };

  return (
    <form id="add-staff-form" noValidate onSubmit={handleSubmit(handleValidSubmit)}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {STAFF_ADDITION_EMAIL_NOTICE}
        </Text>

        {entriesErrorMessage && (
          <Text fontSize="sm" color="fg.error">
            {entriesErrorMessage}
          </Text>
        )}

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
          const nameError = errors.entries?.[index]?.name;
          const emailError = errors.entries?.[index]?.email;

          return (
            <Stack key={field.id} gap={1}>
              <Flex display={{ base: "flex", lg: "none" }} justify="space-between" align="center">
                <Text fontSize="sm" fontWeight="medium">
                  スタッフ {index + 1}
                </Text>
                {fields.length > 1 && <RemoveButton onClick={() => remove(index)} />}
              </Flex>

              <Flex gap={3} direction={{ base: "column", lg: "row" }} align={{ lg: "flex-start" }}>
                <Field.Root w={{ lg: "200px" }} flexShrink={0} invalid={!!nameError} minH={{ lg: "60px" }}>
                  <Input
                    placeholder="例：田中 花子"
                    maxLength={PERSON_NAME_MAX_LENGTH}
                    {...register(`entries.${index}.name`)}
                  />
                  {nameError && <Field.ErrorText>{nameError.message}</Field.ErrorText>}
                </Field.Root>

                <Field.Root invalid={!!emailError} flex={1} minH={{ lg: "60px" }}>
                  <Input
                    type="email"
                    placeholder="例：hanako@example.com"
                    maxLength={EMAIL_MAX_LENGTH}
                    {...register(`entries.${index}.email`)}
                  />
                  {emailError && <Field.ErrorText>{emailError.message}</Field.ErrorText>}
                </Field.Root>

                <Box display={{ base: "none", lg: "block" }} flexShrink={0}>
                  {fields.length > 1 ? <RemoveButton onClick={() => remove(index)} /> : <Box w="32px" />}
                </Box>
              </Flex>
            </Stack>
          );
        })}

        <Button
          type="button"
          variant="plain"
          size="sm"
          colorPalette="teal"
          alignSelf="flex-start"
          disabled={!canAppend}
          onClick={handleAppend}
        >
          <LuPlus />
          スタッフをもう1人追加
        </Button>
      </Stack>
    </form>
  );
};
