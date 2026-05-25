# NPC Agent L3 — 深度研究 + Architecture Plan

> Stanford Generative Agents pattern · adapted for Story Engine · Storyteller-tier exclusive
> Research date: 2026-05-26 · Session 12 deep research
> Author: Claude (research agent) · Audience: founder (primer) + next implementing AI (technical)

---

## 📚 Founder Primer (繁中 · 一頁版)

### 一句話定位

**NPC L3 = 每個 NPC 變成「自己有腦」嘅 agent**，喺玩家睇唔到嘅後台度，先諗一諗自己今 turn 想做咩，再交俾 Narrator 統一寫敘事。

### 林思雅 + 陳家明 例子（為咩 L3 重要）

**今日 (L2 狀態):**

玩家 say 「我幫林思雅遞紙巾」 → Director 算 verdict → Narrator 一次過寫晒林思雅同陳家明嘅反應。Narrator 其實係**一個人扮演晒所有角色**，所以：

- 林思雅嘅反應 = 模型憑 character card 大概估
- 陳家明嘅反應 = 模型可能忽略佢（佢冇講嘢 → AI 唔記得佢喺度）
- 兩個 NPC 嘅內心戲 = 0（玩家睇唔到 OK · 但 model 都冇諗過）

**NPC L3 之後:**

```
玩家 action → Director verdict
            ↓
         並行：
         ├─ Agent A (林思雅) 後台諗：「佢遞紙巾畀我...其實我有 d 心動但
         │                          我細妹喺度,我唔可以表現得太明顯」
         ├─ Agent B (陳家明) 後台諗：「家姐流淚,呢個外人居然主動嚟幫忙...
         │                          佢係咪有企圖?我要 close 啲監察」
            ↓
         Synthesizer 整合：「林思雅心動但壓抑 · 家明警覺加 d」
            ↓
         Narrator 收到呢個 internal 資訊 → 寫敘事：
         「林思雅接過紙巾,輕聲講『謝謝』,但你見到佢搵咗陳家明一眼。
          陳家明雙手環胸,眼神冇離開你。」
```

### 點解呢個係 differentiator

| 平台 | NPC 處理方法 | 結果 |
|---|---|---|
| AI Dungeon | 一個 AI 扮演晒所有 NPC | NPCs 互相 OOC · 冇 POV |
| Character.AI | 一次得一個 character chat | 冇 multi-character scene |
| NovelAI | 一個 AI + lorebook | NPC 冇 inner state |
| **Story Engine NPC L3** | **每個 NPC 自己一個 agent · 並行思考** | **NPC 有真正內心 · 有 POV · 唔會 OOC** |

### 商業 framing

- **Storyteller tier ($19.99/月) 獨享** — pro-max users 唔買 Storyteller 都用唔到
- **Marketing claim**：「真正活生生嘅 NPC · 唔再係背景紙板」
- **Credit cost overhead**: ~+30-50% per turn (3 NPC active × Haiku call each)
- **Storyteller user 經濟學**：佢哋每月買 ~$15-19 credits · 額外 30% 落得起 (Opus tier 都已經 4.0× credit)
- **Churn hypothesis**：解決「AI NPC 冇靈魂」#3 user complaint (after #1 記憶, #2 yes-man)

### 三層 NPC 系統 (現有 + 新)

| 層 | 已有？ | 內容 | 邊個 update | 成本 |
|---|---|---|---|---|
| L1 · 4-axis disposition (trust/romance/respect/fear) | ✅ 0001 | 長期關係 metric | Narrator | 包喺 narrator call |
| L2 · dynamic_state (mood/goal/focus/trajectory) | ✅ 0024 | 當下場景情緒 | Director | 包喺 director call |
| **L3 · agent inner thought + intent** | 🚧 NEW | NPC POV + 心理活動 + 下一步意圖 | **獨立 agent 並行 Haiku call** | +1 Haiku call per active NPC |

L1 + L2 + L3 = 完整 NPC「身體 + 情緒 + 靈魂」三層架構。

### 我希望你 sign-off 嘅嘢

1. **同意 architecture**：Stanford Generative Agents pattern · 並行 (parallel) 唔係 sequential · synthesizer 整合
2. **Tier-gate**：Storyteller only · OR Storyteller + adult? (我傾向 Storyteller-only · adult 有自己 LLM 限制)
3. **Credit charge model**：3 credits / active NPC / turn (top of normal Opus charge)
4. **Active NPC ceiling**：每 turn max **3** (我建議) vs 4 (DirectorOutputSchema 而家限 4) — 3 更省 + 更快
5. **Phase placement**：而家做（Phase 1.5），或者 push 到 Phase 2 之後

---

## 🌍 Industry Landscape Research

### Stanford Generative Agents (Park et al · 2023 · arXiv 2304.03442)

**Core architecture: Memory + Reflection + Planning 三層**[^1]:

#### Memory Stream
- 每個 agent 一條 **append-only memory stream** of observations 喺 natural language
- 每個 memory 有 3 個 score: **recency · importance · relevance**
- **Recency formula**: `r = 0.995^hours_elapsed` (exponential decay, half-life ~138 hours)
- **Importance**: LLM-assigned 1-10 score at write time (e.g. "breakfast" = 1 · "house fire" = 10)
- **Relevance**: cosine similarity between query embedding + memory embedding
- **Retrieval score**: `score = α_rec·r + α_imp·p + α_rel·ρ` — Stanford 用 equal weights (1+1+1) · normalized [0,1] min-max[^2]

#### Reflection (sync-async hybrid)
- **Trigger condition**: when sum of importance scores of recent observations **exceeds 150**
- 觸發後，agent 跑「reflection sub-prompt」：
  1. Step 1: 「Given the 100 most recent records, what are the 3 most salient high-level questions?」
  2. Step 2: For each question, retrieve memories + generate insight + write back as new memory
- **In practice**: agents reflected **2-3 times per simulated day** (paper says[^3])
- 重要 — reflection memories themselves go BACK into the memory stream + can be retrieved later (recursive)

#### Planning (recursive hierarchical decomposition)
- **Daily plan** generated at 起床 time (1-day horizon)
- Recursively decomposed: daily → hourly → minute-level chunks
- Plans get **re-evaluated** when agents observe events that contradict the plan
- Plans themselves stored in memory stream + factor into retrieval

#### Multi-agent observation
- Each agent has **isolated memory stream** — agent A can't read agent B's memory
- They observe each other through **shared environment events** (e.g. "Klaus is reading a book" is an observation A and B both write to their own streams)
- POV: third-person observations of shared events become first-person memories
- Implication: 每個 NPC「睇」同一件事可以儲存唔同 wording / interpretation

