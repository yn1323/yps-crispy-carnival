import { Box, Field, Grid, HStack, Input, type SelectRootProps, Stack, Text } from "@chakra-ui/react";
import { useId } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { SHIFT_TYPE_NAME_MAX_LENGTH } from "@/convex/constants";
import type { ShiftTypeOption } from "@/convex/shop/schemas";
import { DIALOG_SELECT_POSITIONING } from "@/src/components/shared/ShopSubmissionPatternForm";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";

type TimeOption = { label: string; value: string };

export type ShiftTypeOptionRow = {
  index: number;
  option: ShiftTypeOption;
  startTimeOptions: TimeOption[];
  endTimeOptions: TimeOption[];
  nameError?: string;
  startTimeError?: string;
  endTimeError?: string;
  errorMessages: string[];
};

export type ShiftTypePatternFieldsProps = {
  invalid: boolean;
  rows: ShiftTypeOptionRow[];
  emptyMessage: string;
  emptyMessageInvalid: boolean;
  canAdd: boolean;
  limitMessage?: string;
  usePortal?: boolean;
  positioning?: SelectRootProps["positioning"];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<ShiftTypeOption>) => void;
};

export function ShiftTypePatternFields({
  invalid,
  rows,
  emptyMessage,
  emptyMessageInvalid,
  canAdd,
  limitMessage,
  usePortal = false,
  positioning = DIALOG_SELECT_POSITIONING,
  onAdd,
  onRemove,
  onUpdate,
}: ShiftTypePatternFieldsProps) {
  const emptyMessageId = useId();

  return (
    <Stack
      gap={3}
      p={3}
      borderWidth={1}
      borderColor={invalid ? "red.200" : "border.default"}
      borderRadius="md"
      bg="gray.50"
    >
      {rows.length === 0 ? (
        <Text
          id={emptyMessageId}
          role={emptyMessageInvalid ? "alert" : undefined}
          fontSize="xs"
          color={emptyMessageInvalid ? "red.600" : "fg.muted"}
        >
          {emptyMessage}
        </Text>
      ) : (
        <Stack gap={3}>
          {rows.map((row) => (
            <Stack key={row.option.id} gap={3}>
              <Grid
                templateColumns={{
                  base: "minmax(0, 1fr) minmax(0, 1fr) auto",
                  md: "minmax(180px, 1fr) minmax(148px, 180px) minmax(148px, 180px) auto",
                }}
                gap={2}
                alignItems="end"
              >
                <Field.Root invalid={!!row.nameError} gridColumn={{ base: "1 / -1", md: "auto" }}>
                  <Field.Label>区分名</Field.Label>
                  <Input
                    value={row.option.name}
                    maxLength={SHIFT_TYPE_NAME_MAX_LENGTH}
                    placeholder="例: 早番"
                    bg="white"
                    aria-invalid={!!row.nameError}
                    onChange={(event) => onUpdate(row.index, { name: event.target.value })}
                  />
                  {row.nameError && <Field.ErrorText>{row.nameError}</Field.ErrorText>}
                </Field.Root>
                <Field.Root invalid={!!row.startTimeError}>
                  <Select
                    label="開始"
                    items={row.startTimeOptions}
                    value={row.option.startTime}
                    onChange={(value) => onUpdate(row.index, { startTime: value })}
                    placeholder="開始"
                    usePortal={usePortal}
                    positioning={positioning}
                    invalid={!!row.startTimeError}
                  />
                  {row.startTimeError && <Field.ErrorText>{row.startTimeError}</Field.ErrorText>}
                </Field.Root>
                <Field.Root invalid={!!row.endTimeError}>
                  <Select
                    label="終了"
                    items={row.endTimeOptions}
                    value={row.option.endTime}
                    onChange={(value) => onUpdate(row.index, { endTime: value })}
                    placeholder="終了"
                    usePortal={usePortal}
                    positioning={positioning}
                    invalid={!!row.endTimeError}
                  />
                  {row.endTimeError && <Field.ErrorText>{row.endTimeError}</Field.ErrorText>}
                </Field.Root>
                <HStack justify={{ base: "flex-end", md: "start" }} alignSelf="end">
                  <IconButton
                    type="button"
                    aria-label={`${row.option.name || "勤務区分"}を削除`}
                    variant="outline"
                    colorPalette="red"
                    bg="white"
                    color="red.600"
                    onClick={() => onRemove(row.index)}
                  >
                    <LuTrash2 aria-hidden />
                  </IconButton>
                </HStack>
                {getUnassociatedErrors(row).length > 0 && (
                  <Stack gap={1} gridColumn="1 / -1">
                    {getUnassociatedErrors(row).map((message) => (
                      <Text key={message} fontSize="xs" color="red.600" lineHeight="short">
                        {message}
                      </Text>
                    ))}
                  </Stack>
                )}
              </Grid>
              {row.index < rows.length - 1 && <Box aria-hidden h="1px" bg="gray.300" mx={{ base: 2, md: 4 }} />}
            </Stack>
          ))}
        </Stack>
      )}
      <Stack gap={1} align="flex-start">
        <Button
          type="button"
          variant="outline"
          bg="white"
          alignSelf="flex-start"
          disabled={!canAdd}
          data-validation-target={emptyMessageInvalid ? "true" : undefined}
          aria-describedby={emptyMessageInvalid ? emptyMessageId : undefined}
          onClick={onAdd}
        >
          <LuPlus aria-hidden />
          勤務区分を追加
        </Button>
        {limitMessage && (
          <Text fontSize="xs" color="fg.muted">
            {limitMessage}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function getUnassociatedErrors(row: ShiftTypeOptionRow) {
  const associatedErrors = new Set([row.nameError, row.startTimeError, row.endTimeError]);
  return row.errorMessages.filter((message) => !associatedErrors.has(message));
}
