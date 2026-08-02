import { Box, Flex, Heading, Link, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export type BreadcrumbItem = { href?: string; label: string };

export function PageHeading({
  action,
  breadcrumbs = [],
  description,
  title,
}: {
  action?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  description: string;
  title: string;
}) {
  return (
    <Stack gap={3}>
      {breadcrumbs.length > 0 ? (
        <Flex aria-label="パンくず" as="nav" gap={2} wrap="wrap">
          {breadcrumbs.map((item, index) => (
            <Flex key={`${item.label}-${index}`} align="center" gap={2}>
              {index > 0 ? (
                <Text aria-hidden color="gray.400" fontSize="xs">
                  /
                </Text>
              ) : null}
              {item.href ? (
                <Link color="blue.600" fontSize="xs" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <Text aria-current="page" color="gray.500" fontSize="xs">
                  {item.label}
                </Text>
              )}
            </Flex>
          ))}
        </Flex>
      ) : null}
      <Flex
        align={{ base: "start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={4}
        justify="space-between"
      >
        <Box>
          <Heading as="h1" fontSize={{ base: "2xl", md: "3xl" }} letterSpacing="tight" tabIndex={-1}>
            {title}
          </Heading>
          <Text color="gray.600" fontSize="sm" mt={2}>
            {description}
          </Text>
        </Box>
        {action}
      </Flex>
    </Stack>
  );
}

export function SectionHeading({ description, title }: { description?: string; title: string }) {
  return (
    <Box>
      <Heading as="h2" fontSize="lg">
        {title}
      </Heading>
      {description ? (
        <Text color="gray.500" fontSize="sm" mt={1}>
          {description}
        </Text>
      ) : null}
    </Box>
  );
}
