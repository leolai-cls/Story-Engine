/**
 * 敘事輸出消毒 — defense-in-depth · 純函數 · server + client 共用 (single source)。
 *
 * 2026-06-01 bug (founder 報 · grok-4-1 成人 playthrough): Grok 4.1 預設會 reasoning ·
 * 經 CrazyRouter 冇被壓制 · 將「思考過程」marker 漏咗入敘事文字 · 例如:
 *     > 🔍 **Thinking about your request**
 *     > 🔍 **Responding to your attempt to focus**
 * 仲會夾硬插入中文句子中間 (連「新傢俬…味」都拆開)。
 *
 * 治本 = provider 層壓制 Grok reasoning (待驗證 xAI/CrazyRouter 參數 · 唔靠估)。
 * 呢個 strip = 安全網 · 確保 reasoning 垃圾**永不**污染 turns / 記憶 / RAG ·
 * 喺 (a) turn route onFinish 存 turns 之前 + (b) play-client 顯示時 都行一次。
 *
 * False-positive 風險低:`> 🔍 **...**` (blockquote + 放大鏡 + bold) 喺正常繁中
 * RPG 敘事唔會出現。
 */
export function stripReasoningMarkers(text: string): string {
  if (!text) return text;
  return (
    text
      // "> 🔍 **...**" reasoning marker (可整行 · 可夾喺句中) → 移除個 token。
      .replace(/>?[ \t]*🔍[ \t]*\*\*[^*\n]*\*\*/g, "")
      // 兜底:整行淨係 "> 🔍 ..." (無 bold 嘅變體)
      .replace(/^[ \t]*>[ \t]*🔍[^\n]*$/gm, "")
      // 清走因移除 marker 而剩低嘅空 blockquote 行
      .replace(/^[ \t]*>[ \t]*$/gm, "")
      // 收拾多餘空行
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
