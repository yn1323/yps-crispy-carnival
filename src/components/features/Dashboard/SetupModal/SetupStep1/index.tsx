import { Box, Field, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { LuCalendarDays, LuClock3, LuListChecks } from "react-icons/lu";
import { SHOP_NAME_MAX_LENGTH } from "@/convex/constants";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { Button } from "@/src/components/ui/Button";
import { selectSubmissionPattern } from "@/src/domains/shop/submissionPattern";
import { SUBMISSION_PATTERN_OPTIONS } from "./script";

export type { Step1Data } from "./types";

type SetupShopInfoStepProps = {
  shopName: string;
  submissionPattern: ShiftSubmissionPattern;
  shopNameError?: string;
  onShopNameChange: (value: string) => void;
  onSubmissionPatternChange: (next: ShiftSubmissionPattern) => void;
};

export const SetupShopInfoStep = ({
  shopName,
  submissionPattern,
  shopNameError,
  onShopNameChange,
  onSubmissionPatternChange,
}: SetupShopInfoStepProps) => (
  <Stack gap={5}>
    <Field.Root invalid={!!shopNameError}>
      <Field.Label>お店の名前</Field.Label>
      <Input
        name="shopName"
        value={shopName}
        maxLength={SHOP_NAME_MAX_LENGTH}
        placeholder="例：居酒屋たなか"
        onChange={(event) => onShopNameChange(event.target.value)}
      />
      {shopNameError && <Field.ErrorText>{shopNameError}</Field.ErrorText>}
    </Field.Root>

    <Stack gap={3}>
      <Box>
        <Text fontSize="sm" fontWeight="medium" color="fg.default">
          希望シフトの提出方法
        </Text>
      </Box>
      <SimpleGrid columns={3} gap={{ base: 2, md: 3 }}>
        {SUBMISSION_PATTERN_OPTIONS.map((option) => {
          const isSelected = submissionPattern.kind === option.kind;
          return (
            <Button
              key={option.kind}
              type="button"
              h="100%"
              minH={{ base: "128px", md: "160px" }}
              variant="outline"
              borderColor={isSelected ? "teal.500" : "border.default"}
              borderWidth={isSelected ? 2 : 1}
              bg={isSelected ? "teal.50" : "white"}
              color="fg.default"
              p={0}
              overflow="hidden"
              aria-pressed={isSelected}
              onClick={() => onSubmissionPatternChange(selectSubmissionPattern(option.kind, submissionPattern))}
              _hover={{ bg: isSelected ? "teal.50" : "gray.50" }}
            >
              <Stack gap={0} align="stretch" w="full" h="full" textAlign="left">
                <Stack
                  direction={{ base: "column", md: "row" }}
                  gap={{ base: 1, md: 2 }}
                  minH={{ base: "56px", md: "72px" }}
                  align="center"
                  justify="center"
                  px={{ base: 2, md: 3 }}
                  bg={isSelected ? "teal.100" : "gray.50"}
                  borderBottomWidth={1}
                  borderColor="border.default"
                  color={isSelected ? "teal.700" : "fg.muted"}
                  fontWeight="bold"
                >
                  {option.kind === "dateOnly" && <LuCalendarDays />}
                  {option.kind === "time" && <LuClock3 />}
                  {option.kind === "shiftType" && <LuListChecks />}
                  <Text fontSize={{ base: "xs", md: "sm" }} lineHeight="short" textAlign="center">
                    {option.label}
                  </Text>
                </Stack>
                <Stack gap={2} p={{ base: 2, md: 4 }} flex={1}>
                  <Text
                    fontSize="xs"
                    color="fg.muted"
                    whiteSpace="normal"
                    lineHeight={{ base: "short", md: "tall" }}
                    textAlign="left"
                  >
                    {option.description}
                  </Text>
                </Stack>
              </Stack>
            </Button>
          );
        })}
      </SimpleGrid>
    </Stack>
  </Stack>
);
