# teal低階調token明示利用廃止 実装計画

作成日: 2026-08-06  
完了日: 2026-08-06  
状態: completed  
対象: 追跡対象ソースに明示された`teal.50`〜`teal.400`と、再利用防止のためのAgent指示・UI設計資料

## 1. 結論

UIコードに直接書かれている`teal.50`、`teal.100`、`teal.200`、`teal.300`、`teal.400`を廃止する。  
通常表示だけでなく、hover、active、focus、selectedなどの状態指定と、`teal.50/40`のようなopacity suffix付き指定も対象にする。

置換は一括対応表による機械置換にしない。  
弱い背景、境界、hoverはwhite、gray、blackAlphaまたは既存の中立semantic tokenへ寄せ、ブランドとしてtealを残す箇所は`teal.500`以上を使う。

今回の目的は、追跡対象ソースから対象tokenの明示指定をなくすことである。  
同等色のraw hex、Chakraの`colorPalette="teal"`やrecipeを通じた間接利用、画像内の色まで含めて薄いtealを完全に排除する計画ではない。

VRTの実行、画像差分の確認、baseline更新はAI Agent側では行わない。  
利用者が別途VRTを確認するため、その結果をこの計画のAI側完了条件には含めない。

## 2. 確定した判断

| 論点 | 判断 |
|---|---|
| 対象shade | `teal.50`〜`teal.400` |
| 対象となる書き方 | dot表記、hyphen表記、opacity suffix付きの明示指定 |
| UI状態 | 通常、hover、active、focus、selected、checked、expanded、disabledを含む |
| Story | ソース内の明示指定は置換対象。VRTの実行と差分確認だけを対象外にする |
| semantic token定義 | `src/configs/theme/semantic-tokens/colors.ts`に直接書かれた対象tokenは置換対象 |
| primitive palette定義 | `src/configs/theme/tokens/colors.ts`の色階調定義は維持する |
| raw hex、RGB、RGBA | 今回は対象外 |
| `colorPalette="teal"`とrecipe | 明示された低階調tokenがない利用箇所は対象外 |
| AI AgentによるVRT | 実行、閲覧、比較、baseline更新を行わない |

semantic token定義は、`{colors.teal.100}`のように対象tokenを直接参照しているため対象に含める。  
その変更を既存の`colorPalette="teal"`利用箇所が継承することはあるが、間接影響だけを理由に各consumerを列挙または変更しない。

## 3. 現状調査

2026-08-06時点で、次の検索に123件、118行、58ファイルが一致する。

```bash
rg -n -i '\bteal[.-](50|100|200|300|400)\b' \
  src apps .storybook e2e
```

shade別の明示指定件数は次のとおりである。

| token | 件数 |
|---|---:|
| `teal.50` | 75 |
| `teal.100` | 21 |
| `teal.200` | 11 |
| `teal.300` | 9 |
| `teal.400` | 7 |
| 合計 | 123 |

配置別の内訳は次のとおりである。  
Storyは所在ディレクトリではなく、独立した区分として数えている。

| 区分 | 件数 | ファイル数 |
|---|---:|---:|
| `src/components/features/` | 98 | 47 |
| `src/components/shared/` | 8 | 4 |
| `src/components/ui/` | 6 | 3 |
| `*.stories.tsx` | 5 | 3 |
| `src/configs/theme/semantic-tokens/` | 6 | 1 |
| 合計 | 123 | 58 |

`apps/`、`.storybook/`設定、`e2e/`には現在一致がない。  
一方、Storyは実装と同じtokenを直接書いているため、VRTを実行しない場合もソース修正の対象に残す。

影響が集中しているのは次の領域である。

- Dashboardのonboarding、hero、staff roster、setup UI
- Shift FormのPC/SP、日付rail、日付別・シフト種別表示
- Article、FAQ、HowTo、Landing Pageなどの公開画面
- Organization、User、Staffの設定・登録・同意導線
- `Empty`、`StepperDialog`、`DrilldownRow`などの共通UI
- themeのteal semantic paletteと関連Story

## 4. 変更範囲

### 4.1 対象