#### Cost (Stanford paper)
- **Model used**: GPT-3.5-turbo for everything (small scale · 25 agents · ~2 simulated days)
- Cost mentioned in arXiv abstract: not specific; community estimates **~$2000 for one full 2-day simulation of 25 agents**[^4]
- That's $40 per agent per simulated day · ~13 hours waking → ~$3/hour-of-agent-life
- Implication for us: agent simulation is **expensive but Haiku is 10× cheaper than GPT-3.5 baseline of 2023**

### Character.AI (architecture lessons)

**Cost-at-scale lessons from Character.AI**[^5]:

- **Built proprietary foundation model** from scratch (NOT API customer like us — different economics)
- Optimized **KV cache** size by 20× without quality regression
- Cost: **<$0.01 per hour of conversation** (~30k generations/sec at peak)
- Lesson for us: 我哋係 API customer · 唔可以靠 inference optim · 必須靠 **prompt caching + parallel batching** to get cost down

**Multi-character bug history**:
- Group chat launch (multi-character mode) 用咗 **2 weeks** · introduced 3-4 bugs · 即係「multi-character coordination」係 hard problem 即使對 Character.AI
- 設計 implication: multi-character coherence 必須有專門 system component (e.g. synthesizer)

### AI Dungeon / NovelAI

**AI Dungeon current approach**[^6]:
- Single LLM call generates「the world's reaction」including 所有 NPC dialogue
- NPCs 冇 individual POV · 冇 independent state · NPC inconsistency 係常見 complaint
- 引入 input prefix system (player narrating vs character speaking) 部分 mitigate but doesn't solve POV problem

**NovelAI lorebook system**[^7]:
- **Activation keys**: 每個 lorebook entry 有 trigger keywords
- Insertion order controls priority
- All character entries 可以 bundled 一齊 as a category
- NPCs 嘅 dynamic state **冇 first-class support** — 全部 static description
- **Inspiration**: Story Engine 嘅 mem_edges + lorebook 已經超越 NovelAI · L3 可以拉開更大距離

### Multi-agent orchestration frameworks (2025-2026 landscape)[^8]

| Framework | Pattern | Production-ready? | Story Engine 借鑑 |
|---|---|---|---|
| **LangGraph** | DAG with conditional edges + parallel | ✅ LinkedIn / Uber prod | Pattern: 用 LangGraph-style fan-out / fan-in 但唔需要 import LangGraph framework |
| **CrewAI** | Hierarchical manager-worker | ⚠️ Manager pattern 報告唔可靠 | 唔用 hierarchical · 用 flat parallel |
| **AutoGen / AG2** | Conversational GroupChat | 對 chatbot OK · 對敘事過 chat-y | Skip |
| **OpenAI Agents SDK** | Native Swarm + handoff (March 2025) | 新 · 唔成熟 | Skip |
| **Google ADK** | Hierarchical sub-agent tree | 新 · April 2025 | Skip |

**Key insight from research**[^9]: **72% of enterprise AI projects 而家用 multi-agent · up from 23% in 2024** — pattern 已經 mainstream.

**Caveat from "Why CrewAI Manager-Worker Fails"**[^10]: 過多 layers of manager-delegation → high latency + incorrect reasoning. **Flat parallel is more reliable than hierarchical for our use case**.

### Recent 2024-2025 papers on Theory of Mind + character agents

#### MIRROR (Yang et al · 2025 · arXiv 2503.08193)[^11]

**Chain-of-thought structure for character inner thought**:
1. **Memory Recall** — cosine similarity retrieval of relevant character background events
2. **Theory of Mind Thinking** — analyze + predict reactions of related entities (other characters, groups, environment)
3. **Reflection & Summarization** — filter generated thoughts · summarize into coherent thought process aligned with personality

**Performance**:
- ROLETHINK Gold Set: MIRROR scores **3.0-3.1** vs zero-shot 2.4 · retrieval-based 2.5-2.7 · long-context 2.7-2.8
- Claude-3.5 downstream task improvement: **+6 percentage points** on decision-making benchmarks
- Strong narrative coherence per human eval

**Lesson for Story Engine**: 3-step CoT (recall → predict → summarize) maps directly onto our NPC agent design. Use MIRROR-inspired prompt structure for NPC L3 agents.

#### RoleFact / Character Hallucination Mitigation (Zhang et al · 2024 · arXiv 2406.17260)[^12]

**Two-stage verification approach**:
1. Atomic fact decomposition · break response into discrete claims
2. Dual verification: against retrieved knowledge (RAG) + against parametric knowledge (with confidence threshold t=0.6)

**Results**: 18% factual precision improvement on adversarial · 44% temporal hallucination reduction

**Lesson for Story Engine**: 我哋 lorebook + RAG retrieval already provides the "retrieved knowledge" leg. NPC agents need fact-grounding 對抗 LLM hallucinating fake NPC history.

#### Drama Machine (Wermelinger et al · 2024 · arXiv 2408.01725)[^13]

**4-agent architecture**: Ego / Superego / User / Director
- **Intersubjective dialogue** (public · between Ego + User) vs **intrasubjective monologue** (private · between Ego + Superego)
- Sequential with parallel review — Ego generates · Superego critiques · revise

**Coordination cost**: NOT parallel — sequential pipeline with 3-4 LLM calls per turn
**Lesson for Story Engine**: Drama Machine validates inner-thought-as-hidden-stream pattern · but their sequential approach 太慢 for real-time fiction. We do parallel.

#### Theory of Mind in multi-agent LLM (CMU dissertation Oguntola 2025)[^14]

**Key finding**: explicit belief state representations enhance task performance AND ToM inference accuracy.
**Limitation**: LLM agents fail at long-horizon contexts + hallucinate about task state.

**Implication for Story Engine**: Don't trust the LLM to maintain ToM purely in context — externalize key beliefs to structured state (which we already do via mem_edges + dynamic_state).

### OpenAI Assistants API patterns (cost lessons)[^15]

**Insight**: Agentic coding workflows (SWE-bench style) average **1-3.5M tokens per task** · 99% of tokens are input (accumulated history).

**Critical for us**: **Multi-turn agent cost compounds** — by turn 10, cost per call is ~7× the cost of turn 1. **Hard implication**: NPC agents must NOT carry their own conversation history. Each NPC agent call should be **stateless** — context provided fresh from L1+L2 state + retrieved memories.

---

## 🏗️ Architecture Decisions

### Decision 1: Parallel vs Sequential agent execution

**Decision: PARALLEL via Promise.all**

**Rationale**:
- Stanford: sequential within each agent's reflection cycle · but agents themselves run as concurrent simulations
- Drama Machine: sequential because Superego must wait for Ego — different problem (criticism vs simultaneous POV)
- For Story Engine: all NPCs see same scene · they don't need each other's outputs to think
- Parallel benefit: total latency = max(agent_latency) not sum
- Sequential cost: 3 NPCs × ~1.5s Haiku = 4.5s vs parallel 1.5s. **3× latency savings.**
- Vercel timeout (60s / fluid 300s) easily accommodates parallel + we already have ~3-7s budget headroom

