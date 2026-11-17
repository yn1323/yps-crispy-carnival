import { Box, chakra, Flex, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type SectionProps = {
  headingId: string;
  title: string;
  /** 設定する順番。見出しの左に番号で示す。読み上げ名には入れない。 */
  step?: number;
  description?: ReactNode;
  action?: ReactNode;
  /** 保存の応答を待っている間。セクションの中を操作できない状態にする。 */
  isBusy?: boolean;
  children: ReactNode;
};

/** 見出し行と本文を持つ、設定ページのセクション。店舗詳細のセクションと同じ見た目にそろえる。 */
export function SetupSection({ headingId, title, step, description, action, isBusy = false, children }: SectionProps) {
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
        <Flex align="center" gap={2} minW={0}>
          {step !== undefined && (
            <Flex
              aria-hidden
              align="center"
              justify="center"
              boxSize="24px"
              flexShrink={0}
              borderRadius="full"
              bg="teal.600"
              color="white"
              fontSize="sm"
              fontWeight="bold"
              lineHeight="1"
            >
              {step}
            </Flex>
          )}
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
        </Flex>
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

/** ポジションを追加するまで設定できないセクションの中身。詳細は見せず、先にすることだけを伝える。 */
export function SetupLockedNote({ children }: { children: ReactNode }) {
  return (
    <SetupCard>
      <Text px={{ base: 4, md: 5 }} py={4} fontSize="sm" color="fg.muted">
        {children}
      </Text>
    </SetupCard>
  );
}

type SetupCardProps = {
  children: ReactNode;
  /**
   * 角からはみ出す内容を切るか。中に画面の上端へ留める行を持つカードでは、留める動きを止めないようfalseにする。
   * falseにしたカードでは、角に触れる内容の側で角を丸める。
   */
  clipsOverflow?: boolean;
};

export function SetupCard({ children, clipsOverflow = true }: SetupCardProps) {
  return (
    <Box
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      overflow={clipsOverflow ? "hidden" : undefined}
    >
      {children}
    </Box>
  );
}

type PositionBadgeProps = {
  name: string;
  color: string;
  /** 長い名前を1行で省略し、全文を`title`に出す。表の列の見出しなど、幅が決まっている場所で使う。 */
  truncate?: boolean;
  /** 左右の余白を詰める。列の幅が狭い表の見出しで、名前を少しでも長く見せるために使う。 */
  compact?: boolean;
};

/** ポジションを、その色の地と白い文字で示すバッジ。シフト表のポジションの見せ方にそろえる。 */
export function PositionBadge({ name, color, truncate = false, compact = false }: PositionBadgeProps) {
  return (
    <chakra.span
      display={truncate ? "inline-block" : "inline-flex"}
      alignItems="center"
      minH="28px"
      maxW="full"
      px={compact ? 2 : 3}
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
