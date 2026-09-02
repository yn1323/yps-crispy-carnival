import { Flex, Link, Stack, Text } from "@chakra-ui/react";
import type { ElementType } from "react";
import {
  LuBell,
  LuBuilding2,
  LuCalendarCheck2,
  LuCircleHelp,
  LuClipboardPen,
  LuMegaphone,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { getHelpTaskHref, type HelpTask, type HelpTaskId } from "./helpTasks";

const TASK_ICONS: Record<HelpTaskId, ElementType> = {
  "shop-settings": LuStore,
  "staff-management": LuUsers,
  "shift-recruitment": LuMegaphone,
  "shift-submission": LuClipboardPen,
  "shift-building": LuCalendarCheck2,
  notifications: LuBell,
  "organization-billing": LuBuilding2,
  troubleshooting: LuCircleHelp,
};

export function HelpTaskLinkCard({ task }: { task: HelpTask }) {
  return (
    <Link
      href={getHelpTaskHref(task.id)}
      aria-label={task.title}
      display="flex"
      alignItems={{ base: "center", md: "flex-start" }}
      justifyContent="flex-start"
      gap={3}
      minH={{ base: "112px", md: "148px" }}
      p={{ base: 3, md: 4 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      bg="white"
      textAlign="left"
      textDecoration="none"
      _hover={{ borderColor: "gray.400", bg: "gray.50", boxShadow: "sm", textDecoration: "none" }}
      _active={{ bg: "gray.100" }}
      _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 2px var(--chakra-colors-teal-600)" }}
    >
      <HelpTaskCardContent task={task} />
    </Link>
  );
}

function HelpTaskCardContent({ task }: { task: HelpTask }) {
  const TaskIcon = TASK_ICONS[task.id];

  return (
    <>
      <Flex align="center" justify="center" boxSize={{ base: 9, md: 10 }} flexShrink={0} borderRadius="lg" bg="teal.50">
        <TaskIcon aria-hidden color="var(--chakra-colors-teal-800)" />
      </Flex>
      <Stack gap={1} minW={0}>
        <HelpAudienceBadge audience={task.audience} />
        <Text fontWeight="bold" lineHeight="1.5" fontSize={{ base: "sm", md: "md" }}>
          {task.title}
        </Text>
        <Text
          display={{ base: "none", md: "block" }}
          color="gray.600"
          fontSize="sm"
          lineHeight="1.6"
          lineClamp={{ base: undefined, md: 2 }}
        >
          {task.description}
        </Text>
      </Stack>
    </>
  );
}
