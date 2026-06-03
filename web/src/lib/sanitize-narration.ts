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
      // 2026-06-03 bug (founder · light-core): prose-only Narrator (而家 Claude · 好
      // 聽 tool 指示) 偶然會將 tool call 當文字嘔出嚟,例如:
      //     {"name":"update_state","input":{"ops":[{"op":"set",...}]}}
      // 治本喺 narratorRulesFor (拎走「用 update_state tool」嘅舊指示);呢個係安全網,
      // 確保 tool JSON 永不污染玩家畫面 / turns / 記憶。tool JSON 通常 append 喺 prose
      // 之後 → 由第一個 tool-name marker 砍到尾。
      .replace(
        /\{\s*"name"\s*:\s*"(?:update_state|update_character_disposition|set_permanent_flag)"[\s\S]*$/,
        "",
      )
      // 兜底:模型淨係嘔一個 ops object
      .replace(/\{\s*"ops"\s*:\s*\[[\s\S]*?\]\s*\}/g, "")
      // 2026-06-03 (audit · light-core): 捉漏出嚟嘅 INTERNAL prompt block —— 記憶 /
      // 狀態 / NPC streams 嘅 marker + warning + section header,<player_action> 標籤,
      // 同 NPC 私密 POV label。呢啲字面 marker 喺真實故事敘事永不出現,整行 strip 安全。
      .replace(/^.*(?:\[INTERNAL CONTEXT|⚠️\s*INTERNAL|DO NOT QUOTE|NEVER quote).*$/gim, "")
      .replace(
        /^#{1,4}\s*(?:Long-Term Memory|NPC Inner Streams|Current Game State|World State|State Schema|世界狀態維度|世界状态维度).*$/gim,
        "",
      )
      .replace(/<\/?player_action>/gi, "")
      .replace(/\*\*(?:inner_thought|intent)\*\*[^\n]*/gi, "")
      // 2026-06-03 (audit): Story Bible 嘅 Act 結構 pacing cue —— bible.ts 將每幕嘅
      // transition_condition 包成 "(internal cue · advance once: …)" 餵 Narrator 知幾時
      // 推進。萬一 Narrator 照抄,整段引擎式 cue (連舊 "(transitions when: …)" 寫法) 都
      // strip 走。呢啲括號 cue 喺真實故事敘事唔會出現。
      .replace(/\((?:internal cue[^)]*|transitions?\s+when:[^)]*)\)/gi, "")
      // 清走因移除 marker 而剩低嘅空 blockquote 行
      .replace(/^[ \t]*>[ \t]*$/gm, "")
      // 收拾多餘空行
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
