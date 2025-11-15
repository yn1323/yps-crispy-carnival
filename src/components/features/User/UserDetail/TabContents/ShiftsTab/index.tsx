import { Badge, Box, Card, Flex, Separator, Text } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";

export const ShiftsTab = () => {
  return (
    <Animation>
      <Card.Root borderWidth={0} shadow="sm">
        <Card.Body p={{ base: 4, md: 6 }}>
          {[
            { date: "11/9", day: "土", shift: "10:00 - 18:00", status: "確定" },
            { date: "11/8", day: "金", shift: "10:00 - 18:00", status: "完了" },
            { date: "11/7", day: "木", shift: "休み", status: "休日" },
            { date: "11/6", day: "水", shift: "13:00 - 21:00", status: "完了" },
            { date: "11/5", day: "火", shift: "10:00 - 18:00", status: "完了" },
          ].map((shift, index) => (
            <Box key={index}>
              <Flex align="center" justify="space-between" py={3}>
                <Flex align="center" gap={{ base: 3, md: 4 }}>
                  <Box textAlign="center" minW="48px">
                    <Text fontSize="sm" color="gray.900">
                      {shift.date}
                    </Text>
                    <Text fontSize="xs" color="gray.600">
                      {shift.day}
                    </Text>
                  </Box>
                  <Separator orientation="vertical" h={8} />
                  <Box>
                    <Text fontSize="sm" color={shift.status === "休日" ? "gray.500" : "gray.900"}>
                      {shift.shift}
                    </Text>
                  </Box>
                </Flex>
                <Badge
                  variant="outline"
                  fontSize="xs"
                  bg={shift.status === "確定" ? "teal.600" : shift.status === "完了" ? "transparent" : "gray.50"}
                  color={shift.status === "確定" ? "white" : shift.status === "完了" ? "gray.700" : "gray.600"}
                  borderColor={shift.status === "確定" ? "teal.600" : "gray.300"}
                >
                  {shift.status}
                </Badge>
              </Flex>
              {index < 4 && <Separator />}
            </Box>
          ))}
        </Card.Body>
      </Card.Root>
    </Animation>
  );
};
