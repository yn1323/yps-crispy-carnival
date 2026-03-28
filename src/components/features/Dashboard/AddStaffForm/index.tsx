import { Box, Button, Field, Flex, IconButton, Input, Stack, Text } from "@chakra-ui/react";
import { useCallback, useRef, useState } from "react";
import { LuPlus, LuX } from "react-icons/lu";

type StaffEntry = {
  id: string;
  name: string;
  email: string;
};

const createEntry = (): StaffEntry => ({
  id: crypto.randomUUID(),
  name: "",
  email: "",
});

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

type Props = {
  onEntriesChange?: (hasValidEntry: boolean) => void;
};

export const AddStaffForm = ({ onEntriesChange }: Props) => {
  const [entries, setEntries] = useState<StaffEntry[]>(() => [createEntry(), createEntry(), createEntry()]);
  const prevHasValidRef = useRef(false);

  const setEntriesAndNotify = useCallback(
    (next: StaffEntry[]) => {
      setEntries(next);
      const hasValid = next.some((e) => e.name.trim() !== "" || e.email.trim() !== "");
      if (hasValid !== prevHasValidRef.current) {
        prevHasValidRef.current = hasValid;
        onEntriesChange?.(hasValid);
      }
    },
    [onEntriesChange],
  );

  const updateEntry = (id: string, field: "name" | "email", value: string) => {
    setEntriesAndNotify(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const addEntry = () => {
    setEntriesAndNotify([...entries, createEntry()]);
  };

  const removeEntry = (id: string) => {
    if (entries.length <= 1) return;
    setEntriesAndNotify(entries.filter((e) => e.id !== id));
  };

  return (
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

      {entries.map((entry, index) => {
        const emailError = entry.email.trim() !== "" && !isValidEmail(entry.email);

        return (
          <Stack key={entry.id} gap={1}>
            <Flex display={{ base: "flex", lg: "none" }} justify="space-between" align="center">
              <Text fontSize="sm" fontWeight="medium">
                スタッフ {index + 1}
              </Text>
              {entries.length > 1 && (
                <IconButton aria-label="削除" variant="ghost" size="xs" onClick={() => removeEntry(entry.id)}>
                  <LuX />
                </IconButton>
              )}
            </Flex>

            <Flex gap={3} direction={{ base: "column", lg: "row" }} align={{ lg: "center" }}>
              <Field.Root w={{ lg: "200px" }} flexShrink={0}>
                <Input
                  placeholder="例: 田中 花子"
                  value={entry.name}
                  onChange={(e) => updateEntry(entry.id, "name", e.target.value)}
                />
              </Field.Root>

              <Field.Root invalid={emailError} flex={1}>
                <Input
                  type="email"
                  placeholder="例: hanako@example.com"
                  value={entry.email}
                  onChange={(e) => updateEntry(entry.id, "email", e.target.value)}
                />
                {emailError && <Field.ErrorText>正しいメールアドレスを入力してください</Field.ErrorText>}
              </Field.Root>

              <Box display={{ base: "none", lg: "block" }} flexShrink={0}>
                {entries.length > 1 ? (
                  <IconButton aria-label="削除" variant="ghost" size="xs" onClick={() => removeEntry(entry.id)}>
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

      <Button variant="plain" size="sm" colorPalette="teal" alignSelf="flex-start" onClick={addEntry}>
        <LuPlus />
        追加
      </Button>
    </Stack>
  );
};
