import { Box, chakra, Flex, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type SectionProps = {
  headingId: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

/** 見出し行と本文を持つ、設定ページのセクション。店舗詳細のセクションと同じ見た目にそろえる。 */
export function SetupSection({ headingId, title, description, action, children }: SectionProps) {
  return (
    <Stack as="section" gap={3} aria-labelledby={headingId}>
      <Flex align="center" justify="space-between" gap={3} minH="36px">
        <Text
          id={headingId}
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          {title}
        </Text>
        {action}
      </Flex>
      {description && (
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {description}
        </Text>
      )}
      {children}
    </Stack>
  );
}

export function SetupCard({ children }: { children: ReactNode }) {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      {children}
    </Box>
  );
}

/** ポジションの色を示す丸。色は用意した一覧の値をそのまま当てる。 */
export function PositionDot({ color, size = "12px" }: { color: string; size?: string }) {
  return <Box boxSize={size} borderRadius="full" flexShrink={0} style={{ background: color }} aria-hidden />;
}

type SegmentedRadioProps<Value extends string> = {
  name: string;
  label: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string }>;
  disabled?: boolean;
  onChange: (value: Value) => void;
};

/** 少ない選択肢から1つを選ぶ、横並びの単一選択。選択中は濃いtealと白文字で示す。 */
export function SegmentedRadio<Value extends string>({
  name,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SegmentedRadioProps<Value>) {
  return (
    <Flex role="radiogroup" aria-label={label} gap={1} flexShrink={0}>
      {options.map((option) => (
        <chakra.label
          key={option.value}
          position="relative"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flex={{ base: 1, md: "none" }}
          minH={{ base: "44px", md: "32px" }}
          px={3}
          borderWidth="1px"
          borderColor="gray.300"
          borderRadius="md"
          bg="white"
          color="gray.700"
          fontSize="sm"
          fontWeight="semibold"
          whiteSpace="nowrap"
          cursor={disabled ? "not-allowed" : "pointer"}
          transitionProperty="background-color"
          transitionDuration="faster"
          _hover={disabled ? undefined : { bg: "gray.50" }}
          _active={disabled ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
          css={{
            "&:has(input:checked)": { bg: "teal.600", borderColor: "teal.600", color: "white" },
            "&:has(input:disabled)": { opacity: 0.64 },
            "&:has(input:focus-visible)": {
              outlineWidth: "2px",
              outlineStyle: "solid",
              outlineColor: "teal.700",
              outlineOffset: "2px",
            },
          }}
        >
          <chakra.input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            position="absolute"
            inset={0}
            w="full"
            h="full"
            m={0}
            opacity={0}
            cursor="inherit"
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </chakra.label>
      ))}
    </Flex>
  );
}
