import { Badge, Box, Card, Flex, Text } from "@chakra-ui/react";
import { Animation } from "@/src/components/templates/Animation";

export const AttendanceTab = () => {
  return (
    <Animation>
      <Box>
        {[
          { date: "11/8", day: "金", checkIn: "09:58", checkOut: "18:05", workHours: "8.1時間", status: "正常" },
          { date: "11/6", day: "水", checkIn: "12:55", checkOut: "21:10", workHours: "8.3時間", status: "正常" },
          { date: "11/5", day: "火", checkIn: "10:05", checkOut: "18:02", workHours: "8.0時間", status: "正常" },
          { date: "11/4", day: "月", checkIn: "09:50", checkOut: "17:55", workHours: "8.1時間", status: "正常" },
          { date: "11/1", day: "金", checkIn: "10:15", checkOut: "18:00", workHours: "7.8時間", status: "遅刻" },
        ].map((record, index) => (
          <Card.Root key={index} borderWidth={0} shadow="sm" mb={3}>
            <Card.Body p={{ base: 3, md: 4 }}>
              <Flex align="center" justify="space-between" mb={2}>
                <Flex align="center" gap={3}>
                  <Box textAlign="center" minW="48px">
                    <Text fontSize="sm" color="gray.900">
                      {record.date}
                    </Text>
                    <Text fontSize="xs" color="gray.600">
                      {record.day}
                    </Text>
                  </Box>
                  <Badge
                    variant={record.status === "正常" ? "outline" : "solid"}
                    fontSize="xs"
                    borderColor={record.status === "正常" ? "teal.300" : undefined}
                    color={record.status === "正常" ? "teal.700" : "white"}
                    bg={record.status === "正常" ? "teal.50" : "orange.600"}
                  >
                    {record.status}
                  </Badge>
                </Flex>
                <Text fontSize="sm" color="gray.900" fontWeight="medium">
                  {record.workHours}
                </Text>
              </Flex>
              <Flex align="center" gap={4} fontSize="xs" color="gray.600" ml="60px">
                <Text>出勤: {record.checkIn}</Text>
                <Text>退勤: {record.checkOut}</Text>
              </Flex>
            </Card.Body>
          </Card.Root>
        ))}
      </Box>
    </Animation>
  );
};
