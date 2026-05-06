# コンポーネント選定（フレームワーク非依存）

入力・選択・表示・アクション・フィードバックの各カテゴリで、状況 → 部品の判定ツリー。

## 入力（テキスト系）

| 状況 | 部品 | 注意 |
|---|---|---|
| 短文（〜100字） | `Input` | プレースホルダーで例示を入れる |
| 長文（メモ・コメント） | `Textarea` | 高さは可変 or 自動拡張、リサイズ可 |
| パスワード | `Input type=password` + 表示切替 | 表示切替アイコン |
| メール | `Input type=email` | バリデーション必須 |
| 電話 | `Input type=tel` + フォーマット | 国別フォーマットを意識 |
| 数値（カウンタ） | `NumberInput`（+/-付き） | キーボードでも調整可 |
| 数値（自由） | `Input type=number` | 単位を inline suffix |
| 検索 | `Input` + 虫眼鏡アイコン + clear | 入力遅延 debounce 250ms |
| URL | `Input type=url` | プロトコル補完を検討 |
| コードブロック | `Textarea` + 等幅フォント | タブ挙動の制御 |
| マスク入力（電話・郵便） | フォーマッタ付き Input | カーソル位置が崩れない実装に |

### ラベル位置

- **トップラベル**：基本（モバイル含む大半）
- **左ラベル**：横長フォーム、ラベル列を揃えたい時のみ
- **フローティング**：採用しない（情報密度が下がる、訴求弱い）
- **プレースホルダー単独**：禁止（入力中に消える、ラベル省略はアクセシビリティ違反）

### 必須マーク

- 必須が多数 → 任意に「（任意）」を付ける（少数派にラベルする）
- 必須が少数 → 必須に「*」を付ける
- 全部必須なら表記しない

## 選択（単一）

| 状況 | 部品 |
|---|---|
| 2〜3択・全選択肢を見せたい | `SegmentedControl` |
| 2〜5択・排他 | `RadioGroup`（縦） |
| 6〜10択 | `Select`（ネイティブ or カスタム） |
| 11〜30択 | `Combobox`（検索付き） |
| 30+択 | `Combobox` + 仮想スクロール + カテゴリグループ |
| 階層選択 | `Cascader` / `TreeSelect` |
| 国・地域 | `Combobox` + 検索（ISOコード対応） |
| 色 | `ColorPicker` or 限定パレット選択 |

**選択肢の数だけでなく**「全部見せたい？」も判断軸：
- 見せたい（オプションが少なく、視認性が大事）→ Radio / SegmentedControl
- 隠したい（多いor長い）→ Select / Combobox

## 選択（複数）

| 状況 | 部品 |
|---|---|
| 2〜5項目・全部見せたい | `CheckboxGroup` |
| 6〜10項目 | `Combobox multi` or `CheckboxGroup`（折り畳み） |
| タグ的（自由追加可） | `TagInput` |
| 多数から数件 | `Combobox multi` + 選択済みチップ表示 |
| ファセット絞り込み | サイドバーの `CheckboxGroup`（カテゴリごと） |

## ON/OFF・確定

| 状況 | 部品 |
|---|---|
| 設定の即時反映 | `Switch`（ラベルは状態を表す名詞） |
| 同意・規約・選択確定 | `Checkbox` |
| 視覚的トグル群（表示ON/OFF複数） | `ToggleGroup`（pills） |

`Switch` vs `Checkbox` 判断：
- 即座に効く・状態の表現 → Switch
- フォーム送信で確定する・配列要素 → Checkbox

## 数値

| 状況 | 部品 |
|---|---|
| 1〜10程度・段階的 | `Stepper` / `NumberInput` |
| 0〜100%等の範囲 | `Slider`（ハンドル1個） |
| 範囲指定（min-max） | `RangeSlider`（ハンドル2個） |
| 価格・大きい数字 | `Input` + 通貨フォーマッタ |
| 評価（★） | `Rating` |
| プログレス | `Progress`（読み取り専用） |

## 日付・時間

| 状況 | 部品 |
|---|---|
| 単一日付 | `DatePicker` |
| 日付範囲 | `DateRangePicker` + クイックプリセット（今日/今週/今月/先月） |
| 時刻 | `TimePicker`（hh:mm のセレクト or 入力） |
| 日時 | `DateTimePicker` |
| 月単位 | `MonthPicker` |
| 営業時間 | 開始/終了の TimePicker 並び |
| カレンダー全表示・予定選択 | `Calendar` view |

**日付UIは"プリセット必須"**：「今日」「今週」「今月」を1タップで。

## ファイル

| 状況 | 部品 |
|---|---|
| 単一画像 | `FileInput` + プレビュー（差し替えはタップ） |
| 複数ファイル | Drag&Drop ゾーン + プレビュー一覧 + 削除 |
| アバター | 円形プレビュー + クロップUI |
| 大きいファイル | アップロード進捗バー + キャンセル |

## アクション（ボタン）

### ヒエラルキー（1画面に必ず階層をつける）

| 役割 | 見た目 |
|---|---|
| **Primary**（1個） | 塗り・ブランド色、強い影 |
| **Secondary** | 枠線のみ・中立色 |
| **Tertiary / Ghost** | テキストのみ |
| **Destructive** | 赤系（塗り or 枠線） |

