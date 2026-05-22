"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Star, Flag, Globe, Lock, MessageSquare } from "lucide-react";
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

  function handleFork() {
    setError(null);
    startTransition(async () => {
      const result = await forkStoryToPlaythrough({ storyId });
      if (result.ok) {
        router.push(`/play/${result.data.playthroughId}`);
      } else {
        setError(`唔可以開始故事：${result.error}`);
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

  function handleReport() {
    setError(null);
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
        alert("已 report — moderation team 會 review。");
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
          onClick={handleFork}
          disabled={pending || !isAuthenticated}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isAuthenticated ? "Play This Story" : "登入之後可以玩"}
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
              className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-amber-700"
            >
              {pending ? "儲存中..." : "提交評分"}
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
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "發送中..." : "發送"}
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
              className="rounded-md bg-rose-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-rose-700"
            >
              {pending ? "提交中..." : "提交 Report"}
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
    </div>
  );
}
