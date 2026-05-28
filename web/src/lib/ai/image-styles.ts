/**
 * Phase 8 · Region-based style library (founder UX · 2026-05-28).
 *
 * 10 launch styles: 8 culturally-anchored (🇭🇰 🇯🇵×2 🇰🇷 🇺🇸 🇨🇳 🎬 📷)
 * + 2 culturally-neutral universal (🌃 🐉). Prompt anchors adapted from
 * MIT-licensed twri/sdxl_prompt_styler (Stability AI community library).
 *
 * Architecture:
 *   - Style = name (3 locales) + emoji + prompt prefix/suffix + bestForGenres
 *   - Story picks one as default · per-image-gen can override
 *   - AI suggest top 3 from seed prompt via matchStylesForSeed()
 *
 * v1.1 add-on: individual artist signatures (馬榮成 · 新海誠 · 王家衛 etc.)
 * as Pro tier sub-styles · prompted by descriptor (not artist name) for IP safety.
 */

export type StyleKey =
  | "hk-manhua"
  | "jp-manga"
  | "jp-anime"
  | "kr-webtoon"
  | "us-comic"
  | "cn-ink"
  | "cinematic"
  | "photographic"
  | "cyberpunk"
  | "fantasy-art";

export type StyleDef = {
  key: StyleKey;
  name: { en: string; "zh-Hant": string; "zh-Hans": string };
  emoji: string;
  /** Prefix prepended to the scene prompt (e.g., "Hong Kong manhua style") */
  promptPrefix: string;
  /** Suffix appended after the scene prompt (style + medium descriptors) */
  promptSuffix: string;
  /** Negative prompt fed to providers that support it (e.g., reject anime when generating photographic) */
  negativePrompt: string;
  /** Story genres that this style fits best · used for AI suggest at story creation */
  bestForGenres: string[];
};

export const KIEIO_STYLES: Record<StyleKey, StyleDef> = {
  "hk-manhua": {
    key: "hk-manhua",
    name: {
      en: "🇭🇰 HK Manhua",
      "zh-Hant": "🇭🇰 港式漫畫風",
      "zh-Hans": "🇭🇰 港式漫画风",
    },
    emoji: "🇭🇰",
    promptPrefix: "Hong Kong manhua style illustration",
    promptSuffix:
      "dynamic action lines, bold ink shadows, 90s comic era, sharp character outlines, dramatic poses, vibrant flat color blocks, era of Storm Riders",
    negativePrompt: "anime, manga screentone, photorealistic, 3d render, soft pastel",
    bestForGenres: ["武俠", "古惑仔", "都市英雄", "黑幫", "動作"],
  },
  "jp-manga": {
    key: "jp-manga",
    name: {
      en: "🇯🇵 Japanese Manga",
      "zh-Hant": "🇯🇵 日本漫畫風",
      "zh-Hans": "🇯🇵 日本漫画风",
    },
    emoji: "🇯🇵",
    promptPrefix: "Japanese manga panel",
    promptSuffix:
      "black and white, screentone shading, dynamic panel composition, expressive eyes, speed lines, classical shonen / seinen manga aesthetic",
    negativePrompt: "color illustration, photorealistic, 3d render",
    bestForGenres: ["少年熱血", "推理", "校園", "格鬥", "懸疑"],
  },
  "jp-anime": {
    key: "jp-anime",
    name: {
      en: "🌸 Japanese Anime",
      "zh-Hant": "🌸 日系動漫",
      "zh-Hans": "🌸 日系动漫",
    },
    emoji: "🌸",
    promptPrefix: "Japanese anime artwork",
    promptSuffix:
      "vibrant colors, soft cel-shading, atmospheric lighting, Studio Ghibli inspired soft pastel, detailed background scenery, expressive emotion",
    negativePrompt: "photorealistic, 3d render, western comic, oil painting",
    bestForGenres: ["戀愛校園", "異世界", "治癒", "玄幻", "純愛"],
  },
  "kr-webtoon": {
    key: "kr-webtoon",
    name: {
      en: "🇰🇷 Korean Webtoon",
      "zh-Hant": "🇰🇷 韓式 Webtoon",
      "zh-Hans": "🇰🇷 韩式 Webtoon",
    },
    emoji: "🇰🇷",
    promptPrefix: "Korean webtoon style digital painting",
    promptSuffix:
      "soft digital watercolor, pastel color palette, clean outlines, modern character design, vertical composition friendly, cinematic lighting",
    negativePrompt: "black and white manga, photorealistic, oil painting",
    bestForGenres: ["都市戀愛", "修真重生", "都市異能", "純愛", "輕小說"],
  },
  "us-comic": {
    key: "us-comic",
    name: {
      en: "🇺🇸 American Comic",
      "zh-Hant": "🇺🇸 美漫風",
      "zh-Hans": "🇺🇸 美漫风",
    },
    emoji: "🇺🇸",
    promptPrefix: "American superhero comic book illustration",
    promptSuffix:
      "bold thick inks, saturated colors, halftone dots, dynamic action poses, dramatic foreshortening, Marvel and DC era aesthetic",
    negativePrompt: "anime, manga, photorealistic, watercolor",
    bestForGenres: ["超能力", "反英雄", "動作", "科幻", "都市英雄"],
  },
  "cn-ink": {
    key: "cn-ink",
    name: {
      en: "🇨🇳 Chinese Ink Wash",
      "zh-Hant": "🇨🇳 國風水墨",
      "zh-Hans": "🇨🇳 国风水墨",
    },
    emoji: "🇨🇳",
    promptPrefix: "Chinese ink wash painting",
    promptSuffix:
      "traditional 水墨 brush strokes, misty mountains, calligraphy aesthetic, Song dynasty composition, atmospheric perspective, restrained color palette with ink black accents",
    negativePrompt: "anime, photorealistic, vivid neon, 3d render",
    bestForGenres: ["仙俠", "古風", "武俠", "歷史", "玄幻"],
  },
  cinematic: {
    key: "cinematic",
    name: {
      en: "🎬 Cinematic",
      "zh-Hant": "🎬 電影感",
      "zh-Hans": "🎬 电影感",
    },
    emoji: "🎬",
    promptPrefix: "cinematic film still",
    promptSuffix:
      "shallow depth of field, vignette, moody atmospheric lighting, 35mm anamorphic lens, dramatic chiaroscuro, color grading reminiscent of Christopher Doyle cinematography",
    negativePrompt: "anime, cartoon, illustration, drawing",
    bestForGenres: ["都市現代", "黑幫", "文藝", "驚悚", "懸疑"],
  },
  photographic: {
    key: "photographic",
    name: {
      en: "📷 Photographic",
      "zh-Hant": "📷 寫實攝影",
      "zh-Hans": "📷 写实摄影",
    },
    emoji: "📷",
    promptPrefix: "professional photograph",
    promptSuffix:
      "35mm photography, highly detailed, sharp focus, natural lighting, documentary realism, sports photography energy",
    negativePrompt: "anime, illustration, drawing, painting",
    bestForGenres: ["NBA", "體育", "紀錄", "現代", "職場"],
  },
  cyberpunk: {
    key: "cyberpunk",
    name: {
      en: "🌃 Cyberpunk",
      "zh-Hant": "🌃 賽博朋克",
      "zh-Hans": "🌃 赛博朋克",
    },
    emoji: "🌃",
    promptPrefix: "neonpunk cyberpunk style",
    promptSuffix:
      "vaporwave aesthetic, vibrant neon colors, high contrast lighting, futuristic cityscape, holographic interfaces, rain-slicked streets, Blade Runner inspired",
    negativePrompt: "rural, daylight, soft pastel, watercolor",
    bestForGenres: ["反烏托邦", "黑客", "末世", "未來都市", "科幻"],
  },
  "fantasy-art": {
    key: "fantasy-art",
    name: {
      en: "🐉 Fantasy Art",
      "zh-Hant": "🐉 奇幻插畫",
      "zh-Hans": "🐉 奇幻插画",
    },
    emoji: "🐉",
    promptPrefix: "ethereal fantasy concept art",
    promptSuffix:
      "magnificent celestial atmosphere, magical aura, epic landscape, detailed armor and weaponry, mythical creatures, painterly digital art, ArtStation quality",
    negativePrompt: "modern, urban, photorealistic, anime cute",
    bestForGenres: ["D&D", "玄幻", "異世界", "奇幻", "仙俠"],
  },
};

