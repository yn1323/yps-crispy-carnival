import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuCircleAlert, LuX } from "react-icons/lu";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import { IssueDot } from "../components";

type ValidationErrorPanelProps = {
  issues: DisplayIssue[];
  onSelectIssue?: (issue: DisplayIssue) => void;
  onDismiss?: () => void;
  compact?: boolean;
};

const DismissButton = ({ onDismiss }: { onDismiss?: () => void }) => {
  if (!onDismiss) return null;
  return (
    <Flex
      as="button"
      aria-label="エラー一覧を閉じる"
      onClick={onDismiss}
      align="center"
      justify="center"
      flexShrink={0}
      boxSize="24px"
      borderRadius="md"
      color="red.600"
      cursor="pointer"
      _hover={{ bg: "red.100" }}
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
}: {
  issues: DisplayIssue[];
  onSelectIssue?: (issue: DisplayIssue) => void;
  compact: boolean;
}) => (
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
          _hover={{ bg: "red.100" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "red.400" }}
          onClick={() => onSelectIssue?.(issue)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectIssue?.(issue);
            }
          }}
        >
          <IssueDot />
          <Text textStyle={compact ? "xs" : "sm"} color="red.700">
            {issue.label}
          </Text>
        </Flex>
      ))}
    </Stack>
  </Box>
);

// 確定前バリデーションのエラー一覧。Shell内（ツールバー直下）に表示し、
// 行クリックで該当日付へジャンプする（ジャンプ処理は親から注入）。
export const ValidationErrorPanel = ({
  issues,
  onSelectIssue,
  onDismiss,
  compact = false,
}: ValidationErrorPanelProps) => {
  // SPは画面が狭いため、初期状態は1行のストリップに畳んでタップで展開する
  const [isExpanded, setIsExpanded] = useState(false);

  if (issues.length === 0) return null;

  if (compact) {
    return (
      <Box role="alert" bg="red.50" borderBottomWidth="1px" borderColor="red.200" flexShrink={0}>
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
            <Icon color="red.600" boxSize={4} flexShrink={0}>
              <LuCircleAlert />
            </Icon>
            <Text textStyle="sm" fontWeight={700} color="red.700">
              確定できません（エラー{issues.length}件）
            </Text>
            <Icon color="red.600" boxSize={4} flexShrink={0} ml="auto">
              {isExpanded ? <LuChevronUp /> : <LuChevronDown />}
            </Icon>
          </Flex>
          <DismissButton onDismiss={onDismiss} />
        </Flex>
        {isExpanded && (
          <>
            <Text px={3} pb={1} textStyle="xs" color="red.600">
              エラーをタップすると該当の日付に移動します
            </Text>
            <IssueList issues={issues} onSelectIssue={onSelectIssue} compact />
          </>
        )}
      </Box>
    );
  }

  return (
    <Box role="alert" bg="red.50" borderBottomWidth="1px" borderColor="red.200" flexShrink={0}>
      <Flex align="center" gap={2} px={5} pt={3} pb={2}>
        <Icon color="red.600" boxSize={4} flexShrink={0}>
          <LuCircleAlert />
        </Icon>
        <Text textStyle="sm" fontWeight={700} color="red.700">
          確定できません（エラー{issues.length}件）
        </Text>
        <Text textStyle="xs" color="red.600">
          エラーをクリックすると該当の日付に移動します
        </Text>
        <Box ml="auto">
          <DismissButton onDismiss={onDismiss} />
        </Box>
      </Flex>
      <IssueList issues={issues} onSelectIssue={onSelectIssue} compact={false} />
    </Box>
  );
};
