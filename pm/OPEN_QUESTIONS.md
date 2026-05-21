# OPEN QUESTIONS — Story Engine

> 知道要 decide，但未 decide 嘅嘢。
> 每個 question 有：context（業務語言）/ options / impact / urgency。
> Decide 咗 → 轉去 DECISIONS.md（一條 ADR）+ 喺度刪走。

---

## ✅ 最近已 decide 或 defer（已轉去 DECISIONS.md / BACKLOG.md）

- ~~Q1: USD vs HKD~~ → ADR-009: USD primary
- ~~Q2: HK first vs HK+TW 同步~~ → ADR-010: HK+TW 同步
- ~~Q3: 違規過濾~~ → ADR-013: OpenAI Moderation 免費 at launch
- ~~Q4: AI 記性引擎~~ → ADR-014: OpenAI Embeddings + Phase 2 benchmark
- ~~Q5: 官方故事邊個寫~~ → ADR-011: founder + Claude
- ~~Q7: 外面作者版權安排~~ → Deferred to BACKLOG.md v1.5+ section（將來嘅嘢將來再算）
- ~~Q8: Lorebook 同名 dedup~~ → ADR-012: naive exact match

**仲有用戶嘅 architectural insight → ADR-015 (Orchestrator Pattern formally locked)**

---

## 🟢 Low urgency — 上線後再諗（仲未 decide）

### Q6: Free tier 應該幾鬆？
**Context**: AI Dungeon 早期太鬆冧 server，太緊嚇走用戶。50 credits/日係 placeholder。Phase 4 closed beta 出數據後 finalize。

**Status**: 用戶 confirm「can work on it later」。Phase 4 數據驅動 decision。

---

## 🎉 Phase 0 zero blocker — all architectural decisions locked

可以開工。
