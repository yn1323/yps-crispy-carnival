# デザイン

## 重要
- 必ずChakra UI V3を利用します

## 基本ルール
- `.pen` ファイルは Pencil MCP 経由でアクセスすること（`Read`や`Grep`では読めない）
- デザイン確認・編集には `batch_get`、`batch_design`、`get_screenshot` 等のPencil MCPツールを使用

## ファイル構成
- `design/` 配下に画面ごとの `.pen` ファイルを配置
- `design/common/system.lib.pen`: デザイントークン（カラー・タイポグラフィ・スペーシング等）、汎用カスタムコンポーネント（ボタン・カード・モーダル等ChakraUIから少しカスタムしたもの）
- デザイン作成時は `common/` 配下のトークン・コンポーネントを参照・活用すること（デフォでpenファイルにimportされています。）

## レイアウトルール
- PC: コンテンツ領域の最大幅 1024px（ヘッダーは全幅、コンテンツは中央配置）
- SP: デザイン基準幅 390px
- `ContentWrapper` コンポーネント（system.lib.pen）を使用すること

## designIndex.md
- `designIndex.md`: .penファイルのフレームIDインデックス
- 参照時はまずここのIDで `batch_get(nodeIds=[...])` を使い、IDが無効な場合は `batch_get(patterns=[{name: "..."}])` でフォールバックする
- デザインフレームを追加・削除した際は `designIndex.md` のIDを更新すること
