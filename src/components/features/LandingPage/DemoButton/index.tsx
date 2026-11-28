import { Icon } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import { MeasurementLink } from "@/src/components/shared/MeasurementLink";
import { Button } from "@/src/components/ui/Button";

/**
 * 登録なしで操作できる体験デモを、TOPを残したまま別タブで開く。
 * 「無料ではじめる」と同じ大きさにし、登録より目立たせないよう枠線のボタンにする。
 */
export const DemoButton = ({ measurementCtaId }: { measurementCtaId: "hero_demo" | "flow_demo" }) => (
  <Button
    asChild
    colorPalette="teal"
    variant="outline"
    bg="white"
    h={{ base: "56px", md: "64px" }}
    minW="220px"
    w={{ base: "full", md: "auto" }}
    px={8}
    borderRadius="md"
    fontWeight="bold"
    fontSize="md"
  >
    <MeasurementLink
      href="/demo/simple"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="デモを試す（別タブで開きます）"
      measurementCtaId={measurementCtaId}
    >
      デモを試す
      <Icon as={LuExternalLink} boxSize={4} aria-hidden />
    </MeasurementLink>
  </Button>
);
