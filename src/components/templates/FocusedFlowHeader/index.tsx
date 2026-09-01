import { Box, Container, Grid, Heading, Text } from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { AUTHENTICATED_APP_HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";

const GLASS_BACKDROP_FILTER = "blur(12px) saturate(135%)";
const AUTHENTICATED_GLASS_BACKGROUND = "rgba(255, 255, 255, 0.00)";

type Props = {
  title: string;
  backLabel?: string;
  backAriaLabel?: string;
  action?: ReactNode;
  compact?: boolean;
};

type FocusedFlowBackButtonProps = {
  backLabel?: string;
  backAriaLabel?: string;
};

export function FocusedFlowBackButton({ backLabel = "戻る", backAriaLabel = backLabel }: FocusedFlowBackButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="plain"
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
      aria-label={backAriaLabel}
      onClick={() => router.history.back()}
    >
      <LuChevronLeft aria-hidden />
      <Text as="span" display={{ base: "none", sm: "inline" }}>
        戻る
      </Text>
    </Button>
  );
}

export function FocusedFlowHeader({
  title,
  backLabel = "戻る",
  backAriaLabel = backLabel,
  action,
  compact = false,
}: Props) {
  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex="sticky"
      w="full"
      bg={AUTHENTICATED_GLASS_BACKGROUND}
      borderBottomWidth="1px"
      borderColor="rgba(15, 23, 42, 0.08)"
      backdropFilter={GLASS_BACKDROP_FILTER}
      css={{ WebkitBackdropFilter: GLASS_BACKDROP_FILTER }}
    >
      <Container
        maxW="1024px"
        minH={compact ? { base: "48px", md: "52px" } : AUTHENTICATED_APP_HEADER_HEIGHT}
        px={{ base: 3, md: 4 }}
        py={0}
      >
        <Grid
          minH={{ base: "48px", md: "52px" }}
          templateColumns="minmax(72px, 1fr) minmax(0, auto) minmax(72px, 1fr)"
          alignItems="center"
          gap={2}
        >
          <FocusedFlowBackButton backLabel={backLabel} backAriaLabel={backAriaLabel} />
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
