import { Box, Container, Grid, Heading, Link, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";

type FocusedFlowBackDestination = "/app/shifts" | "/app/manage/managers";

type Props = {
  title: string;
  backTo: FocusedFlowBackDestination;
  backLabel?: string;
  backAriaLabel?: string;
  action?: ReactNode;
};

export function FocusedFlowHeader({ title, backTo, backLabel = "戻る", backAriaLabel = backLabel, action }: Props) {
  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex="sticky"
      w="full"
      bg="whiteAlpha.950"
      borderBottomWidth="1px"
      borderColor="blackAlpha.100"
      backdropFilter="blur(14px)"
    >
      <Container maxW="1024px" minH={HEADER_HEIGHT} px={{ base: 3, md: 4 }} py={2}>
        <Grid
          minH={{ base: "48px", md: "52px" }}
          templateColumns="minmax(72px, 1fr) minmax(0, auto) minmax(72px, 1fr)"
          alignItems="center"
          gap={2}
        >
          <Link
            asChild
            justifySelf="start"
            display="inline-flex"
            alignItems="center"
            gap={1}
            minH="44px"
            px={1}
            color="gray.800"
            fontSize="sm"
            fontWeight="semibold"
            _hover={{ color: "teal.800", textDecoration: "none" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
          >
            <RouterLink to={backTo} aria-label={backAriaLabel}>
              <LuChevronLeft aria-hidden />
              <Text as="span" display={{ base: "none", sm: "inline" }}>
                戻る
              </Text>
            </RouterLink>
          </Link>
          <Heading as="h1" minW={0} color="gray.950" fontSize={{ base: "md", md: "lg" }} textAlign="center" truncate>
            {title}
          </Heading>
          <Box justifySelf="end" minW="44px">
            {action}
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}