「Primaryを2つ」は禁止。両方同等に見えるなら、片方は Secondary に格下げ。

### 部品選択

| 状況 | 部品 |
|---|---|
| メイン操作 | `Button`（ラベル付き） |
| 補助・コンパクト | `IconButton` + Tooltip |
| ナビゲーション | `Link` / Anchor（外部は `target="_blank"` + 視覚記号） |
| 派生アクション複数 | `Menu`（…または下向き矢印付き） |
| 連続的な追加 | `Button` を2個（Primary "保存" / Secondary "保存して続けて入力"） |
| 即時破壊 | 確認なしで `IconButton` + Toast undo（5秒） |
| 不可逆破壊 | `AlertDialog` で結果明示 |
| 主要操作（モバイル） | 下部固定ボタン or `FAB` |

### サイズ

- `xs` (24h)：表内、密集UI
- `sm` (32h)：補助
- `md` (40h)：標準
- `lg` (48h)：強調・ヒーロー
- モバイルのタップ対象：最小 44×44px

### 配置

- フォーム送信：右下（"キャンセル"はその左、Secondary）
- ダイアログ：右下に Primary、左に Secondary
  - ※ プラットフォーム慣習：iOS/Mac は Primary 右、Windows/Android も右が一般的
- モバイル：プライマリーは下部固定 or FAB

## ナビゲーション部品

| 用途 | 部品 |
|---|---|
| アプリ全体ナビ | `TopNav` / `SideNav` / `BottomNav` |
| セクション切替（同レベル） | `Tabs` |
| 階層位置表示 | `Breadcrumb` |
| 多段プロセス | `Stepper`（1〜2〜3〜...） |
| ページ内移動 | `AnchorNav`（追従） |
| ページネーション | `Pagination`（番号） / `LoadMore`（ボタン） / 仮想スクロール（無限） |
| 戻る | `BackButton`（モバイル左上） |

詳細 → `navigation-containers.md`

## インジケータ・装飾

| 用途 | 部品 |
|---|---|
| 状態（小） | `Badge` / `Tag` / `Chip` |
| 件数 | `Badge`（数値・赤丸） |
| 種別 | `Tag`（カラーで意味） |
| 補足ヒント | `Tooltip`（hover、非インタラクティブ） |
| リッチヒント | `Popover` / `HoverCard` |
| 区切り | `Divider`（細・薄） |
| アバター | `Avatar`（画像 or イニシャル fallback） |
| アイコン | line / fill / duo を混在させない |

### Badge vs Tag vs Chip

- **Badge**：通知・件数・小さなラベル（"NEW", "3"）
- **Tag**：カテゴリ・属性（"Drinks", "出勤"）
- **Chip**：選択可能な要素・削除可能（フィルター、入力済み値）

## 進行表示・ローディング

| 用途 | 部品 |
|---|---|
| 既知の進捗 | `Progress` linear（%） |
| 既知のステップ | `Stepper` |
| 不明・短時間 | `Spinner`（最後の手段） |
| 不明・コンテンツがある | `Skeleton`（レイアウト保持） |
| ボタン押下中 | ボタン内 spinner + disable |
| ページ遷移 | TopBar progress（薄い線） |

詳細 → `states.md`

## 比較（迷う組み合わせ）

### Modal vs Drawer vs BottomSheet vs Page

→ `navigation-containers.md`

### Tab vs SegmentedControl vs Radio

- **Tab**：コンテンツ全体が切り替わる（ナビゲーション）
- **SegmentedControl**：表示モード切替（同コンテンツの見方）
- **Radio**：フォームの1選択

### Toast vs Banner vs Inline message

- **Toast**：成功・通知、自動消失（4〜6秒）
- **Banner**：重要、ユーザー操作で消す（メンテナンス情報、警告）
- **Inline**：フィールドエラー、コンテキスト直結

### Select vs Combobox vs Autocomplete

- **Select**：選択肢が固定で短い
- **Combobox**：選択肢が多い、検索したい
- **Autocomplete**：自由入力 + 候補補助（住所等）

## アイコン

- ラベルなしアイコンは初見では意味不明 → 必ずラベル or Tooltip
- 普及アイコン以外は説明必須（虫眼鏡=検索、…=メニュー、×=閉じる、+=追加）
- 線・塗りを混在させない（一貫性）
- サイズ：本文と同じ高さに揃える（16〜20px）
- カラー：意味のある色（赤=削除、緑=完了）以外は親文字色を継承

## ハイレベルなパターン

### Selectが1つだけ画面にあるケース

→ それは「選択肢を絞る」ではなく「視覚的な区切り」かもしれない。Tab か SegmentedControl の方が直感的。

### Combobox の自由入力

→ 候補にない値も許容するか厳密に決める（"freeSolo" モード）。多くの場合、候補のみ受け付けが安全。

### モーダル内の Select

→ Portal 起因の不具合（モーダル背後に出る）多発。プロジェクト規約 `usePortal={false}` を必ず付ける。

### モバイルのSelect

→ ネイティブ select（`<select>`）はOSのピッカーが出る。多くの場合これで十分。
→ カスタムが必要なら BottomSheet 内 list の方が指で選びやすい。
