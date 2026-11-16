import { Box, chakra, Flex, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type SectionProps = {
  headingId: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** 保存の応答を待っている間。セクションの中を操作できない状態にする。 */
  isBusy?: boolean;
  children: ReactNode;
};

/** 見出し行と本文を持つ、設定ページのセクション。店舗詳細のセクションと同じ見た目にそろえる。 */
export function SetupSection({ headingId, title, description, action, isBusy = false, children }: SectionProps) {
  return (
    <Stack
      as="section"
      gap={3}
      aria-labelledby={headingId}
      inert={isBusy}
      // 保存は通常すぐ終わるため、見た目はすぐには変えない。長引いたときだけ薄くして、待っていることを示す。
      opacity={isBusy ? 0.6 : 1}
      transitionProperty="opacity"
      transitionDuration="150ms"
      transitionDelay={isBusy ? "600ms" : "0ms"}
    >
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

type PositionBadgeProps = {
  name: string;
  color: string;
  /** 長い名前を1行で省略し、全文を`title`に出す。表の列の見出しなど、幅が決まっている場所で使う。 */
  truncate?: boolean;
};

/** ポジションを、その色の地と白い文字で示すバッジ。シフト表のポジションの見せ方にそろえる。 */
export function PositionBadge({ name, color, truncate = false }: PositionBadgeProps) {
  return (
    <chakra.span
      display={truncate ? "inline-block" : "inline-flex"}
      alignItems="center"
      minH="28px"
      maxW="full"
      px={3}
      py={truncate ? 1 : 0.5}
      borderRadius="full"
      color="white"
      fontSize="sm"
      fontWeight="semibold"
      lineHeight="1.3"
      {...(truncate
        ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }
        : { overflowWrap: "anywhere" })}
      title={truncate ? name : undefined}
      style={{ background: color }}
    >
      {name}
    </chakra.span>
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
  /** 選べない値。ほかの値は選べるまま、その選択肢だけを無効にする。 */
  disabledValues?: readonly Value[];
  onChange: (value: Value) => void;
};

/** 少ない選択肢から1つを選ぶ、横並びの単一選択。選択中は濃いtealと白文字で示す。 */
export function SegmentedRadio<Value extends string>({
  name,
  label,
  value,
  options,
  disabled = false,
  disabledValues = [],
  onChange,
}: SegmentedRadioProps<Value>) {
  return (
    <Flex role="radiogroup" aria-label={label} gap={1} flexShrink={0}>
      {options.map((option) => {
        const isDisabled = disabled || disabledValues.includes(option.value);
        return (
          <chakra.label
            key={option.value}
            position="relative"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flex={{ base: 1, md: "none" }}
            minH={{ base: "44px", md: "32px" }}
            // スマートフォンでは、4つの選択肢が1行に収まるよう左右の余白を詰める。
            px={{ base: 0.5, md: 3 }}
            borderWidth="1px"
            borderColor="gray.300"
            borderRadius="md"
            bg="white"
            color="gray.700"
            fontSize="sm"
            fontWeight="semibold"
            whiteSpace="nowrap"
            cursor={isDisabled ? "not-allowed" : "pointer"}
            transitionProperty="background-color"
            transitionDuration="faster"
            _hover={isDisabled ? undefined : { bg: "gray.50" }}
            _active={isDisabled ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
            css={{
              // 選択中は、カーソルを載せても濃いtealの地と白い文字を保つ。中立のホバー色を当てると白い文字が読めなくなる。
              "&:has(input:checked)": { bg: "teal.600", borderColor: "teal.600", color: "white" },
              "&:has(input:checked):is(:hover, [data-hover])": { bg: "teal.700", borderColor: "teal.700" },
              "&:has(input:checked):is(:active, [data-active])": { bg: "teal.800", borderColor: "teal.800" },
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
              disabled={isDisabled}
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
        );
      })}
    </Flex>
  );
}
