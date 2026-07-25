import { AbsoluteFill, interpolate } from "remotion";
import { riseIn, useLoop, useRange, useSpringIn } from "../../animation";
import { Card } from "../../components/Card";
import { IconCalendar, IconCheck, IconClock, IconTag } from "../../components/Icons";
import { SceneHeader } from "../../components/SceneHeader";
import { Screen } from "../../components/Screen";
import { COLORS } from "../../theme";

const TYPES = [
  { name: "日ごと", body: "出勤できる日を選ぶだけ", target: "短時間シフト向け" },
  { name: "時間指定", body: "働ける時間を入力するだけ", target: "飲食店・小売店向け" },
  { name: "勤務区分", body: "店舗で決めた区分から選ぶ", target: "介護・施設向け" },
] as const;

export const SubmissionTypesScene = () => (
  <Screen>
    <AbsoluteFill style={{ padding: "96px 116px", flexDirection: "column", alignItems: "center" }}>
      <SceneHeader
        eyebrow="お店のやり方に合わせられる"
        eyebrowIcon={<IconTag size={26} />}
        title="希望の集め方は、3つから選べます"
      />

      <div style={{ display: "flex", gap: 44, marginTop: 60 }}>
        {TYPES.map((type, index) => (
          <TypeCard key={type.name} index={index} name={type.name} body={type.body} target={type.target} />
        ))}
      </div>
    </AbsoluteFill>
  </Screen>
);

const TypeCard = ({ index, name, body, target }: { index: number; name: string; body: string; target: string }) => {
  const delay = 18 + index * 22;
  const enter = useSpringIn(delay, 30);

  return (
    <div style={{ ...riseIn(enter, 44) }}>
      <Card active padding={40} style={{ width: 500, height: 566, gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 44, fontWeight: 800, whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 25, fontWeight: 700, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>{body}</div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: COLORS.surface,
            border: `2px solid ${COLORS.line}`,
          }}
        >
          <TypeVisual index={index} delay={delay} />
        </div>

        <div
          style={{
            alignSelf: "flex-start",
            padding: "10px 22px",
            borderRadius: 999,
            backgroundColor: COLORS.tealTint,
            color: COLORS.teal,
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          {target}
        </div>
      </Card>
    </div>
  );
};

const TypeVisual = ({ index, delay }: { index: number; delay: number }) => {
  if (index === 0) return <ByDayVisual delay={delay} />;
  if (index === 1) return <ByTimeVisual delay={delay} />;

  return <ByCategoryVisual delay={delay} />;
};

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
/** 出勤できる日として選ばれる曜日 */
const PICKED_DAYS = [0, 2, 3, 5];

/** 日ごと: 出られる日に丸がつく。 */
const ByDayVisual = ({ delay }: { delay: number }) => {
  const progress = useRange(delay + 16, delay + 76);

  return (
    <div style={{ display: "flex", gap: 12 }}>
      {WEEKDAYS.map((day, dayIndex) => {
        const order = PICKED_DAYS.indexOf(dayIndex);
        const picked =
          order === -1
            ? 0
            : interpolate(progress, [order * 0.22, order * 0.22 + 0.3], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

        return (
          <div key={day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.inkMuted }}>{day}</div>
            <div
              style={{
                width: 44,
                height: 60,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: picked > 0 ? COLORS.teal : COLORS.bg,
                border: `2px solid ${picked > 0 ? COLORS.teal : COLORS.line}`,
                color: COLORS.bg,
                opacity: picked > 0 ? 0.4 + picked * 0.6 : 1,
                transform: `scale(${0.94 + picked * 0.06})`,
              }}
            >
              {picked > 0.4 ? <IconCheck size={24} strokeWidth={3} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TIME_ROWS = [
  { day: "月", label: "9:00 - 14:00", start: 0.08, end: 0.5 },
  { day: "水", label: "17:00 - 22:00", start: 0.42, end: 0.92 },
  { day: "土", label: "10:00 - 18:00", start: 0.16, end: 0.82 },
] as const;

/** 時間指定: 働ける時間帯がバーで伸びる。 */
const ByTimeVisual = ({ delay }: { delay: number }) => {
  const progress = useRange(delay + 16, delay + 80);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 372 }}>
      {TIME_ROWS.map((row, rowIndex) => {
        const grow = interpolate(progress, [rowIndex * 0.2, rowIndex * 0.2 + 0.44], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div key={row.day} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 30, fontSize: 22, fontWeight: 700, color: COLORS.inkMuted }}>{row.day}</div>
            <div style={{ position: "relative", flex: 1, height: 34, borderRadius: 999, backgroundColor: COLORS.bg }}>
              <div
                style={{
                  position: "absolute",
                  left: `${row.start * 100}%`,
                  width: `${(row.end - row.start) * 100 * grow}%`,
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor: COLORS.teal,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: COLORS.bg,
                    whiteSpace: "nowrap",
                    opacity: grow,
                  }}
                >
                  {row.label}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CATEGORIES = [
  { name: "早番", time: "8:00-16:00" },
  { name: "遅番", time: "13:00-22:00" },
  { name: "夜勤", time: "22:00-7:00" },
] as const;

/** 勤務区分: 店舗で決めた区分から選ぶ。 */
const ByCategoryVisual = ({ delay }: { delay: number }) => {
  const progress = useRange(delay + 16, delay + 70);
  const selected = Math.floor(useLoop(120, delay + 40) * 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 340 }}>
      {CATEGORIES.map((category, categoryIndex) => {
        const appear = interpolate(progress, [categoryIndex * 0.22, categoryIndex * 0.22 + 0.36], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const isSelected = selected === categoryIndex;

        return (
          <div
            key={category.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px",
              borderRadius: 18,
              backgroundColor: isSelected ? COLORS.teal : COLORS.bg,
              border: `2px solid ${isSelected ? COLORS.teal : COLORS.line}`,
              color: isSelected ? COLORS.bg : COLORS.inkSoft,
              opacity: appear,
              transform: `translateX(${(1 - appear) * 18}px)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 800 }}>
              {categoryIndex === 2 ? <IconClock size={24} /> : <IconCalendar size={24} />}
              {category.name}
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, opacity: isSelected ? 0.9 : 0.7 }}>{category.time}</div>
          </div>
        );
      })}
    </div>
  );
};
