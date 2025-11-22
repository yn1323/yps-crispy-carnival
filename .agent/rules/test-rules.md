---
trigger: model_decision
description: test strategy
---

## 🧪 テスト戦略

### 実行方針
- **E2Eテスト**: 毎PR、ハッピーパスのみ、Chrome only
- **単体テスト**: 日本語命名、比重5:1（ハッピー:エッジ）
- **Storybook**: 全コンポーネント必須、代表パターンのみ

綿密にカバレッジ100%を目指すというよりは、デグレ防止の意味合いが強い

### テスト実装例
```tsx
// ✅ 日本語命名必須
describe('useDraftRoom', () => {
  test('ドラフトルームデータを正常に取得できる', () => {
    const { result } = renderHook(() => useDraftRoom('draft123'));
    expect(result.current.draft).toBeDefined();
  });
});