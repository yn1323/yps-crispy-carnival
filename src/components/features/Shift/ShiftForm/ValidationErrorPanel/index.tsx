import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { IconType } from "react-icons/lib";
import { LuChevronDown, LuChevronUp, LuCircleAlert, LuTriangleAlert, LuX } from "react-icons/lu";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import { IssueDot, type IssueTone } from "../components";

// エラー（赤・確定をブロック）と確認事項（オレンジ・確定はできる助言）で見た目と文言を切り替える。
const TONE_CONFIG: Record<
  IssueTone,
  {
    bg: string;
    border: string;
    fg: string;
    hover: string;
    focus: string;
    icon: IconType;
    title: (count: number) => string;
    hint: (verb: string) => string;
    dismissLabel: string;
  }
> = {
  error: {
    bg: "red.50",
    border: "red.200",
    fg: "red.700",
    hover: "red.100",
    focus: "red.400",
    icon: LuCircleAlert,
    title: (count) => `確定できません（エラー${count}件）`,
    hint: (verb) => `エラーを${verb}と該当の日付に移動します`,
    dismissLabel: "エラー一覧を閉じる",
  },
  warning: {
    bg: "orange.50",
    border: "orange.200",
    fg: "orange.700",
    hover: "orange.100",
    focus: "orange.400",
    icon: LuTriangleAlert,
    title: (count) => `確認事項（${count}件）`,
    hint: (verb) => `気になる項目を${verb}と該当の日付に移動します`,
    dismissLabel: "確認事項を閉じる",
  },
};

type ValidationErrorPanelProps = {
  issues: DisplayIssue[];
  onSelectIssue?: (issue: DisplayIssue) => void;
  onDismiss?: () => void;
  compact?: boolean;
  tone?: IssueTone;
};

const DismissButton = ({ onDismiss, tone }: { onDismiss?: () => void; tone: IssueTone }) => {
  if (!onDismiss) return null;
  const config = TONE_CONFIG[tone];
  return (
    <Flex
      as="button"
      aria-label={config.dismissLabel}
      onClick={onDismiss}
      align="center"
      justify="center"
      flexShrink={0}
      boxSize="24px"
      borderRadius="md"
      color={config.fg}
      cursor="pointer"
      _hover={{ bg: config.hover }}
    >
      <Icon boxSize={4}>
        <LuX />
      </Icon>
    </Flex>
  );
};

const IssueList = ({
  issues,
  onSelectIssue,
  compact,
  tone,
}: {
  issues: DisplayIssue[];
  onSelectIssue?: (issue: DisplayIssue) => void;
  compact: boolean;
  tone: IssueTone;
}) => {
  const config = TONE_CONFIG[tone];
  return (
    <Box maxH={compact ? "160px" : "120px"} overflowY="auto" px={compact ? 2 : 4} pb={2}>
      <Stack gap={0}>
        {issues.map((issue) => (
          <Flex
            key={issue.key}
            role="button"
            tabIndex={0}
            align="center"
            gap={2}
            px={2}
            py="6px"
            borderRadius="md"
            cursor="pointer"
            _hover={{ bg: config.hover }}
            _focusVisible={{ outline: "2px solid", outlineColor: config.focus }}
            onClick={() => onSelectIssue?.(issue)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectIssue?.(issue);
              }
            }}
          >
            <IssueDot tone={tone} />
            <Text textStyle={compact ? "xs" : "sm"} color={config.fg}>
              {issue.label}
            </Text>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
};

// 確定前バリデーションのエラー/確認事項一覧。Shell内（ツールバー直下）に表示し、
// 行クリックで該当日付へジャンプする（ジャンプ処理は親から注入）。
export const ValidationErrorPanel = ({
  issues,
  onSelectIssue,
  onDismiss,
  compact = false,
  tone = "error",
}: ValidationErrorPanelProps) => {
  // SPは画面が狭いため、初期状態は1行のストリップに畳んでタップで展開する
  const [isExpanded, setIsExpanded] = useState(false);
  const config = TONE_CONFIG[tone];
  const TitleIcon = config.icon;

  if (issues.length === 0 || tone === "warning") return null;

  if (compact) {
    return (
      <Box role="alert" bg={config.bg} borderBottomWidth="1px" borderColor={config.border} flexShrink={0}>
        <Flex align="center" gap={2} px={3} py="10px">
          <Flex
            as="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((v) => !v)}
            align="center"
            gap={2}
            flex={1}
            minW={0}
            cursor="pointer"
            textAlign="left"
          >
            <Icon color={config.fg} boxSize={4} flexShrink={0}>
              <TitleIcon />
            </Icon>
            <Text textStyle="sm" fontWeight={700} color={config.fg}>
              {config.title(issues.length)}
            </Text>
            <Icon color={config.fg} boxSize={4} flexShrink={0} ml="auto">
              {isExpanded ? <LuChevronUp /> : <LuChevronDown />}
            </Icon>
          </Flex>
          <DismissButton onDismiss={onDismiss} tone={tone} />
        </Flex>
        {isExpanded && (
          <>
            <Text px={3} pb={1} textStyle="xs" color={config.fg}>
              {config.hint("タップする")}
            </Text>
            <IssueList issues={issues} onSelectIssue={onSelectIssue} compact tone={tone} />
          </>
        )}
      </Box>
    );
  }

  return (
    <Box role="alert" bg={config.bg} borderBottomWidth="1px" borderColor={config.border} flexShrink={0}>
      <Flex align="center" gap={2} px={5} pt={3} pb={2}>
        <Icon color={config.fg} boxSize={4} flexShrink={0}>
          <TitleIcon />
        </Icon>
        <Text textStyle="sm" fontWeight={700} color={config.fg}>
          {config.title(issues.length)}
        </Text>
        <Text textStyle="xs" color={config.fg}>
          {config.hint("クリックする")}
        </Text>
        <Box ml="auto">
          <DismissButton onDismiss={onDismiss} tone={tone} />
        </Box>
      </Flex>
      <IssueList issues={issues} onSelectIssue={onSelectIssue} compact={false} tone={tone} />
    </Box>
  );
};
