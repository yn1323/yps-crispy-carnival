# teal低階調token用途制限 実装計画

作成日: 2026-08-06
改訂日: 2026-08-06
状態: completed
対象: `teal.50`〜`teal.400`を使用できる背景fillと、使用を禁止する操作・境界・前景の役割

## 1. 結論

`teal.50`〜`teal.400`の明示利用を全面禁止せず、内容を載せる背景fillに限って使用を認める。ページ、section、card、callout、icon、avatar、badge、selection card、カレンダーの日付範囲、非操作の選択列が対象である。Dashboardのスタッフ一覧は、管理者rowの背景とスタッフrowのhoverを限定例外とする。

保存、送信、遷移などのaction button、Accordion、DateRail、日付sort、週選択、シフト割当toggleの操作面には使用しない。クリック可能なrowも上記の限定例外を除いて使用しない。border、outline、focus ring、divider、progress connector、shadow、文字・iconのforegroundにも使用しない。

実装要素の種類ではなく、UI上の役割で判定する。Buttonで実装されたselection cardは背景fillとして許可し、操作要素内のicon、avatar、badgeも内側の背景fillとして許可する。低階調tealの面へiconやavatarを重ねる場合は、内側の背景を1段以上濃くする。

操作面のselected、active、割当済みをtealで強く示す場合は、`teal.500`以上の背景とwhiteの文字を使う。Dashboardの募集一覧は状態にかかわらずcard rootをwhiteに保ち、状態色はaccent、badge、必要なborderへ限定する。

VRTの実行、画像差分の確認、baseline更新はAI Agent側では行わない。利用者が別途確認するため、VRTをAI側の完了条件に含めない。

## 2. 確定した判断

| 論点 | 判断 |
|---|---|
| 対象shade | `teal.50`〜`teal.400` |
| 許可する用途 | ページ、section、card、callout、icon、avatar、badge、selection card、カレンダーの日付範囲、非操作の選択列などの背景fill。Dashboardスタッフ一覧の限定例外 |
| opacityとgradient | 背景fillとして使う場合は許可 |
| selection card | Buttonで実装されていても、値を選ぶ面として許可 |
| 操作要素内の小さな面 | icon、avatar、badgeの背景は許可 |
| action button | 通常、hover、active、selectedを含めて背景への利用を禁止 |
| クリック可能なrow | 原則禁止。Dashboardスタッフ一覧の管理者row背景とスタッフrow hoverだけ許可 |
| 日付操作 | CalendarPickerの日付範囲と非操作の選択列は許可。DateRail、sort、週選択、割当toggleへの低階調tealは禁止し、強調時は`teal.500`以上を使う |
| selected、active、割当済み | tealで強く示す場合は`teal.500`以上の背景とwhiteの文字・iconを使う |
| 入れ子の背景 | 低階調tealの面に置くicon、avatarは外側より1段以上濃くする |
| Dashboard募集一覧 | 状態にかかわらずcard rootはwhite。状態はaccent、badge、必要なborderで示す |
| 境界とfocus | border、outline、境界として使うbox-shadow、focus ringへの利用を禁止 |
| 線とshadow | divider、progress connector、通常のshadowへの利用を禁止 |
| 前景 | 文字とicon本体への利用を禁止 |
| generic semantic token | `teal.subtle`、`teal.muted`、`teal.emphasized`は中立色のまま維持 |
| tealの前景とfocus token | `teal.fg`は`teal.500`、`teal.focusRing`は`teal.600`を維持 |
| VRT | AI Agentは実行、閲覧、比較、baseline更新を行わない |

## 3. 影響調査

### 3.1 初期状態

2026-08-06の初期調査では、追跡対象ソースに`teal.50`〜`teal.400`の明示指定が123件、118行、58ファイルあった。

```bash
rg -n -i '\bteal[.-](50|100|200|300|400)\b' \
  src apps .storybook e2e
```

初回実装では123件を0件にしたが、その後の方針変更により背景fillを許可することになった。本計画は、その最終判断へ実装と文書を合わせる改訂版である。

### 3.2 役割別の影響

初期指定を役割で分類すると、背景fillとして復元できる箇所はページ、card、callout、icon、avatar、日付範囲などに集中していた。一方、操作面、border、focus、foreground、dividerには禁止を維持すべき指定が含まれていた。

genericなteal semantic tokenはBadgeだけでなくButton、border、outline相当のshadow、選択controlにも共有されている。`teal.subtle`などを低階調tealへ戻すと禁止対象にも波及するため、背景専用tokenとしては扱わない。

Chakraのteal Badgeは、`teal.subtle`を中立色のまま維持したうえで、背景を許可する11箇所へ`teal.100`を明示する。動的paletteはtealになる条件だけ背景を切り替える。

### 3.3 実装後に残す明示指定

背景fillとDashboardスタッフ一覧の限定例外を反映した後は、追跡対象ソースに低階調tealが74件、43ファイル残る。Story内の背景名と背景指定を含み、すべて許可された背景fill、その条件値、または限定例外である。

