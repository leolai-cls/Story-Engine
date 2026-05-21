import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import { anthropicProvider } from "../providers";
import { DEFAULT_DIRECTOR } from "../models";
import { embedTextSafe } from "../embed";

/**
 * Lorebook entity extractor — Phase 2 memory layer (tier 4).
 *
 * After each AI turn, runs a cheap Haiku call to pull out new entities or
 * updates to existing ones. Entities are upserted by canonical name (case-
 * insensitive) so the same NPC mentioned across many turns accumulates
 * description detail rather than creating duplicates.
 *
 * Cost: ~$0.001 per turn (one Haiku call). Negligible vs Narrator $0.05/turn.
 *
 * Strategy: fire-and-forget from turn route's onFinish. Adds ~1-2s to
 * post-stream server work but doesn't block client.
 *
 * Idempotent via UNIQUE INDEX on (playthrough_id, lower(name)) — re-runs
 * just refresh the latest description / embedding.
 */

const EXTRACTOR_MODEL = DEFAULT_DIRECTOR; // Haiku 4.5

const EXTRACTOR_SYSTEM = `你係 Story Engine 嘅 lorebook archivist。睇完最新一 turn 嘅敘事 + 玩家行動之後，extract 出值得長期記住嘅 entities。

可以 extract 嘅 entity types：
- \`character\` — 出現嘅 NPC（包括路人 / 配角）
- \`place\` — 地點 / 場景（餐廳、街道、家、Office...）
- \`item\` — 物件 / 道具（家傳之寶、特定禮物、武器）
- \`event\` — 故事重要事件（婚禮、衝突、發現秘密）
- \`concept\` — 抽象但 narrative-significant 嘅 idea（家族秘密、社會規則）

每個 entity：
- \`name\` (1-60 字) — 規範化名（用第一次出現嘅 form，唔好混雜縮寫）
- \`entity_type\` — 上面其中一個
- \`description\` (10-280 字) — 1-3 句客觀描述。注意：呢個會 update 已有 entity，所以加重要 NEW details。
- \`keywords\` (0-5 個, 每個 2-30 字) — 用嚟 keyword-match 嘅 alias / 形容詞（e.g., 一個女生角色名 "林思雅" 嘅 keywords: ["林姐", "校花", "內向"]）
- \`always_on\` (boolean) — **大部分 entity 應該 false**。只有 STORY-CRITICAL backbone 嘅嘢設 true（e.g., 主角職業背景、世界 hard rule、核心 NPC），呢啲會每 turn 都注入 prompt。

⚠️ Bias：
- **少而精** — 一 turn 最多 5 個 entity，寧可漏少少都唔好濫
- **新嘅 / 重要嘅優先** — 已 mentioned 過嘅 minor 角色唔需要重新 extract（除非有新細節）
- **唔好 extract 玩家自己** — protagonist 唔需要 lorebook entry
- **過場 NPC 跳過** — 「茶餐廳老闆 (no name)」呢類 walk-on extras 唔需要 entry
- **always_on biased false** — 預設 false，要好 confident 先 set true

如果無嘢值得 extract，返 \`entities: []\`。`;

const ENTITY_TYPES = ["character", "place", "item", "event", "concept"] as const;

const EntitySchema = z.object({
  name: z.string().min(1).max(60),
  entity_type: z.enum(ENTITY_TYPES),
  description: z.string().min(10).max(280),
  keywords: z.array(z.string().min(2).max(30)).max(5),
  always_on: z.boolean(),
});

const ExtractionResultSchema = z.object({
  entities: z.array(EntitySchema).max(5),
});

type ExtractedEntity = z.infer<typeof EntitySchema>;

/**
 * Run extraction on a (userAction, aiNarrative) pair, then upsert each
 * extracted entity with a fresh embedding.
 *
 * Fire-and-forget safe — all errors caught + logged, returns the number of
 * entities upserted (0 on failure).
 */
