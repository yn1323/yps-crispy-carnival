import { Icon } from "@chakra-ui/react";
import { LuChevronRight } from "react-icons/lu";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { Button } from "@/src/components/ui/Button";

/** 説明の区切りに置く登録ボタン。Heroの主ボタンと同じ大きさにする。 */
export const SignupButton = ({ measurementCtaId }: { measurementCtaId: "flow_signup" | "pricing_signup" }) => (
  <Button
    asChild
    colorPalette="teal"
    h={{ base: "56px", md: "64px" }}
    minW="220px"
    w={{ base: "full", md: "auto" }}
    px={8}
    borderRadius="md"
    fontWeight="bold"
    fontSize="md"
  >
    <MeasurementLink href="/signup" measurementCtaId={measurementCtaId}>
      無料ではじめる
      <Icon as={LuChevronRight} boxSize={5} />
    </MeasurementLink>
  </Button>
);