export const STYLE_KEYS = Object.keys(KIEIO_STYLES) as StyleKey[];

/**
 * Given a story seed prompt + content_rating, suggest top 3 styles ranked
 * by genre keyword overlap. Used at story creation to pre-select a default.
 *
 * Cheap · pure string match · no LLM call. AI auto-suggest sweetener
 * can run as an optional secondary pass (LLM grades suggestions).
 */
export function matchStylesForSeed(seedText: string): StyleKey[] {
  const lower = seedText.toLowerCase();
  const scores: Record<StyleKey, number> = {} as Record<StyleKey, number>;

  for (const key of STYLE_KEYS) {
    const def = KIEIO_STYLES[key];
    let score = 0;
    for (const genre of def.bestForGenres) {
      if (seedText.includes(genre)) score += 2;
      // also match latin transliteration for cross-locale
      const genreLower = genre.toLowerCase();
      if (genreLower !== genre && lower.includes(genreLower)) score += 1;
    }
    scores[key] = score;
  }

  // Sort by score desc · break ties by preset order
  const ranked = STYLE_KEYS.slice().sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return STYLE_KEYS.indexOf(a) - STYLE_KEYS.indexOf(b);
  });

  // If no style scored > 0 · default to cinematic (most universal)
  if (scores[ranked[0]] === 0) return ["cinematic", "photographic", "jp-anime"];

  return ranked.slice(0, 3);
}

/**
 * Compose final image-gen prompt by merging:
 *   - style preset prompt prefix/suffix
 *   - scene context (turn summary)
 *   - character visual descriptions
 */
export function composeStyledPrompt(opts: {
  styleKey: StyleKey | null;
  customPrompt?: string | null;
  scenePrompt: string;
  characterDescriptions?: string[];
}): { positive: string; negative: string } {
  if (opts.customPrompt) {
    return { positive: opts.customPrompt, negative: "" };
  }

  const style = opts.styleKey ? KIEIO_STYLES[opts.styleKey] : null;
  const styleP = style?.promptPrefix ?? "";
  const styleS = style?.promptSuffix ?? "";
  const styleN = style?.negativePrompt ?? "";

  const chars = (opts.characterDescriptions ?? []).filter(Boolean).join("; ");
  const charBlock = chars ? `\nCharacters in scene: ${chars}` : "";

  const positive = [styleP, "of", opts.scenePrompt, charBlock, styleS]
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+·\s+·\s+/g, " · ")
    .trim();

  return { positive, negative: styleN };
}

/** Aspect ratio per image type (1024-base width). */
export function aspectForImageType(
  imageType: "illustration" | "comic" | "wallpaper",
): { width: number; height: number; ratio: string } {
  switch (imageType) {
    case "illustration":
      return { width: 1024, height: 576, ratio: "16:9" };
    case "comic":
      return { width: 1024, height: 768, ratio: "4:3" };
    case "wallpaper":
      return { width: 768, height: 1664, ratio: "9:19.5" };
  }
}
