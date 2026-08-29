import { Badge, Box, Flex, Heading, Link, Stack, Text } from "@chakra-ui/react";
import type { ElementType } from "react";
import {
  LuBell,
  LuBuilding2,
  LuCalendarCheck2,
  LuCircleHelp,
  LuClipboardPen,
  LuMegaphone,
  LuRocket,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { getHelpTaskHref, type HelpTask, type HelpTaskId } from "./helpTasks";

const TASK_ICONS: Record<HelpTaskId, ElementType> = {
  "getting-started": LuRocket,
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
      alignItems="flex-start"
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

export function SelectedHelpTaskCard({ task }: { task: HelpTask }) {
  return (
    <Box
      as="section"
      aria-labelledby={`help-task-${task.id}-title`}
      display="flex"
      alignItems="flex-start"
      gap={3}
      minH={{ base: "132px", md: "156px" }}
      p={{ base: 4, md: 5 }}
      position="relative"
      borderWidth="1px"
      borderColor="teal.500"
      borderRadius="lg"
      color="gray.950"
      bg="teal.50"
    >
      <Badge
        position="absolute"
        top={-2}
        insetEnd={-1}
        zIndex={1}
        colorPalette="teal"
        variant="solid"
        borderRadius="full"
        px={2}
        aria-hidden="true"
      >
        選択中
      </Badge>
      <HelpTaskCardContent task={task} selected />
    </Box>
  );
}

function HelpTaskCardContent({ task, selected = false }: { task: HelpTask; selected?: boolean }) {
  const TaskIcon = TASK_ICONS[task.id];

  return (
    <>
      <Flex
        align="center"
        justify="center"
        boxSize={{ base: 9, md: 10 }}
        flexShrink={0}
        borderRadius="lg"
        bg={selected ? "teal.100" : "teal.50"}
      >
        <TaskIcon aria-hidden color="var(--chakra-colors-teal-800)" />
      </Flex>
      <Stack gap={1} minW={0}>
        <HelpAudienceBadge audience={task.audience} />
        {selected ? (
          <Heading
            id={`help-task-${task.id}-title`}
            as="h1"
            color="gray.950"
            fontSize={{ base: "xl", md: "2xl" }}
            lineHeight="1.5"
            letterSpacing="0"
          >
            {task.title}
          </Heading>
        ) : (
          <Text fontWeight="bold" lineHeight="1.5" fontSize={{ base: "sm", md: "md" }}>
            {task.title}
          </Text>
        )}
        <Text
          display={selected ? "block" : { base: "none", md: "block" }}
          color="gray.600"
          fontSize="sm"
          lineHeight="1.6"
          lineClamp={selected ? undefined : 2}
        >
          {task.description}
        </Text>
      </Stack>
    </>
  );
}
