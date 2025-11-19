import {
  Badge,
  Box,
  Button,
  Container,
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Flex,
  Icon,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuCalendar, LuChevronLeft, LuClock, LuInfo, LuPencil, LuPlus, LuStore, LuTrash2 } from "react-icons/lu";
import { Select } from "@/src/components/ui/Select";

const mockStores = [
  { id: "1", name: "本店" },
  { id: "2", name: "駅前店" },
  { id: "3", name: "ショッピングモール店" },
];

type ShiftTemplate = {
  id: string;
  name: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
};

const mockShiftTemplates: Record<string, ShiftTemplate[]> = {
  "1": [
    { id: "1", name: "早番", daysOfWeek: ["月", "火", "水", "木", "金"], startTime: "09:00", endTime: "17:00" },
    { id: "2", name: "遅番", daysOfWeek: ["月", "火", "水", "木", "金"], startTime: "13:00", endTime: "21:00" },
    { id: "3", name: "土日シフト", daysOfWeek: ["土", "日"], startTime: "10:00", endTime: "19:00" },
  ],
  "2": [
    { id: "4", name: "午前シフト", daysOfWeek: ["火"], startTime: "08:00", endTime: "12:00" },
    { id: "5", name: "午後シフト", daysOfWeek: [], startTime: "14:00", endTime: "18:00" },
  ],
  "3": [],
};

const weekdays = ["月", "火", "水", "木", "金"];
const MAX_TEMPLATES = 5;

type ShiftTemplateListProps = {
  storeId?: string;
};

