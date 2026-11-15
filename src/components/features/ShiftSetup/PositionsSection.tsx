import { chakra, Field, Flex, Grid, HStack, Stack, Text } from "@chakra-ui/react";
import { type FormEvent, useRef, useState } from "react";
import { LuArrowDown, LuArrowUp, LuCheck, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { POSITION_ACTIVE_LIMIT, POSITION_NAME_MAX_LENGTH } from "@/convex/constants";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/FormControls";
import { PositionDot, SetupCard, SetupSection } from "./parts";
import {
  addPositionDraft,
  canAddPosition,
  canMovePositionDraft,
  findPositionDraftErrors,
  getRemovedPositionNames,
  movePositionDraft,
  POSITION_COLOR_OPTIONS,
  type PositionDraft,
  toPositionDrafts,
  toPositionInputs,
} from "./script";
import type { DialogState, PositionInput, ShiftSetupPosition } from "./types";

const FORM_ID = "shift-setup-positions-form";
const ICON_BUTTON_SIZE = { base: "44px", md: "36px" };

type Props = {
  positions: readonly ShiftSetupPosition[];
  canWrite: boolean;
  dialog: DialogState & { isSaving: boolean };
  onSave: (positions: PositionInput[]) => void;
};

export function PositionsSection({ positions, canWrite, dialog, onSave }: Props) {
  return (
    <SetupSection
      headingId="shift-setup-positions-heading"
      title="ポジション"
      action={
        <Button
          type="button"
          variant="ghost"
          colorPalette="teal"
          size="sm"
          gap={1.5}
          fontWeight="semibold"
          flexShrink={0}
          disabled={!canWrite}
          onClick={dialog.open}
        >
          <LuPencil aria-hidden />
          編集する
        </Button>
      }
    >
      <SetupCard>
        <Flex as="ul" listStyleType="none" wrap="wrap" columnGap={5} rowGap={2.5} px={{ base: 4, md: 5 }} py={4}>
          {positions.map((position) => (
            <HStack as="li" key={position._id} gap={2} minW={0}>
              <PositionDot color={position.color} />
              <Text fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
                {position.name}
              </Text>
            </HStack>
          ))}
        </Flex>
      </SetupCard>

      <Dialog
        title="ポジションを編集"
        isOpen={dialog.isOpen && canWrite}
        onOpenChange={dialog.onOpenChange}
        onClose={dialog.close}
        formId={FORM_ID}
        submitLabel="保存する"
        isLoading={dialog.isSaving}
        mobileFullScreen
        maxW={{ md: "560px" }}
        maxH={{ md: "85dvh" }}
        bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
      >
        <PositionsForm
          key={dialog.isOpen ? "open" : "closed"}
          positions={positions}
          disabled={dialog.isSaving}
          onSubmit={onSave}
        />
      </Dialog>
    </SetupSection>
  );
}

type FormProps = {
  positions: readonly ShiftSetupPosition[];
  disabled: boolean;
  onSubmit: (positions: PositionInput[]) => void;
};

function PositionsForm({ positions, disabled, onSubmit }: FormProps) {
  const [drafts, setDrafts] = useState(() => toPositionDrafts(positions));
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [paletteRowKey, setPaletteRowKey] = useState<string | null>(null);
  const addedCountRef = useRef(0);
  const focusRowKeyRef = useRef<string | null>(null);

  const errors = hasSubmitted ? findPositionDraftErrors(drafts) : null;
  const removedNames = getRemovedPositionNames(positions, drafts);
  const defaultPositionName = drafts.find((draft) => draft.isDefault)?.name.trim();
  const canAdd = canAddPosition(drafts);

  const updateDraft = (rowKey: string, patch: Partial<PositionDraft>) =>
    setDrafts((current) => current.map((draft) => (draft.rowKey === rowKey ? { ...draft, ...patch } : draft)));

  const handleAdd = () => {
    addedCountRef.current += 1;
    const rowKey = `new-${addedCountRef.current}`;
    focusRowKeyRef.current = rowKey;
    setDrafts((current) => addPositionDraft(current, rowKey));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setHasSubmitted(true);
    if (findPositionDraftErrors(drafts)) return;
    onSubmit(toPositionInputs(drafts));
  };

  return (
    <chakra.form id={FORM_ID} noValidate onSubmit={handleSubmit}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          レジ、キッチンなど、店の持ち場を登録します。
          <br />
          シフト表では勤務をポジションの色で見分けられます。
        </Text>

        <Stack as="ul" listStyleType="none" gap={0} divideY="1px" divideColor="blackAlpha.100">
          {drafts.map((draft, index) => {
            const label = draft.name.trim() || "新しいポジション";
            const error = errors?.rows[draft.rowKey];
            const isPaletteOpen = paletteRowKey === draft.rowKey;
            const paletteId = `${FORM_ID}-palette-${draft.rowKey}`;
            const lockedNoteId = `${FORM_ID}-locked-${draft.rowKey}`;

            return (
              <Stack as="li" key={draft.rowKey} gap={2} py={3}>
                <Grid
                  templateColumns={{ base: "auto minmax(0, 1fr)", md: "auto minmax(0, 1fr) auto" }}
                  gap={2}
                  alignItems="center"
                >
                  <chakra.button
                    type="button"
                    aria-label={`${label}の色を変更`}
                    aria-expanded={isPaletteOpen}
                    aria-controls={paletteId}
                    disabled={disabled}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    boxSize={ICON_BUTTON_SIZE}
                    borderWidth="1px"
                    borderColor="gray.300"
                    borderRadius="md"
                    bg="white"
                    cursor="pointer"
                    _hover={{ bg: "gray.50" }}
                    _active={{ bg: "gray.100" }}
                    _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
                    onClick={() => setPaletteRowKey(isPaletteOpen ? null : draft.rowKey)}
                  >
                    <PositionDot color={draft.color} size="20px" />
                  </chakra.button>

                  <Field.Root invalid={!!error} minW={0}>
                    <Input
                      ref={(element) => {
                        if (element && focusRowKeyRef.current === draft.rowKey) {
                          focusRowKeyRef.current = null;
                          element.focus();
                        }
                      }}
                      aria-label={`ポジション${index + 1}の名前`}
                      value={draft.name}
                      maxLength={POSITION_NAME_MAX_LENGTH}
                      placeholder="キッチン"
                      bg="white"
                      disabled={disabled}
                      onChange={(event) => updateDraft(draft.rowKey, { name: event.target.value })}
                    />
                  </Field.Root>

                  <HStack gap={1} gridColumn={{ base: "1 / -1", md: "auto" }} justify="flex-end">
                    <IconButton
                      type="button"
                      aria-label={`${label}を上へ移動`}
                      variant="ghost"
                      boxSize={ICON_BUTTON_SIZE}
                      disabled={disabled || !canMovePositionDraft(drafts, index, -1)}
                      onClick={() => setDrafts((current) => movePositionDraft(current, index, -1))}
                    >
                      <LuArrowUp aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      aria-label={`${label}を下へ移動`}
                      variant="ghost"
                      boxSize={ICON_BUTTON_SIZE}
                      disabled={disabled || !canMovePositionDraft(drafts, index, 1)}
                      onClick={() => setDrafts((current) => movePositionDraft(current, index, 1))}
                    >
                      <LuArrowDown aria-hidden />
                    </IconButton>
                    <IconButton
                      type="button"
                      aria-label={`${label}を削除`}
                      aria-describedby={draft.isDefault ? lockedNoteId : undefined}
                      variant="ghost"
                      colorPalette="red"
                      color="red.600"
                      boxSize={ICON_BUTTON_SIZE}
                      disabled={disabled || draft.isDefault}
                      onClick={() => setDrafts((current) => current.filter((item) => item.rowKey !== draft.rowKey))}
                    >
                      <LuTrash2 aria-hidden />
                    </IconButton>
                  </HStack>
                </Grid>

                {isPaletteOpen && (
                  <Flex id={paletteId} role="group" aria-label={`${label}の色`} wrap="wrap" gap={1.5}>
                    {POSITION_COLOR_OPTIONS.map((option) => {
                      const isSelected = option.value === draft.color;
                      return (
                        <chakra.button
                          key={option.value}
                          type="button"
                          aria-label={option.label}
                          aria-pressed={isSelected}
                          disabled={disabled}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          boxSize={ICON_BUTTON_SIZE}
                          borderRadius="full"
                          color="white"
                          cursor="pointer"
                          boxShadow={
                            isSelected ? "0 0 0 2px white, 0 0 0 4px var(--chakra-colors-gray-800)" : undefined
                          }
                          _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "3px" }}
                          style={{ background: option.value }}
                          onClick={() => {
                            updateDraft(draft.rowKey, { color: option.value });
                            setPaletteRowKey(null);
                          }}
                        >
                          {isSelected && <LuCheck aria-hidden />}
                        </chakra.button>
                      );
                    })}
                  </Flex>
                )}

                {error && (
                  <Text role="alert" fontSize="xs" color="red.600">
                    {error}
                  </Text>
                )}
                {draft.isDefault && (
                  <Text id={lockedNoteId} fontSize="xs" color="fg.muted">
                    最初からあるポジションは、削除と並び替えができません
                  </Text>
                )}
              </Stack>
            );
          })}
        </Stack>

        <Stack gap={1} align="flex-start">
          <Button
            type="button"
            variant="outline"
            bg="white"
            minH={{ base: "44px", md: "40px" }}
            disabled={disabled || !canAdd}
            onClick={handleAdd}
          >
            <LuPlus aria-hidden />
            ポジションを追加
          </Button>
          {!canAdd && (
            <Text fontSize="xs" color="fg.muted">
              ポジションは{POSITION_ACTIVE_LIMIT}件まで登録できます
            </Text>
          )}
        </Stack>

        {errors?.form && (
          <Text role="alert" fontSize="sm" color="red.600">
            {errors.form}
          </Text>
        )}

        {removedNames.length > 0 && (
          <Text fontSize="sm" color="orange.700" lineHeight="tall" bg="orange.50" borderRadius="md" px={3} py={2.5}>
            保存すると「{removedNames.join("」「")}」を削除します。
            <br />
            削除したポジションの勤務は、シフト表で「{defaultPositionName || "最初からあるポジション"}
            」として表示されます。
          </Text>
        )}
      </Stack>
    </chakra.form>
  );
}