- `src/`内の`teal.50`〜`teal.400`の明示指定
- `_hover`、`_active`、`_focusVisible`、選択状態などに直接書かれた対象token
- `teal.50/40`、`teal.50/60`のようなopacity suffix付き指定
- `src/configs/theme/semantic-tokens/colors.ts`内の明示参照6件
- Storyソース内の明示指定5件
- ルート`AGENTS.md`への恒久制約の追加
- 配色判断を所有する`doc/rules/ui-design.md`の補足
- 新規実装時の案内と衝突する`.agents/skills/ui-architect/references/chakra-v3.md`の修正
- `doc/plans/INDEX.md`の状態管理

### 4.2 対象外

- `#ccfbf1`、`#99f6e4`、`#5eead4`、`#2dd4bf`などのraw hex
- RGB、RGBA、CSS変数、画像、gradientに含まれる近似色の探索と置換
- 対象tokenを直接書いていない`colorPalette="teal"`、Chakra recipe、semantic token consumerの変更
- `src/configs/theme/tokens/colors.ts`のprimitive palette定義
- `teal.500`以上と、teal以外の色palette
- `node_modules/`、`dist/`、`storybook-static/`、`vrt-actual/`などの依存物・生成物
- VRTの実行、screenshot capture、画像差分判定、baseline更新
- E2E、Convex、schema、API、業務ロジック、機能文書の変更
- 対象色と無関係な共通化、wrapper追加、theme再設計

## 5. 置換契約

### 5.1 基本原則

同じshadeでも、背景、境界、文字、active indicatorでは役割が異なる。  
token名だけで一括置換せず、各指定が伝えている状態を確認して次の基準で置き換える。

| 現在の役割 | 置換候補 | 維持する意味 |
|---|---|---|
| 薄い通常背景 | `white`、`gray.50`、`bg.subtle` | 主操作より弱い面 |
| 補助背景、アイコン背景 | `gray.100`、`bg.muted` | 情報のまとまり |
| 通常border、区切り線 | `border.default`、`gray.200` | 構造上の境界 |
| hover背景 | `gray.50`または`gray.100` | 操作可能性を中立階調差で示す |
| hover border | `border.emphasized`、`gray.300` | hoverを背景色だけに依存せず示す |
| selected、current | 中立背景 + `teal.600`または`teal.700`のborder・文字 | 選択状態をpastel面ではなくaccentで示す |
| focus、active indicator | `teal.600`または`teal.700` | 操作位置を明確に示す |
| 装飾数字、淡い線 | `gray.200`、`fg.muted`、`border.default` | 装飾を内容より弱くする |
| teal背景上の区切り | `whiteAlpha`系 | 同系色の低階調を使わず区切る |

既存の`teal.500`以上のaccentが同じcomponent内にある場合は、それを無条件に増やさない。  
背景と境界を中立化したうえで、状態識別に必要なaccentだけを残す。

### 5.2 teal semantic palette

`src/configs/theme/semantic-tokens/colors.ts`では、現在の意味を保ちながら明示参照を次の方向へ変更する。

| semantic token | 現在の対象参照 | 変更方針 |
|---|---|---|
| `teal.fg._dark` | `teal.300` | `teal.500`以上 |
| `teal.subtle._light` | `teal.100` | 中立の弱い背景token |
| `teal.muted._light` | `teal.200` | 中立の補助背景token |
| `teal.emphasized._light` | `teal.300` | 中立の強調背景・境界token |
| `teal.focusRing._light` | `teal.400` | `teal.600`以上 |
| `teal.focusRing._dark` | `teal.400` | `teal.500`以上 |

`contrast`、`solid`、すでに`teal.500`以上を参照する値は、今回の対象に含めない。  
semantic paletteの変更後も、個々の`colorPalette="teal"` consumerを間接利用だけで変更しない。

### 5.3 代表領域

- Dashboardのcallout、hero、staff状態面は、面とborderをneutralへ寄せ、必要なアイコンや文字だけteal accentを維持する。
- Shift Formの日付選択、hover、割当状態は、PC/SPで同じ状態意味になるようneutral面と`teal.500`以上のindicatorへ揃える。
- 公開画面の大きな装飾面や番号はgrayへ寄せ、リンクや引用のaccentだけ必要に応じて濃いtealへ変更する。
- 共通UIとStoryは、feature側の置換より先に修正し、同じ低階調tokenを再利用しない状態にする。