**Risk**: Anthropic rate limit at organization level. Tier 1 = 50 RPM Haiku · Tier 4 = much higher. Storyteller-only gating + max 3 parallel = `3 × N concurrent users` calls. At 100 concurrent Storyteller turns = 300 calls/sec — way over Tier 1. **Mitigation**: must be Tier 3+ before launch. Document as scale prereq.

**Reference**[^16]: Parallel LLM calls demonstrate 2-7× latency reduction over sequential (LLMCompiler benchmarks 1.4-2.4× typical, up to 3.7× best case).

### Decision 2: Shared vs Isolated agent memory

**Decision: ISOLATED memory views with SHARED L1+L2 ground truth**

**Rationale**:
- Pure shared = NPCs all see same context = no POV differentiation = defeats the point
- Pure isolated = each NPC needs own memory stream + lorebook = 5× storage + sync hell
- **Hybrid (our choice)**:
  - **Ground truth (shared)**: L1 disposition (4-axis) + L2 dynamic_state + canonical events in lorebook + scene description
  - **POV view (per-NPC)**: each agent's prompt scopes memory retrieval to **what THIS NPC would know**
    - Filter rule: NPC X sees memories where edge `attended` or `witnessed` connects X to event
    - Or NPC was geographically co-present (lorebook `located_at` edge)
  - **Inner thought (per-NPC private)**: agent's `inner_thought` output stored in `npc_inner_thoughts` table · scoped to that NPC

**Implementation**: re-use `walk_lorebook_graph` RPC (Migration 0025) with `p_start_name = npc_canonical_name` + edge filter `['attended', 'witnessed', 'located_at']` to get this NPC's "known events".

**Reference**[^17]: Multi-agent memory research (Mem0 / MongoDB 2026) consensus: scope by agent_id but allow user-level shared context. Our pattern aligns.

### Decision 3: Theory of Mind layer (NPCs modeling other NPCs)

**Decision: SHALLOW ToM only — each NPC sees other NPCs' L2 dynamic_state · NO recursive belief modeling**

**Rationale**:
- Full ToM (NPC A models what NPC B thinks A is thinking) = exponential context blowup
- Stanford didn't do recursive ToM either · MIRROR Step 2 ("predict reactions of related entities") is 1-level only
- For interactive fiction: 1-level is enough for the player to FEEL deep ToM via NPC interactions ("林思雅 noticed 陳家明's tension" = good story; "林思雅 thinks 陳家明 thinks I am suspicious" = pretentious + hallucination-prone)

**Concrete**: Each NPC agent's prompt gets:
- ITS OWN: full character card + personal memories + own dynamic_state
- OTHER NPCs (active in scene): their L2 dynamic_state ONLY (current_mood / current_goal / topic_focus)
- This gives "I see 陳家明 is wary" without exploding into recursive nesting

**Reference**[^18]: Oguntola 2025 CMU dissertation: explicit belief representations help · but LLMs hallucinate long-horizon ToM. Keep it shallow + grounded.

### Decision 4: Output Reconciliation

**Decision: NO explicit synthesizer agent — Narrator IS the synthesizer**

**Rationale**:
- Adding a synthesizer = +1 LLM call (~$0.003) + ~1s latency
- Narrator already integrates all context (Bible + memory + Director verdict + state) — adding `npc_inner_streams` is just one more block
- Research shows synthesizer agents can "hallucinate consensus that doesn't exist"[^19] — extra failure mode for unclear win
- Counter-evidence: Council Mode paper claims synthesizer helps with multi-model disagreement[^20] — but they synthesize CONFLICTING fact claims · we synthesize COMPLEMENTARY emotional POVs (no factual disagreement to resolve)

**Concrete flow**:
```
Narrator system prompt addendum:
## NPC Inner Streams (this turn · private POVs)
### 林思雅 (mood: 焦慮 → 心動)
inner_thought: "佢主動嚟幫我...冇人試過咁細心,但細妹喺度,我唔可以表現..."
intent: "暗中睇陳家明反應,如果安全先慢慢表達感激"
### 陳家明 (mood: 警覺 → 加強警覺)
inner_thought: "呢個外人主動接近家姐,係咪有企圖?過去 3 turn 都喺度晃..."
intent: "保持距離但密切觀察,如果再進一步就介入"

## Your job: weave these inner currents into the OBSERVED scene
- inner_thought NEVER appears verbatim in narrative
- intent shapes NPC actions/dialogue this turn
- player only sees observable cues (eye contact, body language, what was said)
```

**Conflict handling**: when 2 NPC intents conflict (e.g. 林思雅 wants intimacy · 陳家明 wants distance), Narrator handles in-fiction (兩個 NPC create tension) — this IS the dramatic value. No system-level reconciliation needed.

### Decision 5: Schema design — new table vs extend dynamic_state

**Decision: NEW TABLE `npc_inner_thoughts` · NOT extending dynamic_state**

