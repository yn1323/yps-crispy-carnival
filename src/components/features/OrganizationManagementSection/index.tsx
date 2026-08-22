import { Box, Container, Flex, Grid, Heading, HStack, Icon, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuCalendarDays, LuCheck, LuStore, LuUsersRound } from "react-icons/lu";

const managementFeatures: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuStore,
    title: "店舗ごとに整理して管理",
    body: "スタッフ、募集、シフト表を店舗ごとに分けて、必要な店舗へ切り替えられます。",
  },
  {
    icon: LuUsersRound,
    title: "複数の担当者で分担",
    body: "店長や副店長を管理者に追加して、募集・調整・確定を一人で抱えずに進められます。",
  },
];

const shops = ["渋谷店", "新宿店", "池袋店"];

const managers = [
  { name: "店長", initials: "店" },
  { name: "副店長", initials: "副" },
  { name: "担当者", initials: "担" },
];

const scheduleRows = [
  { name: "スタッフA", shifts: [true, true, false] },
  { name: "スタッフB", shifts: [false, true, true] },
];

export function OrganizationManagementSection() {
  return (
    <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
      <Container maxW="7xl">
        <Grid
          templateAreas={{
            base: '"copy" "visual" "features"',
            lg: '"copy visual" "features visual"',
          }}
          templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 0.88fr) minmax(0, 1.12fr)" }}
          columnGap={{ lg: 14, xl: 20 }}
          rowGap={{ base: 8, md: 10 }}
          alignItems="center"
        >
          <VStack gridArea="copy" align="start" gap={4} maxW="620px">
            <Text color="teal.700" fontWeight="bold">
              1店舗から、複数店舗まで
            </Text>
            <Heading as="h2" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              店舗が増えても、
              <Box as="span" display="block">
                担当者が増えても。
              </Box>
            </Heading>
            <Text color="gray.700" lineHeight="1.9">
              店舗ごとにスタッフやシフトを分けながら、同じ管理画面から切り替えて管理できます。
              店長や副店長など、複数のシフト担当者で募集・調整・確定を分担できます。
            </Text>
          </VStack>

          <ManagementPreview />

          <Stack gridArea="features" gap={5} maxW="620px">
            {managementFeatures.map((feature) => (
              <ManagementFeature key={feature.title} {...feature} />
            ))}
          </Stack>
        </Grid>
      </Container>
    </Box>
  );
}

function ManagementFeature({ icon, title, body }: { icon: IconType; title: string; body: string }) {
  return (
    <Flex align="flex-start" gap={4}>
      <Flex align="center" justify="center" boxSize={11} bg="teal.50" color="teal.700" borderRadius="lg" flexShrink={0}>
        <Icon as={icon} boxSize={6} />
      </Flex>
      <Box>
        <Heading as="h3" color="gray.950" fontSize="lg" lineHeight="1.5">
          {title}
        </Heading>
        <Text color="gray.700" fontSize="sm" lineHeight="1.8" mt={1}>
          {body}
        </Text>
      </Box>
    </Flex>
  );
}

function ManagementPreview() {
  return (
    <Box
      gridArea="visual"
      aria-hidden
      bg="teal.50"
      borderRadius={{ base: "2xl", md: "3xl" }}
      p={{ base: 4, sm: 6, md: 8 }}
    >
      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" p={{ base: 4, sm: 5, md: 6 }}>
        <Flex align="center" justify="space-between" gap={4} mb={5}>
          <Box>
            <Text color="gray.500" fontSize="xs" fontWeight="bold">
              シフト管理
            </Text>
            <Text color="gray.950" fontWeight="bold" mt={0.5}>
              店舗を切り替え
            </Text>
          </Box>
          <Flex align="center" justify="center" boxSize={10} bg="teal.100" color="teal.800" borderRadius="lg">
            <Icon as={LuStore} boxSize={5} />
          </Flex>
        </Flex>

        <SimpleGrid columns={3} gap={2}>
          {shops.map((shop, index) => (
            <Box
              key={shop}
              bg={index === 0 ? "teal.600" : "gray.50"}
              color={index === 0 ? "white" : "gray.700"}
              borderWidth="1px"
              borderColor={index === 0 ? "teal.600" : "gray.200"}
              borderRadius="lg"
              px={2}
              py={2.5}
              textAlign="center"
              fontSize={{ base: "xs", sm: "sm" }}
              fontWeight="bold"
              whiteSpace="nowrap"
            >
              {shop}
            </Box>
          ))}
        </SimpleGrid>

        <Box borderTopWidth="1px" borderColor="gray.100" mt={6} pt={5}>
          <Flex align="center" justify="space-between" gap={3}>
            <Text color="gray.950" fontSize="sm" fontWeight="bold">
              シフト担当者
            </Text>
            <Text color="gray.500" fontSize="xs">
              3名で管理
            </Text>
          </Flex>
          <HStack gap={{ base: 3, sm: 5 }} mt={4} flexWrap="wrap">
            {managers.map((manager, index) => (
              <VStack key={manager.name} gap={1.5}>
                <Flex
                  align="center"
                  justify="center"
                  boxSize={10}
                  bg={index === 0 ? "teal.100" : "gray.100"}
                  color={index === 0 ? "teal.800" : "gray.700"}
                  borderRadius="full"
                  fontSize="sm"
                  fontWeight="bold"
                >
                  {manager.initials}
                </Flex>
                <Text color="gray.600" fontSize="xs" fontWeight="semibold">
                  {manager.name}
                </Text>
              </VStack>
            ))}
            <Flex
              align="center"
              justify="center"
              boxSize={10}
              bg="white"
              color="gray.500"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="full"
              fontSize="lg"
              fontWeight="bold"
            >
              +
            </Flex>
          </HStack>
        </Box>

        <Box bg="gray.50" borderRadius="xl" mt={6} p={{ base: 3, sm: 4 }}>
          <Flex align="center" gap={2} color="gray.800" mb={3}>
            <Icon as={LuCalendarDays} boxSize={4} />
            <Text fontSize="sm" fontWeight="bold">
              今週のシフト
            </Text>
          </Flex>
          <Grid templateColumns="minmax(76px, 1.15fr) repeat(3, minmax(0, 1fr))" gap={2} alignItems="center">
            <Box />
            {["月", "火", "水"].map((day) => (
              <Text key={day} color="gray.500" fontSize="xs" textAlign="center">
                {day}
              </Text>
            ))}
            {scheduleRows.map((row) => (
              <ScheduleRow key={row.name} {...row} />
            ))}
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}

function ScheduleRow({ name, shifts }: { name: string; shifts: boolean[] }) {
  return (
    <>
      <Text color="gray.600" fontSize="xs" fontWeight="semibold" whiteSpace="nowrap">
        {name}
      </Text>
      {shifts.map((hasShift, index) => (
        <Flex
          key={`${name}-${index}`}
          align="center"
          justify="center"
          minH={7}
          bg={hasShift ? "teal.600" : "white"}
          borderWidth="1px"
          borderColor={hasShift ? "teal.600" : "gray.200"}
          borderRadius="md"
        >
          {hasShift ? <Icon as={LuCheck} boxSize={3.5} color="white" /> : null}
        </Flex>
      ))}
    </>
  );
}