残存件数を0件にすることは完了条件にしない。全件を列挙し、禁止した役割へ使われていないことを確認する。

## 4. 変更範囲

### 4.1 UI

- 公開画面のページ、card、callout、hero label、icon背景
- Dashboardのonboarding、banner、icon、avatar、badge、selection card、状態panel、スタッフ一覧の限定例外
- Dashboard募集一覧の全状態でwhiteのcard root
- Organization、User、Staffのcard、avatar、badge、案内panel
- CalendarPickerの日付範囲とShift Formの非操作の選択列
- ShiftBoardのPC/SPにある選択日と勤務あり表示
- ShiftBoardのSP時間入力一覧にある日付見出し
- Staff提出画面のselection card、状態badge、集計pill
- `Empty`、`StepperDialog`、Story canvasなどの背景fill

### 4.2 文書

- ルート`AGENTS.md`の恒久制約
- `doc/rules/ui-design.md`の配色判断
- `.agents/skills/ui-architect/references/chakra-v3.md`の実装案内
- 本計画と`doc/plans/INDEX.md`

### 4.3 対象外

- primitive palette定義
- raw hex、RGB、RGBA、画像内の近似色
- teal以外のpalette
- 新しいlint rule、registry、token wrapper、theme再設計
- E2E、Convex、schema、API、業務ロジック
- VRT、screenshot、baseline

## 5. 実装方針

### 5.1 許可する背景fill

| 役割 | 実装方針 |
|---|---|
| ページ、section | 大きな面を重ねすぎず、一段の情報グループとして低階調tealを使う |
| card、callout、状態panel | borderは中立または`teal.500`以上のまま、面だけ低階調tealへ戻す |
| icon、avatar | icon本体や文字は`teal.500`以上、背景だけ低階調tealへ戻す |
| badge | generic semantic tokenを戻さず、teal Badge consumerへ背景を明示する |
| selection card | rootとselected hoverの面は許可し、borderとfocusは高階調tealまたは中立色にする |
| カレンダー | 日付範囲、選択可能日、非操作の選択列だけ面として許可する |
| opacity、gradient | 背景fillの役割を保つ場合だけ許可する |
| Dashboardスタッフ一覧 | 管理者rowの背景とスタッフrow hoverだけを限定例外とし、非管理者avatarはhover面より1段濃くする |

### 5.2 禁止を維持する役割

- action Button、IconButtonの背景とhover
- クリック可能なlist row、Accordion、FAQ、HowTo、Drilldownの背景とhover。ただしDashboardスタッフ一覧の限定例外を除く
- DateRail、日付sort、週選択、シフト割当toggleの背景とhover
- border、outline、境界として使うbox-shadow
- focus ring、divider、progress connector、shadow
- 文字とiconのforeground

これらにはwhite、gray、blackAlpha、中立semantic token、または`teal.500`以上を使う。

### 5.3 theme

`src/configs/theme/semantic-tokens/colors.ts`の次の状態を維持する。

- `teal.subtle._light`: `gray.100`
- `teal.muted._light`: `gray.200`
- `teal.emphasized._light`: `gray.300`
- `teal.fg._dark`: `teal.500`
- `teal.focusRing`: `teal.600`

背景専用の共通tokenは追加しない。繰り返しが局所的であり、consumerごとの明示指定の方が許可用途を監査しやすいためである。

## 6. 実装順序

1. 初期差分を背景fill、操作面、境界、focus、foreground、shadowへ分類する。
2. generic semantic tokenを中立色のまま維持し、許可した背景fillをconsumer単位で復元する。
3. teal Badgeを全件監査し、tealになる11箇所だけ背景を明示する。
4. action control、clickable row、DateRail、toggle、border、focus、divider、foregroundを中立色または高階調tealのまま維持する。Dashboardスタッフ一覧だけ限定例外を適用する。
5. Agent指示、UI設計方針、ui-architect参照、本計画を最終判断へ更新する。
6. 低階調tealの全一致を役割監査し、通常の自動検証を行う。

## 7. 検証

### 7.1 役割監査

次の検索結果を0件にするのではなく、全件が許可された背景fillであることを確認する。

```bash
rg -n -i '\bteal[.-](50|100|200|300|400)\b' \
  src apps .storybook e2e
```

特に次を確認する。

- `border*`、`outline*`、`shadow*`、`focus*`、文字やiconの`color`に一致がない。
- action button、Accordion、DateRail、日付sort、週選択、割当toggleのrootとhoverに一致がない。clickable rowはDashboardスタッフ一覧の限定例外だけである。
- selection cardのroot、カレンダーの日付範囲、icon、avatar、badgeは許可された背景fillとして区別されている。
- `teal.subtle`、`teal.muted`、`teal.emphasized`が中立色を参照している。

### 7.2 自動検証

```bash
pnpm docs:check
pnpm lint
pnpm type-check
pnpm test:ui --run
pnpm build
```

