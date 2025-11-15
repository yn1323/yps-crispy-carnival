import { Badge, Box, Button, Container, Field, Flex, Grid, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronLeft, LuClock, LuPlus, LuSave, LuX } from "react-icons/lu";

type ShiftTemplate = {
  id: string;
  name: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
};

const allDays = ["月", "火", "水", "木", "金", "土", "日", "祝"];

type ShiftTemplateFormProps = {
  mode: "add" | "edit";
  storeName?: string;
  template?: ShiftTemplate;
  onBack?: () => void;
  onSave?: (data: Omit<ShiftTemplate, "id">) => void;
};

export const ShiftTemplateForm = ({ mode, storeName = "本店", template, onBack, onSave }: ShiftTemplateFormProps) => {
  const [formData, setFormData] = useState({
    name: template?.name || "",
    daysOfWeek: template?.daysOfWeek || ([] as string[]),
    startTime: template?.startTime || "09:00",
    endTime: template?.endTime || "18:00",
  });

  const toggleDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day],
    }));
  };

  const handleCancel = () => {
    onBack?.();
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      return;
    }

    if (formData.startTime >= formData.endTime) {
      return;
    }

    onSave?.(formData);
  };

  return (
    <Container maxW="3xl" p={{ base: 4, md: 8 }}>
      <Box mb={{ base: 4, md: 6 }}>
        <Button
          variant="ghost"
          onClick={handleCancel}
          mb={{ base: 3, md: 4 }}
          ml={-2}
          color="gray.600"
          _hover={{ color: "gray.900" }}
        >
          <Icon as={LuChevronLeft} boxSize={4} mr={2} />
          一覧に戻る
        </Button>

        <Flex align="center" gap={3} mb={2}>
          <Flex p={2} bg="teal.50" borderRadius="lg">
            <Icon as={LuClock} boxSize={5} color="teal.600" />
          </Flex>
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
            {mode === "add" ? "シフトテンプレート追加" : "シフトテンプレート編集"}
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600">
          {storeName}
        </Text>
      </Box>

      <Box>
        <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
          <VStack gap={4} align="stretch">
            <Field.Root>
              <Field.Label htmlFor="template-name" fontSize="sm" color="gray.700">
                名前{" "}
                <Text as="span" color="red.500">
                  *
                </Text>
              </Field.Label>
              <Input
                id="template-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例: 早番"
              />
            </Field.Root>

            <Box>
              <Text fontSize="sm" color="gray.700" mb={2} fontWeight="medium">
                曜日{" "}
                <Text as="span" fontSize="xs" color="gray.500">
                  (複数選択可)
                </Text>
              </Text>
              <Flex flexWrap="wrap" gap={2}>
                {allDays.map((day) => (
                  <Badge
                    key={day}
                    onClick={() => toggleDay(day)}
                    cursor="pointer"
                    fontSize="xs"
                    transition="all 0.15s"
                    _active={{ transform: "scale(0.95)" }}
                    bg={formData.daysOfWeek.includes(day) ? "teal.600" : "gray.100"}
                    color={formData.daysOfWeek.includes(day) ? "white" : "gray.700"}
                    _hover={{
                      bg: formData.daysOfWeek.includes(day) ? "teal.700" : "gray.200",
                    }}
                  >
                    {day}
                  </Badge>
                ))}
              </Flex>
              {formData.daysOfWeek.length === 0 && (
                <Text fontSize="xs" color="gray.500" mt={1.5}>
                  曜日を選択しない場合は「曜日指定なし」になります
                </Text>
              )}
            </Box>

            <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
              <Field.Root>
                <Field.Label htmlFor="template-start" fontSize="sm" color="gray.700">
                  開始時刻{" "}
                  <Text as="span" color="red.500">
                    *
                  </Text>
                </Field.Label>
                <Input
                  id="template-start"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label htmlFor="template-end" fontSize="sm" color="gray.700">
                  終了時刻{" "}
                  <Text as="span" color="red.500">
                    *
                  </Text>
                </Field.Label>
                <Input
                  id="template-end"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </Field.Root>
            </Grid>
          </VStack>

          <Flex
            flexDirection={{ base: "column-reverse", sm: "row" }}
            gap={2}
            mt={6}
            pt={6}
            borderTopWidth="1px"
            borderColor="gray.200"
          >
            <Button variant="outline" onClick={handleCancel} flex={{ base: 1, sm: "none" }}>
              <Icon as={LuX} boxSize={4} mr={2} />
              キャンセル
            </Button>
            <Button onClick={handleSave} flex={{ base: 1, sm: "none" }} colorPalette="teal">
              {mode === "add" ? (
                <>
                  <Icon as={LuPlus} boxSize={4} mr={2} />
                  追加
                </>
              ) : (
                <>
                  <Icon as={LuSave} boxSize={4} mr={2} />
                  保存
                </>
              )}
            </Button>
          </Flex>
        </Box>
      </Box>
    </Container>
  );
};
