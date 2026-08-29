import { Alert, Box, Flex, RadioCard, Stack, Text } from "@chakra-ui/react";
import { LuUser, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import type { ManagerSettingsCandidate } from "./types";

type Props = {
  candidates: readonly ManagerSettingsCandidate[];
  selectedPersonId: string;
  isSubmitting: boolean;
  isReadOnly?: boolean;
  showSubmitAction?: boolean;
  onSelect: (personId: string) => void;
  onSubmit: () => void;
};

export function ManagerCandidateListView({
  candidates,
  selectedPersonId,
  isSubmitting,
  isReadOnly = false,
  showSubmitAction = true,
  onSelect,
  onSubmit,
}: Props) {
  if (candidates.length === 0) {
    return (
      <Empty
        icon={LuUsers}
        title="招待できるスタッフがいません"
        description="組織設定でスタッフの氏名とメールアドレスを登録してから、もう一度お試しください。"
        variant="section"
      />
    );
  }

  const hasSelectableCandidate = candidates.some((candidate) => candidate.canSelect);
  return (
    <Stack gap={5}>
      <Stack gap={1}>
        <Text as="h2" fontSize="lg" fontWeight="semibold" color="gray.900">
          招待するスタッフを選択
        </Text>
      </Stack>

      {!hasSelectableCandidate && (
        <Alert.Root status="warning" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              現在、選択できるスタッフはいません。各スタッフの理由をご確認ください。
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <RadioCard.Root
        value={selectedPersonId}
        onValueChange={({ value }) => onSelect(value ?? "")}
        colorPalette="teal"
        disabled={isSubmitting || isReadOnly}
      >
        <Stack gap={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" overflow="hidden">
          {candidates.map((candidate, index) => {
            const isSelected = candidate.personId === selectedPersonId;
            return (
              <RadioCard.Item
                key={candidate.personId}
                value={candidate.personId}
                disabled={!candidate.canSelect || isReadOnly}
                borderWidth={0}
                borderRadius={0}
                borderTopWidth={index === 0 ? 0 : "1px"}
                borderTopColor="blackAlpha.100"
                bg={isSelected ? "gray.50" : "white"}
                color="gray.900"
                opacity={candidate.canSelect ? 1 : 0.7}
                cursor={candidate.canSelect && !isReadOnly ? "pointer" : "not-allowed"}
                _hover={candidate.canSelect && !isReadOnly && !isSelected ? { bg: "gray.50" } : undefined}
                _checked={{ bg: "gray.50", color: "gray.900" }}
              >
                <RadioCard.ItemHiddenInput />
                <RadioCard.ItemControl px={{ base: 3, md: 4 }} py={3.5} minH="72px" alignItems="center">
                  <RadioCard.ItemIndicator flexShrink={0} />
                  <Flex
                    boxSize="40px"
                    borderRadius="full"
                    bg="teal.50"
                    color="teal.700"
                    align="center"
                    justify="center"
                    fontWeight="semibold"
                    fontSize="sm"
                    flexShrink={0}
                    aria-hidden
                  >
                    {candidate.name.trim().charAt(0) || <LuUser />}
                  </Flex>
                  <RadioCard.ItemContent minW={0}>
                    <RadioCard.ItemText
                      aria-label={`${candidate.name}を選択`}
                      fontWeight="semibold"
                      color="inherit"
                      overflowWrap="anywhere"
                    >
                      {candidate.name}
                    </RadioCard.ItemText>
                    <RadioCard.ItemDescription color="fg.muted" fontSize="sm" overflowWrap="anywhere">
                      {candidate.contactEmail}
                    </RadioCard.ItemDescription>
                    {!candidate.canSelect && candidate.disabledReason && (
                      <Box fontSize="xs" color="orange.700" mt={1}>
                        {candidate.disabledReason}
                      </Box>
                    )}
                  </RadioCard.ItemContent>
                </RadioCard.ItemControl>
              </RadioCard.Item>
            );
          })}
        </Stack>
      </RadioCard.Root>

      {showSubmitAction && (
        <Flex justify="flex-end">
          <Button
            colorPalette="teal"
            minH="44px"
            w={{ base: "full", md: "auto" }}
            minW={{ md: "208px" }}
            loading={isSubmitting}
            disabled={!selectedPersonId || isSubmitting || isReadOnly}
            onClick={onSubmit}
          >
            管理者として招待する
          </Button>
        </Flex>
      )}
    </Stack>
  );
}
