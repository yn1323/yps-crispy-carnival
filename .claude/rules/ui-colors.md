---
paths:
  - "src/**/*.tsx"
  - "src/configs/theme/**"
---

# UIの配色

設計上の考え方と例外の理由は `doc/rules/ui-design.md` の「配色の強弱」を読む。
このファイルは、`teal.50`〜`teal.400`を使用できる範囲と禁止する用途、状態色の使い分けの正本である。

## 低階調tealの用途

- `teal.50`〜`teal.400`は、ページ、section、card、callout、icon、avatar、badge、選択card、カレンダーの日付範囲、非操作の選択列など、内容を載せる面の背景fillに限って明示的に使用してよい。背景fillであればopacity suffixやgradientも使用してよい。
- 保存、送信、遷移などのaction button、Accordion（店舗詳細のスタッフ一覧トリガーを除く）、DateRail、日付sort、週選択、シフト割当toggleの背景には、通常、hover、active、selectedを含めて`teal.50`〜`teal.400`を使用しない。実装要素がButtonでも、値を選ぶselection cardは背景fillの例外に含める。
- クリック可能なrowのrootとhoverには原則として`teal.50`〜`teal.400`を使用しない。Dashboardのスタッフ一覧と、組織設定・店舗詳細・スタッフ詳細でスタッフや店舗を開くdrilldown list cardは、管理者rowの背景とlist card全体のhover背景に`teal.50`〜`teal.400`を使える。店舗詳細のスタッフ一覧トリガーも、スタッフリストカードと同じ`teal.50`のhover背景を使える。
- border、outline、境界として使うbox-shadow、focus ring、divider、progress connector、通常のshadow、文字とiconのforegroundには、`teal.50`〜`teal.400`を使用しない。
- 操作要素内のicon、avatar、badgeの背景は使用してよい。禁止対象のaccentには`teal.500`以上、弱い操作面と境界にはwhite、gray、blackAlphaまたは既存の中立semantic tokenを使う。
- 低階調tealの面にiconやavatarの低階調teal背景を重ねる場合は、内側を外側より1段以上濃くし、背景へ同化させない。
- 操作面のselected、active、割当済みをtealで強く示す場合は、背景に`teal.500`以上、文字とiconにwhiteを使う。

## 状態色の使い分け

BadgeやStatus indicatorの `colorPalette` は、次の意味で使い分ける。

- `teal`: ブランド、アクティブ、進行中。
- `orange`: 警告、要対応、注意喚起。`yellow` はほぼ未使用なので、警告に選ばない。
- `green`: 達成、成功、充足。
- `gray`: 完了、過去、無効化。
- `red`: 削除、破壊的操作。シフト表では、入力の誤りと、必要人数に足りない時間帯にも使う。
- `blue`: シフト表で、必要人数より多い時間帯。対応を急がない差として、薄い地と点線の枠で示す。

完了を示す色は、次の操作機会が残るなら達成の `green`、残らないなら過去の `gray` を選ぶ。
