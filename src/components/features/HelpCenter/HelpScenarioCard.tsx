import { Flex, Link, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuBellRing, LuBuilding2, LuDownload, LuSprout } from "react-icons/lu";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { SHIFT_MANAGEMENT_SCENARIO } from "./helpScenario";
import type { HelpAudience } from "./helpTasks";
import { NOTIFICATION_BASICS_HELP } from "./notificationBasicsHelp";
import { ORGANIZATION_STRUCTURE_HELP } from "./organizationStructureHelp";
import { SHIFT_EXPORT_HELP } from "./shiftExportHelp";

export function HelpShiftExportLinkCard() {
  return (
    <HelpBasicLinkCard
      href={SHIFT_EXPORT_HELP.href}
      title={SHIFT_EXPORT_HELP.cardTitle}
      description={SHIFT_EXPORT_HELP.cardDescription}
      audiences={[SHIFT_EXPORT_HELP.audience]}
      icon={LuDownload}
    />
  );
}

export function HelpScenarioLinkCard() {
  return (
    <HelpBasicLinkCard
      href={SHIFT_MANAGEMENT_SCENARIO.href}
      title={SHIFT_MANAGEMENT_SCENARIO.cardTitle}
      description={SHIFT_MANAGEMENT_SCENARIO.cardDescription}
      audiences={["manager", "staff"]}
      icon={LuSprout}
    />
  );
}

export function HelpOrganizationStructureLinkCard() {
  return (
    <HelpBasicLinkCard
      href={ORGANIZATION_STRUCTURE_HELP.href}
      title={ORGANIZATION_STRUCTURE_HELP.cardTitle}
      description={ORGANIZATION_STRUCTURE_HELP.cardDescription}
      audiences={[ORGANIZATION_STRUCTURE_HELP.audience]}
      icon={LuBuilding2}
    />
  );
}

export function HelpNotificationBasicsLinkCard() {
  return (
    <HelpBasicLinkCard
      href={NOTIFICATION_BASICS_HELP.href}
      title={NOTIFICATION_BASICS_HELP.cardTitle}
      description={NOTIFICATION_BASICS_HELP.cardDescription}
      audiences={NOTIFICATION_BASICS_HELP.audiences}
      icon={LuBellRing}
    />
  );
}

function HelpBasicLinkCard({
  href,
  title,
  description,
  audiences,
  icon: CardIcon,
}: {
  href: string;
  title: string;
  description: string;
  audiences: readonly HelpAudience[];
  icon: IconType;
}) {
  return (
    <Link
      href={href}
      aria-label={title}
      display="flex"
      alignItems="center"
      gap={{ base: 3, md: 4 }}
      minH={{ base: "120px", md: "132px" }}
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      bg="white"
      textDecoration="none"
      _hover={{ borderColor: "gray.400", bg: "gray.50", boxShadow: "sm", textDecoration: "none" }}
      _active={{ bg: "gray.100" }}
      _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 2px var(--chakra-colors-teal-600)" }}
    >
      <Flex
        align="center"
        justify="center"
        boxSize={{ base: 10, md: 12 }}
        flexShrink={0}
        borderRadius="lg"
        bg="teal.50"
      >
        <CardIcon aria-hidden color="var(--chakra-colors-teal-800)" />
      </Flex>
      <Stack gap={1} minW={0} flex="1">
        <Flex gap={2} wrap="wrap">
          {audiences.map((audience) => (
            <HelpAudienceBadge key={audience} audience={audience} />
          ))}
        </Flex>
        <Text fontWeight="bold" lineHeight="1.5" fontSize={{ base: "md", md: "lg" }}>
          {title}
        </Text>
        <Text display={{ base: "none", md: "block" }} color="gray.600" fontSize="sm" lineHeight="1.7">
          {description}
        </Text>
      </Stack>
      <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
    </Link>
  );
}
