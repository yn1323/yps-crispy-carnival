import { Box, chakra, Grid, Stack, Text } from "@chakra-ui/react";
import { LuCheck, LuUsers } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import { SegmentedRadio, SetupSection } from "./parts";
import { isLastAvailablePosition, SKILL_LEVEL_OPTIONS } from "./script";
import type { ShiftSetupIntents, ShiftSetupPosition, ShiftSetupStaff, StaffProfile } from "./types";

type Props = {
  staffs: readonly ShiftSetupStaff[];
  positions: readonly ShiftSetupPosition[];
  profiles: Readonly<Record<string, StaffProfile>>;
  canWrite: boolean;
  intents: Pick<ShiftSetupIntents, "onToggleStaffPosition" | "onChangeStaffSkillLevel">;
};

export function StaffProfilesSection({ staffs, positions, profiles, canWrite, intents }: Props) {
  // ポジションが1つだけの店舗では、入れるポジションを選ぶ余地がないため列を出さない。
  const showsPositions = positions.length > 1;
  const columns = showsPositions ? "minmax(8rem, 14rem) minmax(0, 1fr) 12rem" : "minmax(0, 1fr) 12rem";

  return (
    <SetupSection
      headingId="shift-setup-staffs-heading"
      title="スタッフ"
      description={
        showsPositions
          ? "色の付いたポジションに入れます。入れないポジションは押して外してください。"
          : "スタッフごとの熟練度を選べます。シフト表では名前の横に印が出ます。"
      }
    >
      {staffs.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="シフト対象のスタッフがいません"
          titleAs="h3"
          description="店舗詳細でスタッフを所属させると、ここで条件を選べます。"
          variant="section"
          py={8}
        />
      ) : (
        <Stack
          gap={{ base: 2, md: 0 }}
          borderWidth={{ md: "1px" }}
          borderColor="blackAlpha.100"
          borderRadius={{ md: "xl" }}
          bg={{ md: "white" }}
          overflow={{ md: "hidden" }}
        >
          <Grid
            display={{ base: "none", md: "grid" }}
            templateColumns={columns}
            columnGap={4}
            px={5}
            py={2.5}
            bg="gray.50"
            borderBottomWidth="1px"
            borderColor="blackAlpha.100"
            fontSize="xs"
            fontWeight="semibold"
            color="fg.muted"
            aria-hidden
          >
            <Text>名前</Text>
            {showsPositions && <Text>入れるポジション</Text>}
            <Text>熟練度</Text>
          </Grid>

          {staffs.map((staff, index) => {
            const profile = profiles[staff._id] ?? {
              unavailablePositionIds: staff.unavailablePositionIds,
              skillLevel: staff.skillLevel,
            };
            return (
              <Grid
                key={staff._id}
                role="group"
                aria-label={staff.name}
                templateColumns={{ base: "minmax(0, 1fr)", md: columns }}
                columnGap={4}
                rowGap={3}
                alignItems="center"
                px={{ base: 3, md: 5 }}
                py={{ base: 3, md: 2.5 }}
                bg="white"
                borderWidth={{ base: "1px", md: 0 }}
                borderTopWidth={{ md: index === 0 ? 0 : "1px" }}
                borderColor="blackAlpha.100"
                borderRadius={{ base: "xl", md: 0 }}
              >
                <Text fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
                  {staff.name}
                </Text>

                {showsPositions && (
                  <Stack gap={1.5} minW={0}>
                    <Text display={{ md: "none" }} fontSize="xs" fontWeight="semibold" color="fg.muted">
                      入れるポジション
                    </Text>
                    <Grid
                      role="group"
                      aria-label="入れるポジション"
                      templateColumns={{
                        base: "repeat(auto-fill, minmax(7.5rem, 1fr))",
                        md: "repeat(auto-fill, minmax(7rem, 1fr))",
                      }}
                      gap={1.5}
                    >
                      {positions.map((position) => (
                        <PositionToggle
                          key={position._id}
                          position={position}
                          isAvailable={!profile.unavailablePositionIds.includes(position._id)}
                          isLocked={isLastAvailablePosition(profile, position._id, positions)}
                          disabled={!canWrite}
                          onToggle={() => intents.onToggleStaffPosition(staff._id, position._id)}
                        />
                      ))}
                    </Grid>
                  </Stack>
                )}

                <Stack gap={1.5}>
                  <Text display={{ md: "none" }} fontSize="xs" fontWeight="semibold" color="fg.muted">
                    熟練度
                  </Text>
                  <SegmentedRadio
                    name={`shift-setup-skill-${staff._id}`}
                    label="熟練度"
                    value={profile.skillLevel}
                    options={SKILL_LEVEL_OPTIONS}
                    disabled={!canWrite}
                    onChange={(skillLevel) => intents.onChangeStaffSkillLevel(staff._id, skillLevel)}
                  />
                </Stack>
              </Grid>
            );
          })}
        </Stack>
      )}
    </SetupSection>
  );
}

type PositionToggleProps = {
  position: ShiftSetupPosition;
  isAvailable: boolean;
  /** 最後に残った「入れるポジション」は外せない。 */
  isLocked: boolean;
  disabled: boolean;
  onToggle: () => void;
};

function PositionToggle({ position, isAvailable, isLocked, disabled, onToggle }: PositionToggleProps) {
  const isInteractive = !disabled && !isLocked;

  return (
    <chakra.button
      type="button"
      aria-pressed={isAvailable}
      aria-disabled={isLocked || undefined}
      title={isLocked ? "入れるポジションは1つ以上必要です" : undefined}
      disabled={disabled}
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={1}
      minH={{ base: "44px", md: "32px" }}
      minW={0}
      px={2}
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="md"
      bg="white"
      color="gray.500"
      fontSize="sm"
      fontWeight="semibold"
      lineHeight="1.25"
      cursor={isInteractive ? "pointer" : "not-allowed"}
      transitionProperty="filter, background-color"
      transitionDuration="faster"
      _disabled={{ opacity: 0.64 }}
      _hover={isInteractive && !isAvailable ? { bg: "gray.50" } : undefined}
      _active={isInteractive ? { filter: "brightness(0.9)", transitionDuration: "0ms" } : undefined}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
      // 入れるポジションは、シフト表と同じくポジションの色と白文字で示す。
      style={isAvailable ? { background: position.color, borderColor: position.color, color: "white" } : undefined}
      onClick={() => {
        if (!isLocked) onToggle();
      }}
    >
      {isAvailable && (
        <Box as="span" flexShrink={0} aria-hidden>
          <LuCheck />
        </Box>
      )}
      <chakra.span minW={0} overflowWrap="anywhere">
        {position.name}
      </chakra.span>
    </chakra.button>
  );
}