**Rationale**:
- `dynamic_state` is small + cached in active context (per-turn ephemeral)
- inner_thoughts are larger (50-200 chars each) + need history retention for callback
- Separation of concerns: dynamic_state = Director output · inner_thoughts = NPC agent output · audit trail clearer
- Reusable as memory source: `npc_inner_thoughts` can be embedded + retrieved for future turn callback ("林思雅 still secretly remembers her earlier conflicted feeling")
- RLS: inner_thoughts can be locked down strictly (service_role write only · authenticated select with playthrough ownership · CLAUDE.md hard rule #15 compliant)

**Schema sketch** (Migration 0027 · detailed in §🔌 below):
```sql
create table npc_inner_thoughts (
  id uuid primary key,
  playthrough_id uuid references playthroughs,
  character_id uuid references story_characters,
  turn_index integer,
  inner_thought text (max 400 chars),
  intent text (max 200 chars),
  reasoning_trace jsonb, -- MIRROR-style: {memories_recalled: [], reactions_predicted: [], motivation_synthesized: ""}
  embedding vector(1536),
  created_at timestamptz
);
```

---

## 💰 Cost + Latency Model (real numbers)

### Per-NPC-agent token budget

**Input tokens estimate**:
```
Cached prefix (shared per turn · cache hit 90% off):
  - System rules + character card (own NPC) ........... ~600 tokens
  - Other NPCs' L2 dynamic_state (max 3 others) ........ ~200 tokens
  Subtotal cached: ~800 tokens

Dynamic per-NPC (NOT cached):
  - Player action ...................................... ~60 tokens
  - Director verdict + memory_hints .................... ~150 tokens
  - This NPC's recent memories (filtered POV) .......... ~400 tokens
  - This NPC's own L1 disposition + permanent_flags .... ~80 tokens
  - This NPC's L2 dynamic_state (own + trajectory) ..... ~120 tokens
  - Recent 4 turns (shared scene context) .............. ~400 tokens
  Subtotal uncached: ~1210 tokens

Total per-NPC INPUT per turn: ~2000 tokens
Cached portion: 800 × 0.1 = 80 tokens billed
Uncached portion: 1210 tokens billed
Effective billed input: ~1290 tokens
```

**Output tokens estimate** (structured output: inner_thought + intent + reasoning trace):
```
- inner_thought: ~80 tokens
- intent: ~40 tokens
- reasoning_trace.memories_recalled: ~50 tokens
- reasoning_trace.reactions_predicted: ~80 tokens
- reasoning_trace.motivation: ~40 tokens
- JSON structural overhead: ~20 tokens
Total output: ~310 tokens
```

### Haiku 4.5 pricing[^21]
- Input: $1.00 / M tokens (cached: $0.10 / M)
- Output: $5.00 / M tokens
- Cache write (5-min TTL): $1.25 / M

### Per-NPC-agent cost
```
Input (cached part): 80 tokens × $0.10 / 1M = $0.000008
Input (uncached): 1210 tokens × $1.00 / 1M = $0.00121
Output: 310 tokens × $5.00 / 1M = $0.00155
First-turn cache write: 800 × $1.25 / 1M = $0.001 (amortized over ~20 turns = $0.00005 per turn)

Per-NPC per-turn: ~$0.0028 (~0.3 cents)
```

### Per-turn cost scaling

| Active NPCs | Per-turn NPC L3 cost | Cumulative vs Opus baseline ($0.025/turn for pro-max) |
|---|---|---|
| 0 (skip L3) | $0 | $0.025 (no change) |
| 1 | $0.0028 | $0.028 (+11%) |
| 2 | $0.0056 | $0.031 (+22%) |
| 3 | $0.0084 | $0.034 (+33%) |
| 4 | $0.0112 | $0.036 (+44%) |

**Recommendation: cap at 3 active NPCs per turn** — balance scene drama vs cost.

### Latency

**Per-NPC Haiku 4.5 call (P50)**: ~1.2-1.8 seconds (Haiku is fast)
**Parallel via Promise.all**: max(agent_latencies) ≈ 1.8s
**Sequential equivalent**: sum(agent_latencies) ≈ 5.4s (3 NPCs)
**Latency saving**: ~3.6s = ~67% reduction

**Within turn pipeline**:
```
Director call:        ~1.5s
Memory retrieve:      ~0.5s (parallel to Director if optimized · today sequential)
Memory refine:        ~0.3s (after Director)
NPC L3 agents:        ~1.8s (parallel · NEW)
Narrator stream TTFT: ~1.0s
Narrator full out:    ~6-10s (Opus 4.7)
----
Total turn TTFT:      ~4.6s (was ~3.3s) · +1.3s
Total turn complete:  ~10-14s (was ~8-12s) · +2s
```

**Vercel timeout headroom**: 60s standard / 300s fluid · we use ~14s · plenty of room. ✅

### Credit charge logic

**Proposed**: NPC L3 charges `3 credits / active NPC` ON TOP of normal turn credits.
- pro-max base turn: ~6 credits (Opus 4.0× multiplier)
- + 3 NPC × 3 credits = 9 credits add-on
- Total turn: ~15 credits with L3 active
- Cost reality: $0.025 base + $0.008 = $0.033/turn
- At Storyteller $19.99/mo for ~1500 credits ≈ ~100 L3-enabled turns/month
- 100 deep turns = significant value per ChinaAI market norms

---

## 🛡️ Failure Modes + Mitigations

### F-01: NPC agent hallucinates new NPC / event
**Risk**: agent invents "我記得 3 年前阿明話過..." that never happened
**Mitigation**:
- MIRROR-style retrieval grounding (CLAUDE.md hard rule from Phase 2: similarity floor 0.45+ for lorebook)
- Reasoning trace stores `memories_recalled: [lorebook_entry_id, ...]` — auditable
- Narrator system prompt: "treat inner_thought as one possible POV, not factual gospel"
- Director verdict layer still has veto power — if NPC inner_thought conflicts with Bible, verdict can reject

### F-02: Two NPCs' intents contradict + Narrator picks one arbitrarily
**Risk**: 林思雅 intent = 接近主角 · 陳家明 intent = 阻止 → Narrator must dramatize tension
**Mitigation**:
- This is FEATURE not bug — dramatic tension IS the value
- Narrator prompt instruction: "when NPC intents conflict, dramatize as observable tension (eye contact, interruption, body language) — don't pick one as 'winner'"
- Make conflict visible in inner_streams block so Narrator sees it explicitly

### F-03: NPC agent timeout / refusal
**Risk**: 1 of 3 parallel agents fails (Anthropic 503, content filter)
**Mitigation**:
- Promise.allSettled (not Promise.all) — partial failure tolerated
- Fall back to L2-only narration if all 3 fail (degrade gracefully · log warning)
- Per-NPC try/catch with 1 retry (mirror Director pattern in director.ts)
- CLAUDE.md hard rule #17: any background work uses `after()` not `void async`

### F-04: Director verdict says reject · but NPC agent emits enthusiastic intent
**Risk**: Narrative integrity breach (NPC accepts what Director rejected)
**Mitigation**: same as existing F-06 (Wave 2 fix in turn route): **SKIP NPC L3 agent calls entirely when verdict === "reject"** — the Director's pushback IS the scene; no agent thoughts needed
- Saves cost (3 calls × $0.003) when verdict is reject
- Also saves latency on rejected turns
- Preserves narrative integrity

### F-05: OOC (out-of-character) drift in agent's inner_thought
**Risk**: 林思雅 inner thought sounds like generic LLM voice not her established personality
**Mitigation**:
- Each agent's prompt includes its OWN character card voice_sample (CLAUDE.md split: cached static prefix)
- Reasoning trace `motivation` field forces grounding in character_card.core_motivation
- RoleFact-inspired confidence threshold: if inner_thought has 0 retrieved memory matches → flag for review (post-launch · audit data)

### F-06: Player prompt injection through Director-emitted active NPC list
**Risk**: player crafts prompt that makes Director emit a non-existent NPC name → agent call hallucinates
**Mitigation**:
- Existing pattern (turn route line 503): `ch = ctx.characters.find(...) ; if (!ch) continue;` — name must exact-match known character
- NEW: case-insensitive trim match (already in 0024 RPC) — handle player variation
- Hard cap of 3 (or 4 for compat with existing DirectorOutputSchema max) active NPCs

### F-07: Cache miss explosion (CLAUDE.md hard rule #13)
**Risk**: per-NPC static prefix differs subtly across NPCs → cache fragmentation → 3× cache writes per turn
**Mitigation**:
- Per-NPC cache prefix is intentionally per-NPC (the character card IS the cached content)
- Cache key includes character_id implicitly — each NPC gets its OWN cache prefix
- 5-min TTL covers typical session length of an active NPC
- Cost analysis (above) accounts for cache write cost amortized over ~20 turns

### F-08: NPC inner_thought leaks into player-visible narrative
**Risk**: Narrator quotes inner_thought verbatim → breaks 4th wall + reveals secrets
**Mitigation**:
- Narrator system prompt: explicit `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE]` wrapper (already pattern for Director verdict · re-use)
- Audit: post-launch log scan for narrative chunks matching inner_thought strings · alert if >5% match
- Hard rule consistency with existing `memoryContextString` wrapping pattern

### F-09: Tier downgrade race — user cancels Storyteller mid-playthrough
**Risk**: in-flight turn already paid for L3, then sub canceled
**Mitigation**:
- Check tier at turn-start (existing pattern in turn route)
- If user downgrades, next turn skips L3 silently · saved inner_thoughts remain queryable for future re-upgrade
- No refund needed — turn-already-started gets to finish

---

## 🔌 Story Engine Integration

### Migration plan — 0027 onwards

#### Migration 0027 · npc_inner_thoughts table

```sql
-- Migration 0027 · Phase 1.5 · NPC L3 inner thoughts (Storyteller-tier exclusive)
-- Stanford Generative Agents-inspired · per-NPC agent inner thought + intent
-- Storyteller subscription tier required to enable

create table if not exists public.npc_inner_thoughts (
  id uuid primary key default uuid_generate_v4(),
  playthrough_id uuid not null references public.playthroughs(id) on delete cascade,
  character_id uuid not null references public.story_characters(id) on delete cascade,
  turn_index integer not null,
  inner_thought text not null,
  intent text not null,
  reasoning_trace jsonb not null default '{}'::jsonb,
  embedding vector(1536), -- pgvector · enables future "NPC remembers their own past thought"
  created_at timestamptz not null default now(),
  -- One thought per (playthrough, character, turn) — Director output is canonical
  constraint npc_inner_thoughts_unique unique (playthrough_id, character_id, turn_index),
  -- Length guards (defense in depth)
  constraint npc_inner_thoughts_inner_thought_len check (length(inner_thought) <= 400),
  constraint npc_inner_thoughts_intent_len check (length(intent) <= 200),
  constraint npc_inner_thoughts_reasoning_object check (jsonb_typeof(reasoning_trace) = 'object')
);

create index if not exists npc_inner_thoughts_playthrough_idx
  on public.npc_inner_thoughts (playthrough_id, turn_index desc);
create index if not exists npc_inner_thoughts_character_idx
  on public.npc_inner_thoughts (character_id, turn_index desc);
-- ANN index for embedding (HNSW · cosine like existing turn_embeddings)
create index if not exists npc_inner_thoughts_embedding_idx
  on public.npc_inner_thoughts using hnsw (embedding vector_cosine_ops);

-- RLS · service-role writes only (CLAUDE.md hard rule #5 + #15)
alter table public.npc_inner_thoughts enable row level security;

drop policy if exists "npc_inner_thoughts_own_select" on public.npc_inner_thoughts;
create policy "npc_inner_thoughts_own_select" on public.npc_inner_thoughts
  for select using (
    exists (
      select 1 from public.playthroughs p
      where p.id = playthrough_id and p.user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.npc_inner_thoughts from authenticated, anon;

-- RPC: apply_npc_inner_thought (service-role)
-- Atomic write · accepts pre-embedded vector (caller embeds via embedTextSafe)
create or replace function public.apply_npc_inner_thought(
  p_playthrough_id uuid,
  p_character_id uuid,
  p_turn_index integer,
  p_inner_thought text,
  p_intent text,
  p_reasoning_trace jsonb,
  p_embedding vector(1536)
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if length(p_inner_thought) > 400 then
    raise exception 'inner_thought too long';
  end if;
  if length(p_intent) > 200 then
    raise exception 'intent too long';
  end if;
  insert into public.npc_inner_thoughts (
    playthrough_id, character_id, turn_index,
    inner_thought, intent, reasoning_trace, embedding
  ) values (
    p_playthrough_id, p_character_id, p_turn_index,
    p_inner_thought, p_intent, p_reasoning_trace, p_embedding
  )
  on conflict (playthrough_id, character_id, turn_index) do update
    set inner_thought = excluded.inner_thought,
        intent = excluded.intent,
        reasoning_trace = excluded.reasoning_trace,
        embedding = excluded.embedding
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.apply_npc_inner_thought from public, anon, authenticated;
grant execute on function public.apply_npc_inner_thought to service_role;
```

#### Migration 0028 · npc_l3_enabled flag on playthroughs

```sql
-- Per-playthrough toggle — Storyteller default ON · user can disable for cost savings
alter table public.playthroughs
  add column if not exists npc_l3_enabled boolean not null default false;

-- Trigger: enforce tier on enable
create or replace function public.enforce_npc_l3_tier_gate()
returns trigger language plpgsql as $$
declare
  v_tier text;
begin
  if new.npc_l3_enabled then
    select subscription_tier into v_tier
    from public.users where id = new.user_id;
    if v_tier not in ('storyteller', 'legend') then
      raise exception 'NPC L3 requires Storyteller tier (you are %)', coalesce(v_tier, 'free');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists npc_l3_tier_gate on public.playthroughs;
create trigger npc_l3_tier_gate
  before insert or update of npc_l3_enabled on public.playthroughs
  for each row execute function public.enforce_npc_l3_tier_gate();
```

### Code changes required

#### New files

1. **`web/src/schemas/npc-agent.ts`** — Zod schemas:
   - `NpcAgentOutputSchema` (inner_thought + intent + reasoning_trace)
   - `NpcAgentBatchOutputSchema` (array of NpcAgentOutput · for callers)
   - Helper: `npcAgentToNarratorBlock(outputs[]) => string` formatted for Narrator prompt

2. **`web/src/lib/ai/npc-agents.ts`** — orchestration module:
   - `callNpcAgent(ctx, character, otherActiveNpcs) => Promise<NpcAgentOutput>` — single agent call
   - `callNpcAgentsParallel(ctx, activeNpcNames) => Promise<NpcAgentOutput[]>` — Promise.allSettled wrapper
   - `NPC_AGENT_SYSTEM` constant — prompt template (繁中)
   - Handles cache control (per-NPC ephemeral) + retry + timeout (8s per agent · abort if exceeded)

3. **`web/src/lib/ai/npc-agents-retrieval.ts`** — POV memory scoping:
   - `retrieveNpcAgentContext(supabase, playthroughId, npcName, query)` — uses walk_lorebook_graph filtered to attended/witnessed/located_at
   - Returns array of memories scoped to this NPC's POV

#### Modified files

1. **`web/src/app/api/playthroughs/[id]/turn/route.ts`**:
   - After Director verdict (step 4.25 · between memory refine and skill check)
   - Insert step 4.27: NPC L3 agents
   - Skip when: verdict === 'reject' (F-04 mitigation) OR npc_l3_enabled === false OR active NPCs empty OR tier not Storyteller
   - Inject `npcInnerStreams` into Narrator's `ctx.npcInnerStreamsBlock` field
   - `after()` block: persist via `apply_npc_inner_thought` RPC (CLAUDE.md hard rule #17)

2. **`web/src/lib/ai/turn-runner.ts`**:
   - `TurnContext` add `npcInnerStreamsBlock?: string`
   - `buildDynamicSystemPrompt` insert `npcInnerStreamsBlock` between memoryContext and recent turns
   - `NARRATOR_RULES` add subsection: "## NPC Inner Streams (private POVs · DO NOT QUOTE)"

3. **`web/src/lib/billing/credits.ts`**:
   - `computeTurnCredits` add `npcL3Active: number` param
   - Charge `3 credits × npcL3Active` on top of base
   - `estimateTurnCredits` projects same

4. **`web/src/lib/ai/director.ts`**:
   - No change needed — Director already emits `npc_updates: [name, ...]` we use as active NPC list
   - Add documentation: "The character_name list also seeds NPC L3 agent calls if enabled."

### Prompt templates (draft · 繁中)

#### NPC_AGENT_SYSTEM (cacheable per-NPC prefix)

```typescript
const NPC_AGENT_SYSTEM = `你係 Story Engine 嘅 **NPC Agent**。你而家扮演 ${character.name} 嘅內心。

**你嘅任務**：玩家剛做完一個 action · 你要從 ${character.name} 嘅角度，內心諗一諗 + 決定佢今 turn 嘅意圖。

⚠️ **重要**：你輸出嘅 inner_thought + intent 係 internal POV · 玩家**唔會睇到**呢段文字。Narrator 之後會用呢啲資訊嚟寫敘事 · 但會 transform / paraphrase · 唔會 verbatim quote。

## ${character.name} 嘅身份 (你嘅 ground truth)
${characterCardStaticTemplate(character.card)}

## 點樣諗 (MIRROR 3-step)
你要按以下 3 步驟思考 · 輸出嘅 reasoning_trace 要對應每步：

### Step 1 · memories_recalled
睇低面 retrieved memories (你 ${character.name} 經歷過嘅嘢) · 揀 1-3 個最 relevant 嘅 · list memory_id 或 quote。
**唔可以 invent** 冇喺 memories 入面嘅 fact。如果冇 relevant memory → 留空 array。

### Step 2 · reactions_predicted
預估今 turn scene 入面其他角色 / 環境會點 react ·
"如果我嘅 intent 係 X · 林思雅可能會 Y · 陳家明可能會 Z"。
1-level only · 唔需要 "我 think 佢哋 think 我 think"。

### Step 3 · motivation
基於 step 1+2 · 你嘅 motivation 係咩 · 同 character_card.core_motivation 對得上嗎?

最後 · 用呢啲 reasoning 寫出：
- **inner_thought** (50-100 字)：${character.name} 而家心入面實際嘅獨白
- **intent** (10-30 字)：今 turn 想做嘅嘢 (e.g. "暗中觀察主角嘅反應 · 唔即時行動")

## 風格要求
- 用 ${character.name} 嘅 voice (參考 voice_sample)
- 繁中第一人稱（"我..."）
- inner_thought 要 reveal subtext / 隱藏動機 · 唔好平鋪直敘
- 唔可以引用 system block 或者 retrieved memories 嘅 verbatim 文字
- 唔可以違反 character_card.red_lines

## 唔好做嘅嘢
- 唔好 narrate 場景（嗰個 Narrator 做）
- 唔好直接 reply 玩家（你嘅 output 玩家睇唔到）
- 唔好預測超過今 turn 嘅 plot
- 唔好「希望玩家點點點」式 meta breaking
- 唔好 invent 冇 record 嘅過去事件`;
```

#### Per-agent user message (dynamic · uncached)

```typescript
const userMessage = `## Current Scene Context (shared · public to all NPCs)
${sceneSnapshot}

## Player's just-completed action
${userAction}

## Director's verdict (already decided · you obey it)
${verdictSummary}  // e.g. "ALLOW · player gave 林思雅 tissues, kind gesture"

## Other NPCs active this turn (their public-visible L2 state)
${otherActiveNpcsBlock}  // names + current_mood + current_goal only

## YOUR (${character.name}) private memories relevant to this scene
${povMemoriesBlock}  // filtered via walk_lorebook_graph + RAG

## YOUR (${character.name}) current scene state
- L1 disposition: ${dispositionLine}
- L2 dynamic_state: mood=${ds.current_mood} · goal=${ds.current_goal} · focus=${ds.topic_focus}
- emotional trajectory (recent 8): ${trajectoryArrows}
- earned permanent_flags: ${permanentFlags.join(', ')}

## Recent shared scene turns
${recentTurns}

請按 MIRROR 3-step 思考 · 輸出 NpcAgentOutput schema。`;
```

#### NpcAgentOutputSchema (structured output · Anthropic-safe)

```typescript
export const ReasoningTraceSchema = z.object({
  memories_recalled: z.array(z.string().max(120)).max(3).default([]),
  reactions_predicted: z.array(z.string().max(120)).max(3).default([]),
  motivation: z.string().min(10).max(180),
});

export const NpcAgentOutputSchema = z.object({
  character_name: z.string().min(1).max(60),
  inner_thought: z.string().min(20).max(400),
  intent: z.string().min(5).max(200),
  reasoning_trace: ReasoningTraceSchema,
});
```

### Anthropic structured output considerations (CLAUDE.md hard rule #10)

**Optional param count**: NpcAgentOutputSchema 有 4 top-level + 3 nested = **7 params total** · way under 24 limit. ✅

**Grammar size**: simple flat schema · no nested unions · no enum explosion · grammar compile should be trivial. ✅

**Risk if we add more fields later** (e.g. emotional_shift per agent · planned_dialogue_hint): stay under 10 top-level to leave headroom.

### Cache strategy (CLAUDE.md hard rule #11 + #13)

**Per-NPC cached prefix** (5-min TTL ephemeral):
- NPC_AGENT_SYSTEM (boilerplate · always same)
- characterCardStaticTemplate(thisCharacter) (this NPC's card — never changes per playthrough)

**NOT cached** (varies per turn):
- otherActiveNpcs L2 state (changes turn-to-turn)
- POV memories (different per turn)
- own L1 + L2 + permanent_flags (changes turn-to-turn)
- recent shared turns
- player action

**Cache hit estimate**: same NPC active across consecutive turns → 5-min window catches typical scene. Expected cache hit rate >70% mid-scene · ~30% at scene boundary.

**Cost validation**: cached prefix ~800 tokens × 90% off = ~80 tokens billed instead of 800. Saves ~$0.0007 per NPC per cache-hit turn. Over 3 NPCs × 200 cache-hit turns/month = ~$0.42 per Storyteller user. Multiply by user base.

---

## 🎯 Tier-Gating + Credit Charge

### Schema-level gating
- Migration 0028 trigger on `playthroughs.npc_l3_enabled` enforces tier (defense layer 1)
- Per-turn check in turn route reads `pt.npc_l3_enabled` (defense layer 2)
- Frontend hides toggle UI for non-Storyteller users (defense layer 3 · UX layer)

### Credit charge model
```typescript
// In lib/billing/credits.ts
export function computeTurnCredits(opts: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  npcL3Active: number; // NEW · default 0
  // ... existing fields
}): number {
  const base = computeNarratorCredits(opts);
  const npcL3Charge = opts.npcL3Active * 3; // 3 credits per active NPC
  return base + npcL3Charge;
}
```

Display in UI:
- Pre-turn estimate: "Estimated cost: 6 credits + 9 NPC L3 credits = **15 credits**"
- Post-turn actual: ledger entry breaks out base / L3 / model-actual

### Marketing positioning

**Adventurer ($9.99)**: Director enforcement · L2 dynamic_state · OK NPC quality
**Storyteller ($19.99)**: + **NPC L3 Agents — every NPC has a soul** · pro-max model (Opus 4.7) · adult mode option
**Legend ($49.99)** (future): + custom Director prompts · highest-tier models

**Hero claim on pricing page**: "唔再係紙板 NPC. 每個角色都有自己嘅內心戲 + POV."

---

## 📅 Implementation Plan

### Sub-tasks (estimated effort)

**Session 12 (current · this research)** — ~0 hours · just research. ✅ DONE

**Session 13 — Phase 1.5 NPC L3 implementation** (~3 hours):
- [ ] M-01: Migration 0027 (`npc_inner_thoughts` table + RPC) · ~20 min
- [ ] M-02: Migration 0028 (`npc_l3_enabled` flag + tier-gate trigger) · ~15 min
- [ ] C-01: `schemas/npc-agent.ts` (Zod schemas + helpers) · ~20 min
- [ ] C-02: `lib/ai/npc-agents.ts` (orchestration · prompt template · parallel call · retry) · ~50 min
- [ ] C-03: `lib/ai/npc-agents-retrieval.ts` (POV memory scoping) · ~20 min
- [ ] C-04: Turn route integration (step 4.27 · skip on reject · after-block persist) · ~30 min
- [ ] C-05: `turn-runner.ts` Narrator prompt update · ~15 min
- [ ] C-06: `credits.ts` add npcL3Active charge · ~10 min

**Session 14 — UI surface + audit Wave 1** (~2 hours):
- [ ] UI-01: Settings toggle (storyteller-only · saves to playthrough.npc_l3_enabled)
- [ ] UI-02: Memory Journal subview to expose recent NPC inner thoughts (Storyteller benefit visible)
- [ ] AUDIT-01: 2-agent parallel audit (Security/Correctness + UX/Cost/Regression)

**Session 15+ — Audit convergence** (~2-3 hours):
- [ ] AUDIT-02: Wave 2 audit · fix HIGH findings inline
- [ ] AUDIT-03: Wave 3 audit · verify converged (3 consecutive zero-blocker cycles per CLAUDE.md hard rule #29)

### Audit gates

**After session 13 (function complete)**:
- All migrations apply cleanly on local dev branch
- Turn route doesn't break for non-Storyteller users (L3 path stays inactive)
- Test fixture: 1 turn with 2 NPCs active · verify both agents fire · inner_thoughts persist · Narrator's prompt includes the block · player narrative doesn't quote inner_thoughts verbatim

**Pre-audit verification checks**:
- [ ] Anthropic structured output schemas all pass `safeParse` test
- [ ] Promise.allSettled handles 1-of-3 failure gracefully (mock test)
- [ ] Tier gate trigger rejects non-Storyteller `npc_l3_enabled=true` write
- [ ] Cache prefix is per-NPC (not globally shared) — verify via Anthropic response cache_read_tokens vs cache_creation_tokens

### Decision points needing founder sign-off

1. **Tier eligibility**: Storyteller only (我傾向 this) · OR Storyteller + Adult both?
   - Adult uses Llama 405B — does NPC agent also use Llama? Or always Haiku (cheap) regardless of tier?
   - **My recommendation**: NPC agent ALWAYS Haiku (it's internal · Director-style · user doesn't see). Saves cost + consistency.

2. **Max active NPCs per turn**: 3 (my recommendation · cost-tighter) · or stick with current 4 (DirectorOutputSchema cap)?
   - 3 = cleaner ceiling · saves ~25% L3 cost · still covers all reasonable scenes
   - 4 = matches existing Director cap · no schema change · slightly more dramatic scenes

3. **Credit charge per NPC**: 3 (my recommendation) · 2 (cheaper · more accessible) · 5 (premium pricing)?
   - Real cost is ~0.3 credits worth · we'd be marking up 10× — par for the course at our tier

4. **Default ON for Storyteller users** or **OPT-IN**?
   - Default ON → ship-day "wow" factor · but ~33% cost increase auto-applied
   - Opt-in → user discovery problem · feature might never get used
   - **My recommendation**: default ON for new playthroughs · with prominent UI toggle to disable · existing playthroughs stay off until user enables

5. **Phase placement**: Phase 1.5 NOW (current Phase 1 audit converged · this fits) vs Phase 2 LATER?
   - NOW: synergy with just-finished L2 (Director already emits NPC names · trivial to consume)
   - LATER: focus Phase 2 on payment / Storyteller subscription rollout first
   - **My recommendation**: NOW · function-tier work per founder priority rule

---

## ⚠️ Open Questions + Risks

### OQ-1: Embedding latency cost for npc_inner_thoughts
Each inner_thought needs an embedding to support future retrieval. OpenAI text-embedding-3-small is cheap (~$0.00002 per thought) but adds ~200ms latency per agent. Solutions:
- Embed in `after()` block (CLAUDE.md hard rule #17) — adds no perceived latency · pays cost
- Skip embedding for cost savings — but then future "NPC remembers their own old thought" feature won't work

**Recommendation**: embed in after() block. Cost negligible. Future-proof.

### OQ-2: When does an NPC count as "active"?
Director currently emits `npc_updates[]` for NPCs with mood/goal updates. Should we:
- Use exactly Director's npc_updates as active list (clean · single source of truth) — **my recommendation**
- Add separate "physically present in scene" detection (more accurate but more complex)

### OQ-3: NPC agent voice in cantonese vs mandarin
Story is HK + TW market. Should each NPC agent's inner_thought voice match the story's locale (繁中, can/man dialect)? Or always uniform 繁中?
- I think follow story locale · let voice_sample dictate dialect
- Risk: Haiku 4.5 dialect quality unknown · may need to test with sample stories

### OQ-4: Inner-thought leak detection
We say Narrator must not verbatim-quote. But how do we verify?
- Post-launch audit: log-scan inner_thought ↔ narrative for n-gram overlap >40% as alert
- May be over-engineering · maybe just trust the prompt + add later if real issue

### OQ-5: How does NPC L3 interact with skill checks?
Phase 1.5.2 Skill Check verdict → dice roll → narrate. Where does NPC L3 fit?
- Option A: NPC agents fire BEFORE skill roll · inner_thought reflects anticipation
- Option B: NPC agents fire AFTER skill roll · inner_thought reflects reaction to outcome
- **My recommendation**: B · because NPC reaction is meaningful info to convey · and outcome is needed for grounded thought

### OQ-6: Scene-boundary inner_thought batch summarize
When scene_boundary=true and summarizer fires (Phase 1 P1.6), should we also summarize NPC inner_thoughts from the scene?
- Future "memory journal" UI could show "What 林思雅 was secretly thinking during the confession scene"
- Adds value but adds cost (summarizer call per scene-boundary)
- **Recommendation**: NOT in Phase 1.5 launch · queue for Phase 2 Memory Journal polish

### Risks couldn't resolve via research

- **Anthropic rate limit at scale**: need real-user-load testing post-launch · may need Tier 3+ before public Storyteller launch
- **Cache hit rate in practice**: estimated 70% mid-scene · need real telemetry to confirm
- **Player perception of value**: do users actually FEEL the NPC depth or shrug? Need A/B test with NPC L3 on vs off after launch

---

## 🚀 Recommendation

**SHIP IT NOW · in Phase 1.5 · with Storyteller-tier gate + opt-out toggle.**

This is the highest-leverage feature for our Storyteller tier differentiation. The architecture (Stanford parallel agents · MIRROR 3-step CoT · shallow ToM via L2 sharing · no synthesizer · Narrator-weaves) is well-validated in research and fits naturally onto our existing 4-layer memory + Director infrastructure. The cost overhead is acceptable (~33% per turn at 3 NPCs) and tier-gated so it doesn't hit Adventurer pricing. The biggest open risk is Anthropic rate limit at scale — which we should de-risk by upgrading to Tier 3+ before opening Storyteller subscription to scale.

**Implementation discipline**: follow CLAUDE.md hard rules #5 (Narrative Integrity), #10 (structured output limits), #11+#13 (cache strategy), #15 (RLS write check), #17 (after() not void async), #19 (UI must surface for differentiator to land). 3-cycle audit per rule #29.

---

## 🔗 References

[^1]: Park, J.S. et al. (2023). "Generative Agents: Interactive Simulacra of Human Behavior." UIST '23. https://arxiv.org/abs/2304.03442
[^2]: Memory retrieval formula extracted via web research summary. Original paper Section 4.1.1 specifies α_recency = α_importance = α_relevance = 1 with min-max normalization.
[^3]: Reflection threshold: importance score sum > 150 triggers reflection. Agents reflect ~2-3x per simulated day. Source: Park 2023 §4.2.1.
[^4]: Community estimates of Stanford simulation cost. ar5iv labs HTML version of paper: https://ar5iv.labs.arxiv.org/html/2304.03442
[^5]: Character.AI optimization blog: https://blog.character.ai/optimizing-ai-inference-at-character-ai/ and Hacker News commentary https://news.ycombinator.com/item?id=40876924
[^6]: AI Dungeon analysis: https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/AIDungeon2 and current product page review.
[^7]: NovelAI lorebook documentation: https://docs.novelai.net/en/text/lorebook/
[^8]: Multi-agent framework comparison 2026: https://gurusup.com/blog/best-multi-agent-frameworks-2026 and DataCamp tutorial https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen
[^9]: Enterprise AI multi-agent adoption: https://collabnix.com/multi-agent-and-multi-llm-architecture-complete-guide-for-2025/
[^10]: CrewAI manager pattern critique: https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/
[^11]: MIRROR / ROLETHINK benchmark: Yang et al. 2025. "Guess What I am Thinking: A Benchmark for Inner Thought Reasoning of Role-Playing Language Agents." https://arxiv.org/pdf/2503.08193
[^12]: RoleFact / character hallucination: Zhang et al. 2024. "Mitigating Hallucination in Fictional Character Role-Play." https://arxiv.org/html/2406.17260v2
[^13]: Drama Machine: Wermelinger et al. 2024. "The Drama Machine: Simulating Character Development with LLM Agents." https://arxiv.org/html/2408.01725v2
[^14]: Oguntola, I. 2025. "Theory of Mind in Multi-Agent Systems." CMU-ML-25-118. https://ml.cmu.edu/research/phd-dissertation-pdfs/ioguntol_phd_mld_2025.pdf
[^15]: AgentDiet trajectory reduction: https://arxiv.org/pdf/2509.23586. Token cost compounding in multi-turn.
[^16]: Parallel LLM call latency benchmarks: https://medium.com/@neeldevenshah/concurrent-vs-parallel-execution-in-llm-api-calls and LLMCompiler paper benchmarks.
[^17]: Multi-agent memory engineering: https://mem0.ai/blog/multi-agent-memory-systems and https://www.mongodb.com/company/blog/technical/why-multi-agent-systems-need-memory-engineering
[^18]: Theory of Mind LLM limitations: CMU 2025 dissertation [^14], "Theory of Mind in Multi-Agent LLM Collaboration" NLPer summary: https://nlper.com/2025/07/24/theory-of-mind-multiagent-llm-collaboration/
[^19]: Synthesizer hallucination risk: https://beam.ai/agentic-insights/multi-agent-orchestration-patterns-production
[^20]: Council Mode multi-agent consensus: https://arxiv.org/pdf/2604.02923
[^21]: Claude Haiku 4.5 pricing (current as of May 2026): https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5 and Anthropic API docs https://platform.claude.com/docs/en/about-claude/pricing

### Story Engine internal references

- `CLAUDE.md` § Narrative Integrity Engine · § Hard rules 5-32
- `supabase/migrations/0024_phase1_npc_level2_dynamic_state.sql` (L2 foundation)
- `supabase/migrations/0025_phase1_knowledge_graph_edges.sql` (POV-scoped retrieval via walk_lorebook_graph)
- `web/src/schemas/director.ts` (existing NpcDynamicUpdateSchema · seeds L3 active list)
- `web/src/lib/ai/director.ts` (Director pattern · template for parallel agent design)
- `web/src/app/api/playthroughs/[id]/turn/route.ts` (turn pipeline · step 4 Director · step 4.25 memory refine · step 4.5 skill check · NEW step 4.27 NPC L3)
- `web/src/schemas/character.ts` (character card structure · split static / dynamic for cache · pattern to mirror)
- `web/src/lib/ai/models.ts` (DIRECTOR_MODEL = claude-haiku-4-5 · use same for NPC agents)
