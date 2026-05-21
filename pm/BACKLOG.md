# BACKLOG — Story Engine

> 唔喺當前 phase 嘅嘢全部 capture 喺度。
> 包括：v1.5+ feature、nice-to-have、暫時 defer 嘅嘢、靈感 idea。
> 唔好直接動工，要做先 promote 入 ROADMAP.md 對應 phase。

---

## v1.5 — 短期 post-launch（launch 後 3 個月內）

### 故事生成增強
- ⬜ **故事封面 AI 生圖**（Fal.ai 或 Replicate）— 自動生 cover，提高 library 觀感
- ⬜ **故事 remix / fork**（不只 play）— 用戶可 fork 別人嘅故事去改，建立衍生作品
- ⬜ **Story import**（由 markdown / Twine / 純文字 import）

### 玩家體驗
- ⬜ **保存重要場景**（"highlight moments"）— 玩家 mark 喜歡嘅 turn，後尾可以 export 成圖文
- ⬜ **多 character 控制**（玩家可同時扮演 2 個角色，e.g., 男女主視角輪流）
- ⬜ **時光倒流**（rewind to turn X）— 付費 feature，扣 credits

### 創作工具
- ⬜ **Lorebook 共享**（一個 lorebook 可 attach 多個 story，e.g., HK 1980s 世界觀重用）
- ⬜ **Character template library**（可發佈 character cards 俾人 import）

---

## v1.5+ — 待 revisit decisions

### 外面 writer / Author program 嘅版權安排
- **Status**: Deferred from OPEN_QUESTIONS Q7 — 用戶「將來嘅嘢將來再算啦做好個產品先」
- **Context**: ADR-011 lock 咗 launch 時官方故事由 founder + Claude 自己寫。但 v1.5+ 開放 author program 之前要 decide:
  - A. 平台擁有 writer 嘅故事全部版權
  - B. Writer 保留版權，平台獨家展示授權（industry standard，attract talent）
  - C. Case-by-case hybrid
- **Action when reaching v1.5 author program scope**: 請律師起 contract template + business decide A/B/C

---

## v2 — 中期（launch 後 6-12 個月）

### Multi-player
- ⬜ **Co-op 雙人遊玩**（兩個玩家輪流出招，扮演同個或唔同角色）
- ⬜ **GM 模式**（一個玩家做 narrator，AI 扮演 NPC）
- ⬜ **Spectator mode**（公開直播 playthrough）

### Voice / 多模態
- ⬜ **TTS 敘事**（中文 TTS，e.g., ElevenLabs 中文 voice）
- ⬜ **語音輸入**（Whisper 廣東話 / 普通話）
- ⬜ **NPC voice**（每個 NPC 有獨立 voice profile）
- ⬜ **Scene image gen**（重要 scene auto 生圖）

### 創作 ecosystem
- ⬜ **Branching narrative designer**（俾專業作者用嘅 tree editor，做 premium 官方故事）
- ⬜ **Author monetization**（用戶收費故事，平台抽成）
- ⬜ **Translation feature**（一鍵繁中 → 簡中 / 英文）

---

## v3 — 長期

- ⬜ **Mobile native app**（iOS + Android，先 PWA 驗證需求）
- ⬜ **多語言擴展**（簡中 → 英 → 日 → 韓）
- ⬜ **企業 / 教育 license**（學校用嚟做 interactive learning）
- ⬜ **AR/VR 整合**（戴 headset 玩文字 RPG，瘋狂諗）

---

## 💡 Ideas / 未評估

呢度放未決定要唔要做嘅嘢，傾過先 promote。

- 💡 **DLC 機制** — 官方為 hit 故事出「續集」「番外篇」DLC（一次性購買）
- 💡 **Creator program** — 邀請 HK / TW influencer 做官方故事
- 💡 **故事評論系統升級** — 唔只 5 星，加「emotional tag」（驚喜 / 心酸 / 緊張）
- 💡 **AI 自動 generate trailer** — 用故事內容自動生 30 秒 trailer 圖文
- 💡 **多 model ensemble** — 同一 turn 兩個 model 各寫一段，玩家揀
- 💡 **跨故事 character cameo** — 你之前故事嘅 character 可以 guest 喺新故事

---

## ⏸️ 暫時 defer（諗過但唔做）

- 暫時 defer：自建 LLM hosting（vLLM / Ollama）— 成本同維護唔抵
- 暫時 defer：blockchain / NFT 故事所有權 — 中文圈用戶冇 demand
- 暫時 defer：英文 market 進入 — 等中文圈 PMF 先