export const ShiftTemplateList = ({ storeId = "1" }: ShiftTemplateListProps) => {
  const [selectedStoreId, setSelectedStoreId] = useState(storeId);
  const [shiftTemplates, setShiftTemplates] = useState(mockShiftTemplates);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const currentTemplates = shiftTemplates[selectedStoreId] || [];
  const canAddMore = currentTemplates.length < MAX_TEMPLATES;

  const getDaysDisplay = (days: string[]) => {
    if (days.length === 0) return "曜日指定なし";

    const isWeekdays =
      weekdays.every((day) => days.includes(day)) &&
      days.filter((d) => weekdays.includes(d)).length === weekdays.length &&
      !days.includes("土") &&
      !days.includes("日") &&
      !days.includes("祝");

    if (isWeekdays) return "平日";

    return days.join("・");
  };

  const handleOpenDeleteDialog = (templateId: string) => {
    setDeletingTemplateId(templateId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteTemplate = () => {
    if (!deletingTemplateId) return;

    setShiftTemplates((prev) => ({
      ...prev,
      [selectedStoreId]: prev[selectedStoreId].filter((t) => t.id !== deletingTemplateId),
    }));

    setIsDeleteDialogOpen(false);
    setDeletingTemplateId(null);
  };

  return (
    <Container maxW="6xl" p={{ base: 4, md: 8 }}>
      <Box mb={{ base: 4, md: 6 }}>
        <Button variant="ghost" mb={{ base: 3, md: 4 }} ml={-2} color="gray.600" _hover={{ color: "gray.900" }} asChild>
          <Link to="/settings">
            <Icon as={LuChevronLeft} boxSize={4} mr={2} />
            設定に戻る
          </Link>
        </Button>

        <Flex align="center" gap={3} mb={2}>
          <Flex p={2} bg="teal.50" borderRadius="lg">
            <Icon as={LuClock} boxSize={5} color="teal.600" />
          </Flex>
          <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
            よく使うシフト
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600">
          シフト申請時にワンクリックで時間を入力できます
        </Text>
      </Box>

      <Box>
        <VStack gap="6" align="stretch">
          <Box w="full" bg="blue.50" borderRadius="lg" boxShadow="sm" p={4}>
            <Flex align="start" gap={3}>
              <Flex p={2} bg="blue.100" borderRadius="lg" flexShrink={0}>
                <Icon as={LuInfo} boxSize={5} color="blue.600" />
              </Flex>
              <Box flex={1}>
                <Text as="h4" fontSize="sm" fontWeight="semibold" color="blue.900" mb={1}>
                  テンプレートの使い方
                </Text>
                <Text fontSize="xs" color="blue.800">
                  シフト申請画面で登録したテンプレートを選択すると、時間帯と曜日が自動で入力されます。よく申請するシフトを登録しておくことで、毎回の入力作業を省略できます。
                </Text>
              </Box>
            </Flex>
          </Box>

          <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
            <Flex align="start" gap={3} mb={3}>
              <Flex p={2} bg="teal.50" borderRadius="lg">
                <Icon as={LuStore} boxSize={5} color="teal.600" />
              </Flex>
              <Box flex={1}>
                <Text as="h3" fontSize="md" fontWeight="semibold" color="gray.900" mb={1}>
                  店舗選択
                </Text>
                <Text fontSize="xs" color="gray.600">
                  編集する店舗を選択してください
                </Text>
              </Box>
            </Flex>
            <Select
              items={mockStores.map((store) => ({ value: store.id, label: store.name }))}
              value={selectedStoreId}
              onChange={(value) => setSelectedStoreId(value)}
            />
          </Box>

          <Box w="full" bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }}>
            <Flex align="start" justify="space-between" gap={3} mb={4}>
              <Flex align="center" gap={2}>
                <Text as="h3" fontSize="md" fontWeight="semibold" color="gray.900">
                  シフトテンプレート
                </Text>
                <Badge variant="outline" borderColor="teal.300" color="teal.700" bg="teal.50">
                  {currentTemplates.length}/{MAX_TEMPLATES}件
                </Badge>
              </Flex>
              <Button size="sm" disabled={!canAddMore} colorPalette="teal" gap={2} flexShrink={0} asChild>
                <Link to="/settings/shift-template/add">
                  <Icon as={LuPlus} boxSize={4} />
                  <Text display={{ base: "none", sm: "inline" }}>追加</Text>
                </Link>
              </Button>
            </Flex>

            {!canAddMore && (
              <Box mb={3} p={2} bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg">
                <Text fontSize="xs" color="orange.800">
                  最大{MAX_TEMPLATES}件まで登録できます
                </Text>
              </Box>
            )}

            {currentTemplates.length > 0 ? (
              <VStack gap={3} align="stretch">
                {currentTemplates.map((template) => (
                  <Box
                    key={template.id}
                    w="full"
                    bg="white"
                    borderWidth="1px"
                    borderColor="gray.200"
                    borderRadius="lg"
                    p={3}
                  >
                    <Flex align="start" justify="space-between" gap={3}>
                      <Flex align="start" gap={3} flex={1} minW={0}>
                        <Flex p={2} bg="teal.50" borderRadius="lg" flexShrink={0}>
                          <Icon as={LuCalendar} boxSize={4} color="teal.600" />
                        </Flex>
                        <Box flex={1} minW={0}>
                          <Flex align="center" gap={2} mb={2} flexWrap="wrap">
                            {template.daysOfWeek.length > 0 ? (
                              getDaysDisplay(template.daysOfWeek) === "平日" ? (
                                <Badge bg="teal.600" color="white" fontSize="xs">
                                  平日
                                </Badge>
                              ) : (
                                template.daysOfWeek.map((day) => (
                                  <Badge key={day} bg="teal.600" color="white" fontSize="xs">
                                    {day}
                                  </Badge>
                                ))
                              )
                            ) : (
                              <Badge variant="outline" borderColor="gray.300" color="gray.600" fontSize="xs">
                                曜日指定なし
                              </Badge>
                            )}
                            <Text fontSize="sm" color="gray.900">
                              {template.name}
                            </Text>
                          </Flex>
                          <Flex align="center" gap={1} fontSize="xs" color="gray.600">
                            <Icon as={LuClock} boxSize={3} />
                            <Text>
                              {template.startTime} - {template.endTime}
                            </Text>
                          </Flex>
                        </Box>
                      </Flex>
                      <Flex gap={1} flexShrink={0}>
                        <Button
                          size="sm"
                          variant="ghost"
                          h={8}
                          w={8}
                          p={0}
                          color="gray.600"
                          _hover={{ color: "teal.600", bg: "teal.50" }}
                          asChild
                        >
                          <Link to="/settings/shift-template/edit" search={{ id: template.id }}>
                            <Icon as={LuPencil} boxSize={4} />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDeleteDialog(template.id)}
                          h={8}
                          w={8}
                          p={0}
                          color="gray.600"
                          _hover={{ color: "red.600", bg: "red.50" }}
                        >
                          <Icon as={LuTrash2} boxSize={4} />
                        </Button>
                      </Flex>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Box textAlign="center" py={8}>
                <Icon as={LuClock} boxSize={12} color="gray.300" mx="auto" mb={3} />
                <Text fontSize="sm" color="gray.500">
                  よく使うシフトが登録されていません
                </Text>
                <Text fontSize="xs" color="gray.400" mt={1}>
                  追加ボタンから登録してください
                </Text>
              </Box>
            )}
          </Box>
        </VStack>
      </Box>

      <DialogRoot open={isDeleteDialogOpen} onOpenChange={(e: { open: boolean }) => setIsDeleteDialogOpen(e.open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>シフトテンプレートを削除</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody>
            <Text fontSize="sm">
              このシフトテンプレートを削除してもよろしいですか？
              <br />
              この操作は取り消せません。
            </Text>
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline">キャンセル</Button>
            </DialogActionTrigger>
            <Button colorPalette="red" onClick={handleDeleteTemplate}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Container>
  );
};