export async function runLorebookExtraction(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  userAction: string;
  aiNarrative: string;
  protagonistName?: string | null;
}): Promise<number> {
  const { supabase, playthroughId, userAction, aiNarrative, protagonistName } = params;

  // Skip if narrative is too short to have anything to extract
  if (!aiNarrative || aiNarrative.length < 80) {
    return 0;
  }

  try {
    // 1. Call Haiku for structured extraction
    const protagonistContext = protagonistName
      ? `\n\n（主角係 "${protagonistName}" — 唔好 extract protagonist 自己）`
      : "";

    const llmResult = await generateObject({
      model: anthropicProvider(EXTRACTOR_MODEL),
      schema: ExtractionResultSchema,
      system: EXTRACTOR_SYSTEM + protagonistContext,
      prompt: `玩家行動：\n${userAction.slice(0, 500)}\n\nAI 敘事：\n${aiNarrative.slice(0, 4000)}\n\n依照 system prompt 嘅規則 extract entities。`,
      temperature: 0.3,
      maxOutputTokens: 1500,
    });

    const entities = llmResult.object.entities;
    if (!entities || entities.length === 0) return 0;

    // Dedup within this call — same name appearing twice (case-insensitive)
    const seen = new Set<string>();
    const dedupedEntities = entities.filter((e) => {
      const key = e.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      // Filter out protagonist mentions defensively
      if (protagonistName && key === protagonistName.toLowerCase()) return false;
      return true;
    });

    if (dedupedEntities.length === 0) return 0;

    // 2. Embed each entity (name + description as the embedding input —
    //    so "林思雅 — 港大學生..." gets a meaningful vector even if the
    //    name alone is short)
    const embedResults = await Promise.allSettled(
      dedupedEntities.map((e) =>
        embedTextSafe(`${e.name} — ${e.description}`, `lorebook:${e.name}`),
      ),
    );

    // 3. Upsert each (skip ones whose embed failed)
    let upserted = 0;
    for (let i = 0; i < dedupedEntities.length; i++) {
      const entity = dedupedEntities[i];
      const embedSettled = embedResults[i];
      const embed = embedSettled.status === "fulfilled" ? embedSettled.value : null;
      if (!embed) continue;

      const ok = await upsertLorebookEntry({
        supabase,
        playthroughId,
        entity,
        embedding: embed.vector,
      });
      if (ok) upserted++;
    }

    if (upserted > 0) {
      console.log(
        `[lorebook] extracted ${upserted}/${dedupedEntities.length} entities for ${playthroughId} ` +
          `(${dedupedEntities.map((e) => `${e.entity_type}:${e.name}`).join(", ")})`,
      );
    }
    return upserted;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Most likely cause when this fails fresh: migration 0004 not applied
    // (lorebook_entries table missing) → upsert path will surface that.
    // Or LLM rate limit / schema validation. All non-fatal.
    console.warn(`[lorebook] extraction failed: ${msg}`);
    return 0;
  }
}

/**
 * Upsert a single entity. If lorebook_entries table doesn't exist
 * (migration 0004 not applied), logs and returns false silently.
 */
async function upsertLorebookEntry(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  entity: ExtractedEntity;
  embedding: number[];
}): Promise<boolean> {
  const { supabase, playthroughId, entity, embedding } = params;

  // First check if entity exists (so we can MERGE description rather than
  // overwriting — accumulating detail across turns is the whole point).
  const { data: existing, error: selErr } = await supabase
    .from("lorebook_entries")
    .select("id, description, keywords, always_on")
    .eq("playthrough_id", playthroughId)
    .ilike("name", entity.name)
    .maybeSingle();

  if (selErr) {
    const msg = String(selErr.message ?? "");
    if (/relation .* does not exist/i.test(msg)) {
      console.warn("[lorebook] lorebook_entries table missing — apply migration 0004");
      return false;
    }
    console.warn(`[lorebook] select failed for ${entity.name}:`, selErr.message);
    return false;
  }

  if (existing) {
    // Merge: keep existing always_on flag (don't let LLM downgrade story-
    // critical entries); merge keywords (dedupe); replace description if
    // new one is longer / more detailed.
    const mergedKeywords = Array.from(
      new Set([...(existing.keywords ?? []), ...entity.keywords]),
    ).slice(0, 8);
    const newDescription =
      entity.description.length > existing.description.length
        ? entity.description
        : existing.description;

    const { error: updErr } = await supabase
      .from("lorebook_entries")
      .update({
        description: newDescription,
        keywords: mergedKeywords,
        // Only PROMOTE always_on (false → true allowed); never demote
        always_on: existing.always_on || entity.always_on,
        embedding,
      })
      .eq("id", existing.id);

    if (updErr) {
      console.warn(`[lorebook] update failed for ${entity.name}:`, updErr.message);
      return false;
    }
    return true;
  }

  // New entity — insert
  const { error: insErr } = await supabase.from("lorebook_entries").insert({
    playthrough_id: playthroughId,
    entity_type: entity.entity_type,
    name: entity.name,
    description: entity.description,
    keywords: entity.keywords,
    always_on: entity.always_on,
    embedding,
  });

  if (insErr) {
    // UNIQUE conflict on (playthrough_id, lower(name)) means race with
    // another extraction for the same entity — fine, just no-op.
    if (/duplicate key|unique/i.test(insErr.message ?? "")) return false;
    console.warn(`[lorebook] insert failed for ${entity.name}:`, insErr.message);
    return false;
  }
  return true;
}