## 6. Agent指示と設計資料

### 6.1 ルートAGENTS.md

repo全体へ適用する恒久制約として、ルート`AGENTS.md`へ次の内容を一度だけ追加する。

> UIコードでは、通常時、hover、active、focus、selectedを含む全状態で、`teal.50`〜`teal.400`を明示的に指定しない。tealの強調には`teal.500`以上、弱い面・境界にはwhite、gray、blackAlphaまたは既存の中立semantic tokenを使う。

`src/AGENTS.md`や下位`AGENTS.md`へ同じ文を複製しない。  
raw hexや`colorPalette="teal"`の間接利用まで禁止する文言も追加しない。

### 6.2 UI設計方針

`doc/rules/ui-design.md`は、正確な禁止token一覧ではなく、pastelなブランド面を広げず、弱い面・hover・境界をneutral、ブランドaccentを濃いtealで表す判断理由を所有する。  
禁止範囲の正本はルート`AGENTS.md`であることを参照し、同じ禁止文を複製しない。

### 6.3 ui-architect参照

`.agents/skills/ui-architect/references/chakra-v3.md`の一般的なshade案内は、tealの低階調を背景やselectedへ再導入しない内容へ改める。  
Chakraの`colorPalette="teal"`自体を禁止せず、明示tokenを選ぶ場合のproject固有制約として案内する。

新しいlint rule、registry、token wrapperは追加しない。  
今回の再発防止は、既存のAgent指示、UI設計方針、ui-architect参照、実装後の静的検索で行う。

## 7. 実装順序

### Phase 1: 対象一覧の固定

1. 実装開始時に正規表現検索を再実行する。
2. 一致箇所を背景、border、hover、selected、focus、装飾、Story、themeに分類する。
3. raw hexと間接`colorPalette`を一覧へ混ぜない。

### Phase 2: themeと共通UI

1. teal semantic palette内の明示参照6件を置き換える。
2. `src/components/ui/`と`src/components/shared/`を役割別に置き換える。
3. Story内の明示指定をneutral tokenへ置き換える。
4. primitive paletteと対象外のrecipeを変更していないことを確認する。

### Phase 3: feature UI

1. DashboardとStaff関連を修正する。
2. Shift FormのPC/SPを同じ状態単位で修正する。
3. Organization、User、Staffの設定・登録・同意導線を修正する。
4. Article、FAQ、HowTo、Landing Pageなどの公開画面を修正する。
5. 同一componentの通常状態とhover・selected・focusをまとめて自己レビューする。

### Phase 4: 恒久ルール

1. ルート`AGENTS.md`へ明示指定の禁止を追加する。
2. `doc/rules/ui-design.md`へneutral面と濃いbrand accentの判断基準を追加する。
3. `ui-architect`のChakra参照から衝突するshade案内を除く。
4. 同じ禁止文が下位指示へ重複していないことを確認する。

### Phase 5: 静的検証と通常検証

1. 対象tokenの明示指定が0件であることを確認する。
2. 変更差分を自己レビューし、状態意味とPC/SPの対応を確認する。
3. docs、lint、type、UI test、buildを実行する。
4. AI AgentはVRTを起動、閲覧、更新しない。

## 8. 検証

### 8.1 明示指定の0件確認

次のコマンドが出力なし、終了code 1になることを完了条件とする。

```bash
rg -n -i '\bteal[.-](50|100|200|300|400)\b' \
  src apps .storybook e2e
```

この検索にはStoryとsemantic token定義を含める。  
`AGENTS.md`、UI規約、Skill参照、plan文書には禁止範囲を説明するため対象token名が残るので、repo全体の0件は完了条件にしない。

### 8.2 自動検証

```bash
pnpm docs:check
pnpm lint
pnpm type-check
pnpm test:ui --run
pnpm build
```

色だけの変更で新しい業務契約は生じないため、Convex testとE2Eは追加しない。  
既存testが色tokenの文字列を直接期待している場合だけ、同じ変更範囲で期待値を更新する。

### 8.3 VRTの責任分担

AI Agentは次を行わない。

- Storybook VRTの実行
- screenshotの取得・閲覧
- 画像差分の合否判断
- baseline画像の更新

