import { Box, Flex, Heading, Icon } from "@chakra-ui/react";
import { type CSSProperties, useMemo } from "react";
import { LuCheck, LuPartyPopper } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

const CONFETTI_COLORS = ["#2dd4bf", "#fb923c", "#facc15", "#f472b6", "#60a5fa", "#4ade80"];

/** 毎回同じ位置になる乱数。描き直しても紙吹雪の配置が変わらないようにする。 */
const seeded = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const Confetti = () => {
  const pieces = useMemo(() => {
    const random = seeded(42);
    return Array.from({ length: 150 }, (_, index) => ({
      id: index,
      left: random() * 100,
      delay: random() * 1.6,
      duration: 2.6 + random() * 1.8,
      drift: (random() - 0.5) * 220,
      spin: 360 + random() * 720,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      width: 8 + random() * 7,
      height: 12 + random() * 12,
      round: random() < 0.25,
    }));
  }, []);
  return (
    <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden>
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          position="absolute"
          left={`${piece.left}%`}
          top="-4%"
          w={`${piece.width}px`}
          h={`${piece.round ? piece.width : piece.height}px`}
          borderRadius={piece.round ? "full" : "2px"}
          bg={piece.color}
          opacity={0.95}
          style={
            {
              "--drift": `${piece.drift}px`,
              "--spin": `${piece.spin}deg`,
              animation: `hodFall ${piece.duration}s linear ${piece.delay}s both`,
            } as CSSProperties
          }
        />
      ))}
    </Box>
  );
};

/** 下の左右の角から、クラッカーの紙テープと紙吹雪が飛び出す。 */
const Crackers = () => {
  const pieces = useMemo(() => {
    const random = seeded(7);
    return [-1, 1].flatMap((side) =>
      Array.from({ length: 34 }, (_, index) => ({
        id: `${side}-${index}`,
        side,
        dx: (90 + random() * 420) * (side < 0 ? 1 : -1),
        dy: -(320 + random() * 380),
        spin: (random() < 0.5 ? -1 : 1) * (240 + random() * 480),
        delay: 0.15 + random() * 0.35,
        color: CONFETTI_COLORS[(index + (side < 0 ? 0 : 3)) % CONFETTI_COLORS.length],
        streamer: index % 3 === 0,
        size: 8 + random() * 8,
      })),
    );
  }, []);
  return (
    <Box position="absolute" inset={0} overflow="hidden" pointerEvents="none" aria-hidden>
      {[-1, 1].map((side) => (
        <Icon
          key={side}
          as={LuPartyPopper}
          position="absolute"
          bottom={{ base: 3, md: 6 }}
          left={side < 0 ? { base: 3, md: 8 } : "auto"}
          right={side > 0 ? { base: 3, md: 8 } : "auto"}
          boxSize={{ base: 12, md: 16 }}
          color={side < 0 ? "orange.400" : "pink.400"}
          strokeWidth={1.6}
          style={{ transform: side > 0 ? "scaleX(-1)" : undefined }}
        />
      ))}
      {pieces.map((piece) => (
        <Box
          key={piece.id}
          position="absolute"
          bottom={{ base: "56px", md: "88px" }}
          left={piece.side < 0 ? { base: "40px", md: "72px" } : "auto"}
          right={piece.side > 0 ? { base: "40px", md: "72px" } : "auto"}
          style={
            {
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--spin": `${piece.spin}deg`,
              animation: `hodBurst 2.4s cubic-bezier(.2,.7,.3,1) ${piece.delay}s both`,
            } as CSSProperties
          }
        >
          {piece.streamer ? (
            <svg width="64" height="18" viewBox="0 0 64 18" aria-hidden="true" focusable="false">
              <path
                d="M2 9 C 8 1, 14 1, 18 9 S 28 17, 34 9 S 44 1, 50 9 S 58 17, 62 9"
                fill="none"
                stroke={piece.color}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <Box w={`${piece.size}px`} h={`${piece.size * 1.5}px`} borderRadius="2px" bg={piece.color} />
          )}
        </Box>
      ))}
    </Box>
  );
};

type Props = {
  /** 「まだシフトを操作してみる」を押した。シフト表へ戻り、確定した下書きのまま操作を続ける。 */
  onContinue: () => void;
};

/**
 * シフトの完成を、紙吹雪とクラッカーで祝う。主の行動は「シフトリを使ってみる」で、
 * 白抜きの「まだシフトを操作してみる」から、シフト表へ戻って操作を続けることもできる。
 */
export const PraiseScene = ({ onContinue }: Props) => (
  <Flex
    position="absolute"
    inset={0}
    zIndex={20}
    align="center"
    justify="center"
    bg="whiteAlpha.900"
    backdropFilter="blur(3px)"
    px={6}
    style={{ animation: "hodSceneIn .35s ease-out both" }}
  >
    <Confetti />
    <Crackers />
    <Flex
      direction="column"
      align="center"
      textAlign="center"
      w="full"
      maxW="640px"
      gap={{ base: 4, md: 5 }}
      position="relative"
      zIndex={1}
      bg="white"
      borderRadius="3xl"
      boxShadow="2xl"
      px={{ base: 6, md: 12 }}
      py={{ base: 8, md: 10 }}
    >
      <Flex
        boxSize={{ base: 16, md: 20 }}
        borderRadius="full"
        bg="green.500"
        color="white"
        align="center"
        justify="center"
        boxShadow="lg"
        style={{ animation: "hodPop .6s ease-out .1s both" }}
        aria-hidden
      >
        <Icon as={LuCheck} boxSize={{ base: 8, md: 10 }} strokeWidth={3} />
      </Flex>
      <Heading
        as="h2"
        fontSize={{ base: "2xl", md: "4xl" }}
        fontWeight="black"
        color="gray.900"
        style={{ animation: "hodFadeUp .5s ease-out .35s both" }}
      >
        シフトの完成です！
      </Heading>
      {/* 2つのボタンは、幅の広いほうにそろえて縦に並べる。 */}
      <Flex
        direction="column"
        align="stretch"
        gap={3}
        mt={2}
        w={{ base: "full", md: "auto" }}
        style={{ animation: "hodFadeUp .5s ease-out .75s both" }}
      >
        <Button asChild colorPalette="teal" h={12} px={10} borderRadius="md" fontSize="lg" fontWeight="bold">
          <a href="/signup">シフトリを使ってみる</a>
        </Button>
        <Button
          variant="outline"
          colorPalette="gray"
          bg="white"
          h={12}
          px={10}
          borderRadius="md"
          fontSize="lg"
          fontWeight="bold"
          onClick={onContinue}
        >
          まだシフトを操作してみる
        </Button>
      </Flex>
    </Flex>
  </Flex>
);
