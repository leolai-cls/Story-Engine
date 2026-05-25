import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * NPC Agent L3 · POV-scoped memory retrieval.
 *
 * Each NPC agent gets memories filtered to "what this NPC would know".
 * Reuses Migration 0025's `walk_lorebook_graph` RPC with edge_type filter
 * restricted to relational-presence edges:
 *   - attended : NPC was present at the event
 *   - witnessed : NPC observed the event (even if not present)
 *   - located_at : NPC frequently at this place
 *
 * This avoids:
 *   - Per-NPC private memory stream (would need 5× DB schema · sync hell)
 *   - Shared world memory dump (defeats POV differentiation)
 *
 * Pattern from research (pm/research-npc-agent-l3.md Decision 2):
 *   Hybrid · shared L1+L2 ground truth + isolated POV view
 *
 * GRACEFUL DEGRADATION:
 *   - If walk_lorebook_graph RPC missing → return empty array (logged warning)
 *   - If start_name doesn't match any lorebook entry → empty (NPC hasn't been
 *     extracted yet · common in early game · NPC agent works with character
 *     card + L2 state alone)
 *   - Caller (callNpcAgent) treats empty memories as valid · agent will note
 *     "no relevant memories" in reasoning_trace
 */

export type PovMemory = {
  node_id: string;
  node_name: string;
  node_wing: string;
  node_description: string;
  hops: number;
  path_weight: number;
  reached_via_edge_type: string;
};

/**
 * POV edge types · NPC sees memories connected via these relationships.
 * Sourced from Migration 0025 mem_edges enum · subset filtered to
 * presence/observation relationships (NOT relationship edges like loves/hates ·
 * those are L1 disposition territory · NOT POV-relevant memory).
 */
const POV_EDGE_TYPES = ["attended", "witnessed", "located_at"] as const;

export async function retrieveNpcPovMemories(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  /** Canonical NPC name (must match a lorebook_entries.name for this playthrough) */
  npcName: string;
  /** Max 1-3 hop traversal · default 2 */
  maxHops?: number;
  /** Max results returned · default 5 */
  maxResults?: number;
}): Promise<PovMemory[]> {
  const {
    supabase,
    playthroughId,
    npcName,
    maxHops = 2,
    maxResults = 5,
  } = params;

  try {
    const { data, error } = await supabase.rpc("walk_lorebook_graph", {
      p_playthrough_id: playthroughId,
      p_start_name: npcName,
      p_max_hops: maxHops,
      p_max_results: maxResults,
      p_edge_types: POV_EDGE_TYPES as unknown as string[],
    });

    if (error) {
      const msg = String(error.message ?? "");
      if (/does not exist|function .* does not exist/i.test(msg)) {
        console.warn(
          "[npc-agents-retrieval] walk_lorebook_graph RPC missing — apply Migration 0025",
        );
        return [];
      }
      console.warn(
        `[npc-agents-retrieval] walk_lorebook_graph failed for ${npcName}:`,
        msg,
      );
      return [];
    }

    return (data as PovMemory[]) ?? [];
  } catch (e) {
    console.warn(
      `[npc-agents-retrieval] POV retrieval exception for ${npcName}:`,
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

/**
 * Format POV memories into a compact prompt block for NPC agent's user message.
 *
 * Each memory rendered as: [edge_type · node_wing] node_name — description
 *
 * Returns empty string when no memories (caller can skip injecting the block
 * entirely · NPC agent prompt has an "if empty array" fallback path).
 */
export function formatPovMemoriesBlock(memories: PovMemory[]): string {
  if (memories.length === 0) {
    return "(冇相關 POV 記憶 · 用 character card + 當下 scene state 思考)";
  }

  return memories
    .map((m) => {
      const edge = m.reached_via_edge_type
        ? `[${m.reached_via_edge_type}]`
        : "[direct]";
      return `${edge} (${m.node_wing}) **${m.node_name}** — ${m.node_description}`;
    })
    .join("\n");
}
