/**
 * 沉澱張力 (Character Soul M2 · pm/architecture/03).
 *
 * 角色唔係即時反應 · 經歷累積夠先演化。純邏輯 (無 AI call · 快+免費 ·
 * 對應 07 機械式清潔精神)。
 *
 * 機制：
 *   - 每條經歷 entry 有 weight (0-1 影響大細) + affects[] (觸及邊啲 axis)。
 *   - 同 axis 嘅 weight 累加入 tension。
 *   - tension 超過 threshold (由角色 volatility 計) → 轉成一個 sediment
 *     (已消化嘅演化) · 該 axis accumulated reset。
 *   - sediments 餵俾 Narrator 表示「角色啱啱消化咗一個轉變」。
 *
 * 重大單一事件 (weight 0.9) 一次就過 threshold。細微事 (weight 0.2) 要累積多次。
 * threshold = 1.5 - volatility：固執 (volatility 低) → threshold 高 (難變)；
 * 情緒化 (volatility 高) → threshold 低 (易變)。
 */

export type Tension = {
  axis: string;
  accumulated: number;
  last_turn: number;
};

export type Sediment = {
  axis: string;
  turn: number;
  /** 觸發演化嘅最後一條經歷 (what_happened) · 俾 Narrator context */
  trigger: string;
};

export type PendingTensions = {
  tensions: Tension[];
  sediments: Sediment[];
};

/** 經歷對沉澱嘅輸入 (一條 entry 嘅相關部分) */
export type ExperienceForSediment = {
  weight: number;
  affects: string[];
  what_happened: string;
  turn_index: number;
};

/** volatility (0-1) → threshold。固執低→難變·情緒化高→易變。clamp 防爆。 */
export function thresholdFor(volatility: number): number {
  const v = Math.max(0, Math.min(1, volatility));
  return 1.5 - v; // v=0 → 1.5 (好難變) · v=0.5 → 1.0 · v=1 → 0.5 (好易變)
}

/** 安全 parse DB 嘅 pending_tensions jsonb (容錯)。 */
export function parsePendingTensions(raw: unknown): PendingTensions {
  if (!raw || typeof raw !== "object") return { tensions: [], sediments: [] };
  const obj = raw as Record<string, unknown>;
  const tensions = Array.isArray(obj.tensions)
    ? (obj.tensions as unknown[]).filter(
        (t): t is Tension =>
          !!t &&
          typeof t === "object" &&
          typeof (t as Tension).axis === "string" &&
          typeof (t as Tension).accumulated === "number",
      )
    : [];
  const sediments = Array.isArray(obj.sediments)
    ? (obj.sediments as unknown[]).filter(
        (s): s is Sediment =>
          !!s &&
          typeof s === "object" &&
          typeof (s as Sediment).axis === "string",
      )
    : [];
  return { tensions, sediments };
}

/**
 * 將今回合嘅經歷累加入沉澱張力 · 超 threshold 轉 sediment。純函數。
 *
 * @param current  角色當前 pending_tensions (parse 過)
 * @param experiences  今回合呢個角色嘅新經歷 entries
 * @param volatility  角色易變度 (0-1)
 * @returns 更新後嘅 pending_tensions + 今回合新觸發嘅 sediments (俾 telemetry)
 */
export function accumulateTensions(
  current: PendingTensions,
  experiences: ExperienceForSediment[],
  volatility: number,
): { next: PendingTensions; newSediments: Sediment[] } {
  const threshold = thresholdFor(volatility);
  // 用 map 方便按 axis 累加
  const byAxis = new Map<string, Tension>();
  for (const t of current.tensions) byAxis.set(t.axis, { ...t });

  for (const exp of experiences) {
    for (const axis of exp.affects) {
      const existing = byAxis.get(axis);
      if (existing) {
        existing.accumulated += exp.weight;
        existing.last_turn = exp.turn_index;
      } else {
        byAxis.set(axis, {
          axis,
          accumulated: exp.weight,
          last_turn: exp.turn_index,
        });
      }
    }
  }

  // 檢查邊個 axis 超 threshold → 轉 sediment + reset
  const newSediments: Sediment[] = [];
  const remainingTensions: Tension[] = [];
  for (const t of byAxis.values()) {
    if (t.accumulated >= threshold) {
      // 搵今回合觸發呢個 axis 嘅最後一條經歷做 trigger note
      const trigger =
        [...experiences].reverse().find((e) => e.affects.includes(t.axis))
          ?.what_happened ?? t.axis;
      newSediments.push({ axis: t.axis, turn: t.last_turn, trigger });
      // reset：超出嘅部分唔保留 (一次演化清袋 · 簡單可預測)
    } else {
      remainingTensions.push(t);
    }
  }

  // sediments 保留最近 6 個 (俾 Narrator context · 唔好無限長)
  const allSediments = [...current.sediments, ...newSediments].slice(-6);

  return {
    next: { tensions: remainingTensions, sediments: allSediments },
    newSediments,
  };
}

/**
 * 將 sediments 組成俾 Narrator 嘅一行描述 (塞入角色經歷 block)。
 * 空 = 冇已消化演化。
 */
export function sedimentsToNote(name: string, sediments: Sediment[]): string {
  if (sediments.length === 0) return "";
  const lines = sediments
    .map((s) => `  - 經歷「${s.trigger}」之後 · ${name} 喺「${s.axis}」上面起咗變化`)
    .join("\n");
  return `${name} 已沉澱嘅轉變（呢啲係累積經歷後真正消化咗嘅改變 · 應該體現喺佢而家嘅態度）：\n${lines}`;
}