利用者が行うVRT確認は、AI Agentによる実装と静的・通常検証の完了後に別途実施する。  
VRT結果をAI Agent側の`completed`判定条件にはしない。

## 9. 完了条件

- `src`、`apps`、`.storybook`、`e2e`で対象tokenの明示指定が0件である。
- semantic token定義とStoryの明示指定も0件である。
- raw hex、間接`colorPalette`、primitive paletteを今回の目的で変更していない。
- 背景、hover、selected、focusなどの状態意味を保ち、tealを残す箇所は`teal.500`以上である。
- ルート`AGENTS.md`に恒久制約があり、下位指示へ重複していない。
- `ui-design.md`と`ui-architect`参照が新しい選択方針と矛盾しない。
- docs、lint、type-check、UI test、buildが成功する。
- AI AgentがVRTを実行、閲覧、更新していない。

実装と検証を完了したため、この文書を`completed`とし、`doc/plans/INDEX.md`の項目を2026年8月の`History`へ移した。

## 10. 実施結果

追跡対象ソースにあった123件、118行、58ファイルの明示指定を置き換え、完了条件の検索を0件にした。  
semantic token定義とStoryを含め、`teal.50`〜`teal.400`のdot・hyphen表記とopacity suffix付き指定は残っていない。

弱い背景、border、hover、装飾はgray、blackAlpha、whiteAlphaまたは中立semantic tokenへ変更した。  
selected、current、focus、activeなどtealの識別が必要な箇所は、中立背景と`teal.500`以上のborder、文字、indicatorへ変更した。

ルート`AGENTS.md`へ恒久制約を追加し、`doc/rules/ui-design.md`へ配色の判断基準を、`ui-architect`のChakra参照へ実装時の選択基準を反映した。  
raw hex、間接的な`colorPalette="teal"` consumer、primitive palette、業務ロジックは変更していない。

実施した検証は次のとおりである。

| 検証 | 結果 |
|---|---|
| 対象tokenの静的検索 | 0件、`rg`終了code 1 |
| `ui-architect` Skill検証 | `Skill is valid!` |
| `pnpm docs:check` | 成功、128 Markdown files |
| `pnpm lint` | 成功、1,485 files、warningなし |
| `pnpm type-check` | 成功 |
| `pnpm test:ui --run` | 成功、129 files、700 tests |
| `pnpm build` | 成功、35 pagesをprerenderし、33 SSG pagesと静的配布設定を検証 |
| `git diff --check` | 成功 |

sandbox内では`tsx`のIPCとpreview serverのlistenが`EPERM`になったため、同じ検証を制限外で再実行して成功を確認した。  
指示どおり、VRT、screenshot、画像差分確認、baseline更新は実施していない。

## 11. 参考にしたファイル

- `AGENTS.md`
- `src/AGENTS.md`
- `doc/rules/agent-instructions.md`
- `doc/rules/ui-design.md`
- `doc/rules/frontend-architecture.md`
- `doc/plans/INDEX.md`
- `.agents/skills/ui-architect/SKILL.md`
- `.agents/skills/ui-architect/references/chakra-v3.md`
- `.agents/skills/shiftori-coding/SKILL.md`
- `src/configs/theme/semantic-tokens/colors.ts`
- `src/configs/theme/tokens/colors.ts`
- `src/components/ui/DrilldownRow/index.tsx`
- `src/components/ui/Empty/index.tsx`
- `src/components/ui/StepperDialog/index.tsx`
- `src/components/shared/ShopSettingsFields/SubmissionPatternField.tsx`
- `src/components/features/Dashboard/DashboardOnboarding/OnboardingCallout/index.tsx`
- `src/components/features/Dashboard/HeroSummary/ActionTaskList.tsx`
- `src/components/features/Shift/ShiftForm/pc/DateOnlyView/DateOnlyTable.tsx`
- `src/components/features/Shift/ShiftForm/sp/DateOnlyDailyView/index.tsx`
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.tsx`
- `src/components/features/FaqSite/index.tsx`
- `src/components/features/HowToSite/index.tsx`
- `src/components/features/LandingPage/FaqArticlesSection/index.tsx`
- `package.json`