色の役割だけを変更し、新しい業務契約は生じないため、Convex testとE2Eは追加しない。視覚契約は既存Storyを主担当とし、VRTの確認は利用者へ引き渡す。

### 7.3 VRTの責任分担

AI Agentは次を行わない。

- Storybook VRTの実行
- screenshotの取得、閲覧、比較
- baseline画像の更新

## 8. 完了条件

- 低階調tealの明示指定が許可された背景fillとDashboardスタッフ一覧の限定例外だけに残っている。
- action button、DateRail、toggle、border、focus、divider、shadow、foregroundに低階調tealがない。clickable rowはDashboardスタッフ一覧の限定例外だけである。
- Dashboard募集一覧のcard rootが全状態でwhiteである。
- ShiftBoardの選択日と勤務あり表示がPC/SPで`teal.500`以上の背景とwhiteの文字に揃っている。
- generic semantic tokenが中立色のままである。
- ルート`AGENTS.md`、UI設計方針、ui-architect参照が同じ役割境界を示している。
- docs、lint、type-check、UI test、buildが成功する。
- AI AgentがVRTを実行、閲覧、更新していない。

## 9. 実施結果

初期の123指定を全面的に中立化した実装を見直し、許可した背景fillをconsumer単位で復元した。最終的に低階調tealは71指定、43ファイルに残り、全件がページ、card、callout、icon、avatar、badge、selection card、カレンダーの日付範囲、非操作の選択列、Story canvasの背景である。

tealになるChakra Badgeを全件追跡し、`subtle` variantの11箇所へ`teal.100`の背景を明示した。genericな`teal.subtle`、`teal.muted`、`teal.emphasized`は中立色のまま維持している。

border、outline、shadow、focus、前景色を対象にした静的検索は0件だった。低階調tealを含むhoverはselection cardの3件だけであり、action button、clickable row、Accordion、DateRail、日付sort、週選択、シフト割当toggleには残っていない。

実施した検証は次のとおりである。

| 検証 | 結果 |
|---|---|
| 低階調tealの全件監査 | 71指定、43ファイル。許可した背景fillだけ |
| 禁止propの静的検索 | border、outline、shadow、focus、foregroundは0件 |
| hoverの静的検索 | 3件。すべて承認済みselection card |
| teal Badge監査 | 11件へ明示背景を設定。動的paletteも全件追跡 |
| `ui-architect` Skill検証 | `Skill is valid!` |
| `pnpm docs:check` | 成功、128 Markdown files |
| `pnpm lint` | 成功、1,485 files、warningなし |
| `pnpm type-check` | 成功 |
| `pnpm test:ui --run` | 成功、129 files、700 tests |
| `pnpm build` | 成功、35 pagesをprerenderし、33 SSG pagesと静的配布設定を検証 |
| `git diff --check` | 成功 |

sandbox内では`tsx`のIPCとpreview serverのlistenが`EPERM`になったため、該当する検証を制限外で再実行して成功を確認した。指示どおり、VRT、screenshot、画像差分確認、baseline更新は実施していない。

## 10. 参考にしたファイル

- `AGENTS.md`
- `src/AGENTS.md`
- `doc/rules/agent-instructions.md`
- `doc/rules/ui-design.md`
- `doc/rules/frontend-architecture.md`
- `doc/rules/testing-strategy.md`
- `doc/plans/INDEX.md`
- `.agents/skills/ui-architect/SKILL.md`
- `.agents/skills/ui-architect/references/chakra-v3.md`
- `.agents/skills/shiftori-coding/SKILL.md`
- `.agents/skills/test-strategy/SKILL.md`
- `.agents/skills/test-strategy/references/test-writing-rules.md`
- `.agents/skills/japanese-tech-writing/SKILL.md`
- `src/configs/theme/semantic-tokens/colors.ts`
- `src/configs/theme/recipes/badge.ts`
- `src/components/ui/Button/index.stories.tsx`
- `src/components/ui/Empty/index.tsx`
- `src/components/ui/StepperDialog/index.tsx`
- `src/components/shared/OrganizationPersonRow/index.tsx`
- `src/components/shared/ShopSettingsFields/SubmissionPatternField.tsx`
- `src/components/features/CreateRecruitmentForm/CalendarPicker.tsx`
- `src/components/features/Dashboard/DashboardOnboarding/OnboardingCallout/index.tsx`
- `src/components/features/Dashboard/HeroSummary/ActionTaskList.tsx`
- `src/components/features/Dashboard/SetupModal/SetupStep1/index.tsx`
- `src/components/features/Dashboard/StaffManagement/OrganizationPeopleCandidateList.tsx`
- `src/components/features/Dashboard/StaffRoster/StaffRow.tsx`
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.tsx`
- `src/components/features/Shift/ShiftForm/pc/DateOnlyView/DateOnlyTable.tsx`
- `src/components/features/Shift/ShiftForm/sp/DateOnlyDailyView/index.tsx`
- `src/components/features/StaffSubmit/DateOnlySubmissionDayCard/index.tsx`
