/**
 * Per-locale copy for marketing landing + pricing.
 *
 * 2026-06-11 redesign (taste-skill pass · founder-approved mockup
 * website-redesign-2026-06-11.html). Structure follows the new landing:
 * nav / hero / stream / how (3 acts) / memory (bento) / agents (inner voices) /
 * adaptive / bilingual / adult / cta.
 *
 * Copy rules applied (and to keep):
 *   - ONE signup label per locale, reused verbatim in nav + hero + final CTA
 *     (duplicate-CTA-intent ban).
 *   - ZERO em-dashes anywhere (taste-skill hard ban).
 *   - Adult section = 18+ SELF-ATTEST (KYC was cancelled · ADR-023). The old
 *     copy advertised Stripe Identity KYC, which no longer exists. Never
 *     reintroduce it here without a product change.
 *   - NPC inner voices = PAID plans (Standard 1 / Pro 3 per turn · auto-on for
 *     paid tiers since 2026-06-10), NOT Pro-exclusive.
 *
 * Strict separation: each locale's strings contain ONLY that locale's
 * language. Brand "KIEIO" + the "(o)" mark stay across locales.
 */

export type MarketingLang = "en" | "zhHant" | "zhHans";

export const MARKETING_COPY = {
  // ─── NAV ───────────────────────────────────────────
  nav: {
    en: { how: "How it works", memory: "Memory", pricing: "Pricing" },
    zhHant: { how: "點玩", memory: "記憶", pricing: "訂價" },
    zhHans: { how: "怎么玩", memory: "记忆", pricing: "订价" },
  },

  // ─── SIGNUP CTA · one label per locale, used in nav + hero + cta ──
  signup: {
    en: "Start your first life free",
    zhHant: "免費開始第一段人生",
    zhHans: "免费开始第一段人生",
  },

  // ─── HERO ──────────────────────────────────────────
  hero: {
    en: {
      titleLine1: "Write a line.",
      titleLine2Pre: "Live a ",
      titleAccent: "life",
      titleSuffix: ".",
      sub: "One sentence becomes a world and a cast with minds of their own. The story remembers everything you do.",
      ctaSecondary: "See how it works",
      previewTitle: "The Inn at Midnight",
      previewInputHint: "What do you say to Mei?",
      chat: {
        m1Who: "Mei · Innkeeper",
        m1Text: "The inn smells of cold tea and damp wool. Mei sets down her ledger, looks at you. “You’re ",
        m1Em: "late",
        m1Post: ".”",
        m2Who: "You",
        m2Text: "“Sorry. The river was higher than I expected.”",
        m3Who: "Mei · Innkeeper",
        m3Text: "Her brow tightens, then softens. “You said that last time.” She slides a bowl of hot tea across the counter.",
        m3Mem: "Mei remembers what you said on turn 87",
        m4Who: "Narrator",
        m4Text: "She has been waiting. You are not as forgotten as you hoped.",
      },
    },
    zhHant: {
      titleLine1: "寫一句說話。",
      titleLine2Pre: "活出一段",
      titleAccent: "人生",
      titleSuffix: "。",
      sub: "一句說話，變成一個世界、一班有自己諗法嘅角色。你做過嘅每件事，個故事都會記得。",
      ctaSecondary: "睇下點玩",
      previewTitle: "深夜客棧",
      previewInputHint: "你會點答阿美？",
      chat: {
        m1Who: "阿美 · 掌櫃",
        m1Text: "客棧聞到冷茶同濕羊毛嘅味。阿美放低本帳簿，望住你。「你",
        m1Em: "遲咗",
        m1Post: "。」",
        m2Who: "你",
        m2Text: "「對唔住，條河比預期高。」",
        m3Who: "阿美 · 掌櫃",
        m3Text: "佢嘅眉皺咗一陣，然後鬆開。「上次你都係咁講。」佢遞返一碗熱茶過嚟。",
        m3Mem: "阿美記得你第 87 回合講過嘅嘢",
        m4Who: "敘事者",
        m4Text: "佢一直喺度等緊你。原來你冇你想像中咁被人忘記。",
      },
    },
    zhHans: {
      titleLine1: "写一句话。",
      titleLine2Pre: "活出一段",
      titleAccent: "人生",
      titleSuffix: "。",
      sub: "一句话，变成一个世界、一群有自己想法的角色。你做过的每件事，故事都会记得。",
      ctaSecondary: "看怎么玩",
      previewTitle: "深夜客栈",
      previewInputHint: "你会怎么回答阿美？",
      chat: {
        m1Who: "阿美 · 掌柜",
        m1Text: "客栈里飘着冷茶和湿羊毛的味道。阿美放下账簿，看着你。「你",
        m1Em: "迟到了",
        m1Post: "。」",
        m2Who: "你",
        m2Text: "「对不起，河水比预期高。」",
        m3Who: "阿美 · 掌柜",
        m3Text: "她眉头皱了一下，又松开。「上次你也是这么说。」她把一碗热茶推过来。",
        m3Mem: "阿美记得你第 87 回合说过的话",
        m4Who: "叙述者",
        m4Text: "她一直在等。原来你没有你想像中那么被人遗忘。",
      },
    },
  },

  // ─── STREAM (story folder set piece) ───────────────
  stream: {
    en: {
      titlePre: "One folder. ",
      titleAccent: "A million lives.",
      lede: "The community opens new stories every day. Wuxia, romance, the end of the world, a quiet mystery. A life is waiting for you to step in.",
    },
    zhHant: {
      titlePre: "一個資料夾，",
      titleAccent: "百萬個人生。",
      lede: "社群每日都喺度開新故事。武俠、戀愛、末世、懸疑，總有一段人生等緊你行入去。",
    },
    zhHans: {
      titlePre: "一个文件夹，",
      titleAccent: "百万种人生。",
      lede: "社区每天都在开新故事。武侠、恋爱、末世、悬疑，总有一段人生等着你走进去。",
    },
  },

  // ─── HOW · 3 acts ──────────────────────────────────
  how: {
    en: {
      eyebrow: "How it works",
      title: "Three steps. One life.",
      lede: "You write a single line. KIEIO builds a world from it. Characters arrive with memory, opinions, and plans of their own.",
      act1Title: "Write a seed",
      act1Body: "A line, a paragraph, a premise. Write as much or as little as you like; the AI builds from here.",
      act1Tag: "Your input",
      act1Panel: "An inn at midnight. The keeper studies a stranger who arrived too late.",
      act2Title: "Enter the world",
      act2Body: "KIEIO sets the scene, fills it with people, and hands you the protagonist. The narrator listens before it speaks.",
      act2Tag: "World generated",
      act2Panel: "The inn smells of cold tea and damp wool. Mei sets down her ledger. The rain has not let up in three days. “You’re late,” she says. She does not ask your name.",
      act3Title: "Live a life",
      act3Body: "Speak, act, choose. Every consequence carries weight, and the world bends around what you have done.",
      act3Tag: "Your move",
      act3Choice1: "“I’m sorry. The river was higher than I expected.”",
      act3Choice2: "Sit down without answering. Let the silence speak.",
      act3Choice3: "“Do you remember me, Mei?”",
    },
    zhHant: {
      eyebrow: "點玩",
      title: "三步，一段人生。",
      lede: "你寫一句說話，KIEIO 由嗰句說話起一個世界。角色會出現，有記憶、有立場、有自己嘅打算。",
      act1Title: "寫一粒種子",
      act1Body: "一句、一段、一個前提。寫幾多都得，AI 會由呢度開始起世界。",
      act1Tag: "你嘅輸入",
      act1Panel: "客棧。半夜。掌櫃望住一個遲到嘅陌生人。",
      act2Title: "行入個世界",
      act2Body: "KIEIO 起好場景、放入角色，將主角交俾你。敘事者會聽你講先，先答。",
      act2Tag: "世界生成",
      act2Panel: "客棧聞到冷茶同濕羊毛嘅味。阿美放低本帳簿。雨已經落咗三日。「你遲咗。」佢冇問你個名。",
      act3Title: "活一段人生",
      act3Body: "講嘢、行動、揀。每個後果都有重量，個世界會跟你做過嘅嘢變化。",
      act3Tag: "到你揀",
      act3Choice1: "「對唔住。條河比預期高。」",
      act3Choice2: "唔出聲，坐低先。等沉默講嘢。",
      act3Choice3: "「阿美，你仲記唔記得我？」",
    },
    zhHans: {
      eyebrow: "怎么玩",
      title: "三步，一段人生。",
      lede: "你写一句话，KIEIO 从那句话开始建一个世界。角色会出现，有记忆、有立场、有自己的打算。",
      act1Title: "写下一颗种子",
      act1Body: "一句、一段、一个前提。写多写少都行，AI 会从这里开始建世界。",
      act1Tag: "你的输入",
      act1Panel: "客栈。半夜。掌柜看着一个迟到的陌生人。",
      act2Title: "走进那个世界",
      act2Body: "KIEIO 搭好场景、放入角色，把主角交给你。叙述者会先听你说，再回答。",
      act2Tag: "世界生成",
      act2Panel: "客栈飘着冷茶和湿羊毛的味道。阿美放下账簿。雨已经下了三天。「你迟到了。」她没问你的名字。",
      act3Title: "活一段人生",
      act3Body: "说话、行动、选择。每个后果都有重量，世界会随你做过的事而改变。",
      act3Tag: "该你选",
      act3Choice1: "「对不起。河水比预期高。」",
      act3Choice2: "不出声，先坐下。让沉默说话。",
      act3Choice3: "「阿美，你还记得我吗？」",
    },
  },

  // ─── MEMORY · bento ────────────────────────────────
  memory: {
    en: {
      eyebrow: "Memory system",
      titlePre: "NPCs ",
      titleAccent: "remember",
      titleSuffix: ".",
      lede: "Not just the last three messages. Four layers of memory hold what you did, who you hurt, who you loved. Two hundred turns later, it is all still there.",
      bigK: "Emotional memory",
      bigTitle: "How they feel",
      bigBody: "Trust, suspicion, affection, grudges. NPCs carry their feelings forward and can hold a grudge for two hundred turns. Forgiving you is their decision, not yours.",
      bigFrag: "“You said that last time.” She slides the tea across, but does not look at you.",
      bigFragMeta: "Turn 247 · Mei’s trust in you: low",
      c1K: "Recent memory",
      c1Title: "What just happened",
      c1Body: "The latest exchanges, tone, and mood. “Mei looks at you” needs no footnote about who Mei is.",
      c2K: "World knowledge",
      c2Title: "Who is who",
      c2Body: "Names, relationships, the shape of the world. Mei keeps the inn, the river floods every spring, and you are a courier who lost something.",
      c3K: "Living lorebook",
      c3Title: "What the world knows",
      c3Body: "Every character, place, and promise, organised automatically into a living lorebook. It finds “the person you owed last spring” even if you never said the name.",
      statNum: "200+",
      statLabel: "turns later, still remembered",
    },
    zhHant: {
      eyebrow: "記憶系統",
      titlePre: "NPC ",
      titleAccent: "會記得",
      titleSuffix: "。",
      lede: "唔係淨係記得最近三句。四層記憶記住你做過咩、傷害過邊個、愛過邊個。二百個回合之後都記得。",
      bigK: "情感記憶",
      bigTitle: "佢哋點 feel",
      bigBody: "信任、懷疑、好感、仇恨。NPC 會帶住情緒繼續行，可以記恨足二百個回合。原諒同記仇，都係佢哋自己決定。",
      bigFrag: "「上次你都係咁講。」佢遞返一碗熱茶過嚟，但冇望你。",
      bigFragMeta: "第 247 回合 · 阿美對你嘅信任：低",
      c1K: "即時記憶",
      c1Title: "啱啱發生過",
      c1Body: "最近嘅對話、語氣、氣氛。「阿美望住你」唔使再解釋阿美係邊個。",
      c2K: "世界知識",
      c2Title: "邊個係邊個",
      c2Body: "名、關係、世界嘅形狀。阿美係掌櫃，條河每年春天會浸，你係個失咗嘢嘅信差。",
      c3K: "世界設定集",
      c3Title: "個世界知道嘅嘢",
      c3Body: "每個角色、地方、承諾，AI 自動整理成活嘅設定集。就算你冇講過個名，佢都搵得返「上年春天你欠落嗰個人」。",
      statNum: "200+",
      statLabel: "回合之後仍然記得",
    },
    zhHans: {
      eyebrow: "记忆系统",
      titlePre: "NPC ",
      titleAccent: "记得",
      titleSuffix: "。",
      lede: "不是只记得最近三句。四层记忆记住你做过什么、伤害过谁、爱过谁。两百个回合之后，依然记得。",
      bigK: "情感记忆",
      bigTitle: "他们的感受",
      bigBody: "信任、怀疑、好感、仇恨。NPC 会带着情绪继续走，可以记仇整整两百个回合。原谅还是记仇，都由他们自己决定。",
      bigFrag: "「上次你也是这么说。」她把热茶推过来，但没有看你。",
      bigFragMeta: "第 247 回合 · 阿美对你的信任：低",
      c1K: "即时记忆",
      c1Title: "刚刚发生的事",
      c1Body: "最近的对话、语气、氛围。「阿美看着你」不用再解释阿美是谁。",
      c2K: "世界知识",
      c2Title: "谁是谁",
      c2Body: "名字、关系、世界的样子。阿美是掌柜，河水每年春天泛滥，你是个丢了东西的信差。",
      c3K: "世界设定集",
      c3Title: "世界知道的事",
      c3Body: "每个角色、地点、承诺，AI 自动整理成活的设定集。就算你没说过名字，它也找得回「去年春天你欠下的那个人」。",
      statNum: "200+",
      statLabel: "回合之后仍然记得",
    },
  },

  // ─── AGENTS · NPC inner voices (paid plans) ────────
  agents: {
    en: {
      titlePre: "Every NPC has a ",
      titleAccent: "hidden mind",
      titleSuffix: ".",
      lede: "Ordinary NPCs answer you. KIEIO’s NPCs think: every turn, each character on stage runs their own inner monologue. What they hide, what they plan, how they really feel, and the story follows their secrets.",
      pill: "Paid plans: Standard thinks with 1 NPC per turn, Pro up to 3",
      t1Who: "Mei · Innkeeper",
      t1Surface: "Pours your tea.",
      t1Inner: "Counts how many times this stranger has shown up late. Three now. The favour is becoming a debt.",
      t2Who: "Old Wei · Bandit",
      t2Surface: "Laughs at your joke.",
      t2Inner: "Wonders if you noticed his hand drifting toward the knife. Decides: not yet. The boss said wait.",
      t3Who: "Lin · Magistrate’s daughter",
      t3Surface: "Corrects your accent.",
      t3Inner: "Hopes you keep talking. Her father would never let her marry a courier. She knows. She slows down anyway.",
    },
    zhHant: {
      titlePre: "每個 NPC 都有",
      titleAccent: "收埋嘅心事",
      titleSuffix: "。",
      lede: "一般嘅 NPC 答你。KIEIO 嘅 NPC 識諗：每個回合，每個出場角色都有自己嘅內心戲。佢收緊咩、打緊咩主意、真係點 feel，敘事會跟住佢哋嘅秘密走。",
      pill: "付費方案功能：Standard 每回合 1 個角色思考，Pro 最多 3 個",
      t1Who: "阿美 · 掌櫃",
      t1Surface: "倒茶俾你。",
      t1Inner: "數住呢個陌生人遲到幾多次。第三次喇。份人情，變緊一筆債。",
      t2Who: "老韋 · 山賊",
      t2Surface: "聽你個笑話笑。",
      t2Inner: "諗緊你有冇留意到佢隻手向住把刀飄。決定：未到時候，大佬叫等。",
      t3Who: "小林 · 縣令女兒",
      t3Surface: "糾正你嘅口音。",
      t3Inner: "希望你繼續講落去。爸爸唔會俾佢嫁一個信差。佢知，但佢仲係講慢咗。",
    },
    zhHans: {
      titlePre: "每个 NPC 都有",
      titleAccent: "藏起来的心事",
      titleSuffix: "。",
      lede: "一般的 NPC 回答你。KIEIO 的 NPC 会思考：每个回合，每个出场角色都有自己的内心戏。他在隐藏什么、在打什么主意、真正怎么想，叙事会跟着他们的秘密走。",
      pill: "付费方案功能：Standard 每回合 1 个角色思考，Pro 最多 3 个",
      t1Who: "阿美 · 掌柜",
      t1Surface: "给你倒茶。",
      t1Inner: "数着这个陌生人迟到了几次。第三次了。这份人情，正在变成一笔债。",
      t2Who: "老韦 · 山贼",
      t2Surface: "听你的笑话笑。",
      t2Inner: "在想你有没有注意到他的手往刀那边靠。决定：还没到时候，老大叫等。",
      t3Who: "小林 · 县令女儿",
      t3Surface: "纠正你的口音。",
      t3Inner: "希望你继续讲下去。父亲不会让她嫁给一个信差。她知道，但她还是放慢了语速。",
    },
  },

  // ─── ADAPTIVE · per-story interface ────────────────
  adaptive: {
    en: {
      titlePre: "Every story builds ",
      titleAccent: "its own interface",
      titleSuffix: ".",
      lede: "A romance shows moods and relationships. An adventure shows health, stats and a backpack. A sports story shows stamina and box scores. The AI designs each story’s panel the moment you create it.",
      p1Tag: "Adventure · Dungeon crawl",
      p1Rows: [
        ["HP", "24 / 30"],
        ["MP", "8 / 12"],
        ["Strength", "14"],
        ["Agility", "12"],
        ["Intellect", "16"],
        ["Gold", "142"],
        ["Backpack", "Iron sword · Healing potion ×3"],
      ],
      p2Tag: "Romance · Campus",
      p2Rows: [
        ["With Lin Si-nga", "Close"],
        ["Mood", "Nervous"],
        ["Gifts", "Roses ×2 · Chocolate"],
      ],
      p3Tag: "Sports · Rookie season",
      p3Rows: [
        ["Stamina", "72%"],
        ["Tonight", "18 pts · 5 reb · 7 ast"],
        ["Coach’s trust", "High"],
      ],
    },
    zhHant: {
      titlePre: "每個故事，",
      titleAccent: "自己嘅介面",
      titleSuffix: "。",
      lede: "戀愛故事有心情同關係。冒險故事有血量、屬性同背包。運動故事有體力同數據。AI 喺你創作嗰刻，幫個故事設計佢自己嘅一套。",
      p1Tag: "冒險 · 地下城",
      p1Rows: [
        ["生命值", "24 / 30"],
        ["法力", "8 / 12"],
        ["力量", "14"],
        ["敏捷", "12"],
        ["智力", "16"],
        ["金幣", "142"],
        ["背包", "鐵劍 · 治療藥水 ×3"],
      ],
      p2Tag: "戀愛 · 校園",
      p2Rows: [
        ["同林思雅嘅關係", "親近"],
        ["心情", "緊張"],
        ["禮物", "玫瑰 ×2 · 朱古力"],
      ],
      p3Tag: "運動 · 籃球新秀",
      p3Rows: [
        ["體力", "72%"],
        ["今場數據", "18 分 · 5 籃板 · 7 助攻"],
        ["教練信任", "高"],
      ],
    },
    zhHans: {
      titlePre: "每个故事，",
      titleAccent: "自己的界面",
      titleSuffix: "。",
      lede: "恋爱故事有心情和关系。冒险故事有血量、属性和背包。运动故事有体力和数据。AI 在你创作的那一刻，为这个故事设计它自己的一套。",
      p1Tag: "冒险 · 地下城",
      p1Rows: [
        ["生命值", "24 / 30"],
        ["法力", "8 / 12"],
        ["力量", "14"],
        ["敏捷", "12"],
        ["智力", "16"],
        ["金币", "142"],
        ["背包", "铁剑 · 治疗药水 ×3"],
      ],
      p2Tag: "恋爱 · 校园",
      p2Rows: [
        ["和林思雅的关系", "亲近"],
        ["心情", "紧张"],
        ["礼物", "玫瑰 ×2 · 巧克力"],
      ],
      p3Tag: "运动 · 篮球新秀",
      p3Rows: [
        ["体力", "72%"],
        ["本场数据", "18 分 · 5 篮板 · 7 助攻"],
        ["教练信任", "高"],
      ],
    },
  },

  // ─── BILINGUAL ─────────────────────────────────────
  bilingual: {
    en: {
      titlePre: "Your story, in ",
      titleAccent: "Cantonese",
      titleSuffix: ".",
      lede: "KIEIO’s characters speak Cantonese, Traditional Chinese and Mandarin like real people. They have moods and personalities, they push back, they forgive, they remember. Every story belongs to you alone.",
      stat1Num: "繁中",
      stat1Label: "Default language",
      stat2Num: "廣東話",
      stat2Label: "Native Cantonese",
      stat3Num: "200+",
      stat3Label: "turns of memory",
      stat4Num: "∞",
      stat4Label: "One seed, endless stories",
    },
    zhHant: {
      titlePre: "用",
      titleAccent: "廣東話",
      titleSuffix: "講你嘅故事。",
      lede: "KIEIO 嘅角色識講廣東話、繁中、普通話，同你講人話。佢哋有自己嘅情緒同性格，會反駁你、會原諒你、會記住你。每一個故事都係屬於你一個人。",
      stat1Num: "繁中",
      stat1Label: "預設語言",
      stat2Num: "廣東話",
      stat2Label: "母語級數",
      stat3Num: "200+",
      stat3Label: "回合記憶",
      stat4Num: "∞",
      stat4Label: "一粒種子，無限故事",
    },
    zhHans: {
      titlePre: "用",
      titleAccent: "中文",
      titleSuffix: "讲你的故事。",
      lede: "KIEIO 的角色会讲普通话、简中、繁中、广东话，跟你说人话。他们有自己的情绪和性格，会反驳你、会原谅你、会记住你。每一个故事都只属于你一个人。",
      stat1Num: "简中",
      stat1Label: "母语级数",
      stat2Num: "普通话",
      stat2Label: "原生支持",
      stat3Num: "200+",
      stat3Label: "回合记忆",
      stat4Num: "∞",
      stat4Label: "一颗种子，无限故事",
    },
  },

  // ─── ADULT · 18+ self-attest (NO KYC · ADR-023) ────
  adult: {
    en: {
      eyebrow: "Mature content · opt-in",
      title: "Adult stories, handled with care.",
      p: "KIEIO supports mature themes, and everything is in your hands: confirm you are 18 or older and it unlocks. Off by default, never on the front page, no surprises.",
      pill1: "Your choice",
      pill2: "18+ self-attest",
      pill3: "Off by default",
      pill4: "Fully separate from the home page",
    },
    zhHant: {
      eyebrow: "成人內容 · 自主開啟",
      title: "成人故事，認真處理。",
      p: "KIEIO 支援成人題材，但一切由你話事：聲明自己年滿 18 歲先開到，預設關閉，永遠唔會出現喺首頁，唔會突襲你。",
      pill1: "自主選擇",
      pill2: "18+ 自我聲明",
      pill3: "預設關閉",
      pill4: "同主頁完全分隔",
    },
    zhHans: {
      eyebrow: "成人内容 · 自主开启",
      title: "成人故事，认真处理。",
      p: "KIEIO 支持成人题材，但一切由你决定：声明自己年满 18 岁才能开启，默认关闭，永远不会出现在首页，不会突袭你。",
      pill1: "自主选择",
      pill2: "18+ 自我声明",
      pill3: "默认关闭",
      pill4: "与主页完全分隔",
    },
  },

  // ─── CTA ───────────────────────────────────────────
  cta: {
    en: {
      titlePre: "Begin your ",
      titleAccent: "first life",
      titleSuffix: ".",
      lede: "The first story is always free. Write one line and step inside.",
      ctaSecondary: "Browse the library",
    },
    zhHant: {
      titlePre: "開始你嘅",
      titleAccent: "第一段人生",
      titleSuffix: "。",
      lede: "第一個故事永遠免費。寫低一句說話，就可以行入去。",
      ctaSecondary: "睇下故事庫",
    },
    zhHans: {
      titlePre: "开始你的",
      titleAccent: "第一段人生",
      titleSuffix: "。",
      lede: "第一个故事永远免费。写下一句话，就可以走进去。",
      ctaSecondary: "看故事库",
    },
  },
};

// ─── Locale switcher labels (always show all three native names) ─────
export const LOCALE_SWITCHER = [
  { lang: "zhHant" as const, label: "繁中", locale: "zh-Hant" },
  { lang: "zhHans" as const, label: "简中", locale: "zh-Hans" },
  { lang: "en" as const, label: "EN", locale: "en" },
];

/** Map next-intl locale code → MarketingLang key. */
export function langFromLocale(locale: string): MarketingLang {
  if (locale.startsWith("en")) return "en";
  if (locale.toLowerCase().includes("hans") || locale === "zh-CN") return "zhHans";
  return "zhHant";
}
