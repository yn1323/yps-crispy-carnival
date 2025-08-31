#!/bin/bash

# backup配下のファイル・ディレクトリを削除（.gitkeep以外）
echo "backup配下をクリーンアップ中..."
find convex/backup -mindepth 1 ! -name ".gitkeep" -delete

# タイムスタンプ生成
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ZIP_FILE="convex/backup/${TIMESTAMP}.zip"

# Convexエクスポート実行
echo "エクスポート中..."
npx convex export --path "$ZIP_FILE"

# zip展開
echo "zipファイルを展開中..."
unzip -o "$ZIP_FILE" -d "convex/backup/$TIMESTAMP"

echo "完了！"