"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Star, Flag, Globe, Lock, MessageSquare, Shield, Coins } from "lucide-react";
import {
  forkStoryToPlaythrough,
  publishStory,
  unpublishStory,
  rateStory,
  upsertComment,
  reportContent,
} from "@/lib/community/actions";
import type { StoryRating } from "@/lib/community/queries";

/**
 * Story detail actions — client component for interactive UI.
 *
 * Function tier minimal:
 *   - Play (fork) button → server action → redirect /play/[id]
 *   - Owner: publish / unpublish toggle
 *   - Authenticated: rate (1-5 stars + optional review)
 *   - Authenticated: comment (top-level only at this tier; replies later)
 *   - Authenticated: report (with reason picker)
 *
 * Full UI polish (avatars, animations, threaded replies) defer to UI tier.
 */
export function StoryDetailActions({
  storyId,
  isOwner,
  isAuthenticated,
  currentVisibility,
  myRating,
}: {
  storyId: string;
  isOwner: boolean;
  isAuthenticated: boolean;
  currentVisibility: string;
  myRating: StoryRating | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<"rate" | "comment" | "report" | null>(null);

  const [score, setScore] = useState(myRating?.score ?? 5);
  const [reviewText, setReviewText] = useState(myRating?.review_text ?? "");
  const [commentBody, setCommentBody] = useState("");
  const [reportReason, setReportReason] = useState<
    "spam" | "hate" | "csam" | "illegal" | "harassment" | "sexual_minor" | "other"
  >("spam");
  const [reportDetails, setReportDetails] = useState("");

  // W1-UX-H-01 (Wave 2 audit fix): show "AI 內容審核中..." hint after 800ms
  // of pending state. Comment / review submission adds ~200-500ms of
  // moderation latency that confuses users when the button just says "發送中".
  // 800ms threshold = doesn't flash for fast paths but catches slow ones.
  const [showModerationHint, setShowModerationHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pending) {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setShowModerationHint(true), 800);
    } else {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setShowModerationHint(false);
    }
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [pending]);

  // B2 audit fix · Fork modal (designer redesign · per-playthrough explainer
  // + protagonist name input · model picker uses Settings default). Backend
  // forkStoryToPlaythrough accepts optional characterName.
  const [forkModalOpen, setForkModalOpen] = useState(false);
  const [forkProtagonistName, setForkProtagonistName] = useState("");

  function openForkModal() {
    if (!isAuthenticated) return;
    setError(null);
    setForkProtagonistName("");
    setForkModalOpen(true);
  }

  function confirmFork() {
    setError(null);
    startTransition(async () => {
      const trimmed = forkProtagonistName.trim();
      const result = await forkStoryToPlaythrough({
        storyId,
        characterName: trimmed || undefined,
      });
      if (result.ok) {
        router.push(`/play/${result.data.playthroughId}`);
      } else {
        setError(`唔可以開始故事：${result.error}`);
        setForkModalOpen(false);
      }
    });
  }

  function handlePublishToggle(next: "public" | "private") {
    setError(null);
    startTransition(async () => {
      const result = next === "public" ? await publishStory(storyId) : await unpublishStory(storyId);
      if (!result.ok) {
        setError(`Visibility 變更失敗：${result.error}`);
      } else {
        router.refresh();
      }
    });
  }

  function handleRate() {
    setError(null);
    startTransition(async () => {
      const result = await rateStory({ storyId, score, reviewText: reviewText.trim() || undefined });
      if (result.ok) {
        setOpenPanel(null);
        router.refresh();
      } else {
        setError(`評分失敗：${result.error}`);
      }
    });
  }

  function handleComment() {
    setError(null);
    if (!commentBody.trim()) return;
    startTransition(async () => {
      const result = await upsertComment({ storyId, body: commentBody.trim() });
      if (result.ok) {
        setCommentBody("");
        setOpenPanel(null);
        router.refresh();
      } else {
        setError(`留言失敗：${result.error}`);
      }
    });
  }

  const [reportSuccess, setReportSuccess] = useState(false);
  function handleReport() {
    setError(null);
    setReportSuccess(false);
    startTransition(async () => {
      const result = await reportContent({
        contentType: "story",
        contentId: storyId,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      if (result.ok) {
        setOpenPanel(null);
        setReportDetails("");
        setReportSuccess(true);
        // Auto-dismiss confirmation after 6s
        setTimeout(() => setReportSuccess(false), 6000);
      } else {
        setError(`Report 失敗：${result.error}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Primary action row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={openForkModal}
          disabled={pending || !isAuthenticated}
          className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
          }}
        >
          <Play className="h-4 w-4" />
          {isAuthenticated ? "開始扮演" : "登入之後可以玩"}
        </button>

        {isAuthenticated && (
          <>
            <button
              onClick={() => setOpenPanel(openPanel === "rate" ? null : "rate")}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
            >
              <Star className="h-4 w-4" />
              {myRating ? `你嘅評分：${myRating.score}★` : "評分"}
            </button>
            <button
              onClick={() => setOpenPanel(openPanel === "comment" ? null : "comment")}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
            >
              <MessageSquare className="h-4 w-4" />
              留言
            </button>
            {!isOwner && (
              <button
                onClick={() => setOpenPanel(openPanel === "report" ? null : "report")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Flag className="h-4 w-4" />
                Report
              </button>
            )}
          </>
        )}

        {/* Owner controls */}
        {isOwner && (
          <div className="ml-auto flex gap-2">
            {currentVisibility !== "public" ? (
              <button
                onClick={() => handlePublishToggle("public")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-700"
              >
                <Globe className="h-4 w-4" />
                Publish 公開
              </button>
            ) : (
              <button
                onClick={() => handlePublishToggle("private")}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                <Lock className="h-4 w-4" />
                收返私人
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-300">{error}</div>
      )}
      {reportSuccess && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          已 report — moderation team 會 review。
        </div>
      )}

      {/* Rate panel */}
      {openPanel === "rate" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-4 space-y-3">
          <div className="text-sm font-semibold">評分（1-5 星）</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                className="p-1"
              >
                <Star
                  className={`h-6 w-6 ${
                    n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="留低你嘅感想 (optional, 最多 2000 字)"
            maxLength={2000}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRate}
              disabled={pending}
              className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-amber-700 inline-flex items-center gap-1.5"
            >
              {pending ? (showModerationHint ? (<><Shield className="h-3.5 w-3.5" />AI 審核中...</>) : "儲存中...") : "提交評分"}
            </button>
            <button
              onClick={() => setOpenPanel(null)}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Comment panel */}
      {openPanel === "comment" && (
        <div className="rounded-md border border-input bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">留言</div>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="寫低你想講嘅嘢..."
            maxLength={2000}
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={handleComment}
              disabled={pending || !commentBody.trim()}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {pending ? (showModerationHint ? (<><Shield className="h-3.5 w-3.5" />AI 審核中...</>) : "發送中...") : "發送"}
            </button>
            <button
              onClick={() => setOpenPanel(null)}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Report panel */}
      {openPanel === "report" && (
        <div className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 p-4 space-y-3">
          <div className="text-sm font-semibold">Report 內容</div>
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          >
            <option value="spam">Spam</option>
            <option value="hate">仇恨言論</option>
            <option value="harassment">騷擾</option>
            <option value="csam">CSAM（兒童性 exploitation）</option>
            <option value="sexual_minor">含未成年人性內容</option>
            <option value="illegal">其他違法</option>
            <option value="other">其他</option>
          </select>
          <textarea
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="補充細節 (optional, 最多 1000 字)"
            maxLength={1000}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReport}
              disabled={pending}
              className="rounded-md bg-rose-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-rose-700 inline-flex items-center gap-1.5"
            >
              {pending ? (showModerationHint ? (<><Shield className="h-3.5 w-3.5" />AI 審核中...</>) : "提交中...") : "提交 Report"}
            </button>
            <button
              onClick={() => setOpenPanel(null)}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* B2 audit fix · Fork modal */}
      {forkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "var(--se-overlay)",
            backdropFilter: "blur(6px)",
          }}
          onClick={() => !pending && setForkModalOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-2xl p-7"
            style={{
              background: "var(--se-surface)",
              border: "1px solid var(--se-border-strong)",
              boxShadow: "var(--se-shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="se-mono uppercase"
              style={{
                fontSize: 10.5,
                color: "var(--se-accent)",
                letterSpacing: "0.06em",
              }}
            >
              FORK · NEW PLAYTHROUGH
            </span>
            <h2
              className="text-xl font-semibold m-0 mt-2 mb-2 se-cjk"
              style={{
                letterSpacing: "-0.015em",
                color: "var(--se-fg)",
              }}
            >
              開始扮演
            </h2>
            <p
              className="m-0 text-sm se-cjk"
              style={{
                color: "var(--se-fg-muted)",
                lineHeight: 1.6,
              }}
            >
              你嘅 playthrough 完全獨立 · 唔會影響其他玩家嘅故事。記憶 + state 100% 自己嘅。
            </p>
            <div className="mt-5">
              <label
                className="text-xs block mb-1.5 se-cjk"
                style={{ color: "var(--se-fg-muted)" }}
              >
                主角名字{" "}
                <span style={{ color: "var(--se-fg-dim)" }}>· 留空 = 「主角」default</span>
              </label>
              <input
                type="text"
                value={forkProtagonistName}
                onChange={(e) => setForkProtagonistName(e.target.value)}
                placeholder="例：陳 Sir / 阿傑 / 你嘅名"
                maxLength={50}
                disabled={pending}
                className="w-full px-3.5 h-11 rounded-md text-sm se-cjk"
                style={{
                  background: "var(--se-bg)",
                  border: "1px solid var(--se-border-strong)",
                  color: "var(--se-fg)",
                }}
              />
            </div>
            <div
              className="mt-5 p-3 rounded-lg flex items-center gap-2.5 text-xs se-cjk"
              style={{
                background: "var(--se-surface-2)",
                border: "1px solid var(--se-border)",
                color: "var(--se-fg-muted)",
              }}
            >
              <Coins size={13} color="var(--se-fg-muted)" />
              <span>
                每 turn 約 <span className="se-mono" style={{ color: "var(--se-fg)" }}>2 credits</span>
                {" · 玩到滿意為止 · "}
                <a
                  href="/settings"
                  className="underline"
                  style={{ color: "var(--se-fg-muted)" }}
                >
                  Settings 改 default model
                </a>
              </span>
            </div>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => !pending && setForkModalOpen(false)}
                disabled={pending}
                className="flex-1 h-11 rounded-md text-sm font-medium se-cjk"
                style={{
                  background: "var(--se-surface-2)",
                  color: "var(--se-fg-2)",
                  border: "1px solid var(--se-border)",
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmFork}
                disabled={pending}
                className="flex-1 h-11 rounded-md text-sm font-semibold se-cjk inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{
                  background: "var(--se-fg)",
                  color: "var(--se-bg)",
                }}
              >
                <Play size={13} />
                {pending ? "開緊…" : "開始扮演"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
