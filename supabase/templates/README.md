# Supabase Email Templates · Trilingual

Wave 2 i18n migration (2026-05-28) · email templates 對齊三個 locale。

## 點解一封 email 入面有 3 個語言？

Supabase **唔支援** per-locale email templates — template 一寫死就所有用戶收同一份。
解決方法：將 EN / 繁中 / 簡中 三段堆疊喺一封 email · 用戶睇返應該嗰段。

最常見人嘅做法（Linear · Notion · Stripe 早期都係咁）· 簡單夠用。

## 4 個 template

| 檔案 | 用途 | 觸發 |
|---|---|---|
| `magic_link.html` | 無密碼登入 link | 用戶喺 `/login` 入 email 然後 submit |
| `confirmation.html` | 確認新註冊 email | `auth.email.enable_confirmations = true` 開啟先有 |
| `recovery.html` | 重設密碼 | 用戶 trigger forgot-password flow |
| `email_change.html` | 確認新 email | 用戶喺 settings 改 email |

當前 `config.toml` `enable_confirmations = false` · 所以實際 production 主要用 `magic_link.html`。

## Local dev

`config.toml` 入面 `[auth.email.template.*]` section 已經設定好 `content_path` · 跑 `supabase start` 自動 load。Inbucket (本地 SMTP) 喺 `http://localhost:54324` 收到信會用呢啲 template。

## Production deploy

⚠️ **config.toml 嘅 email template 設定唔會 sync 上 prod。** 必須去 Supabase Dashboard manually paste：

### 步驟

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 揀 Story Engine project
3. 左 menu **Authentication** → **Email Templates**
4. 4 個 tab 對應 4 個 template type：
   - **Confirm signup** ← paste `confirmation.html`
   - **Invite user** ← (optional · 用唔到 leave default)
   - **Magic Link** ← paste `magic_link.html` **← 最重要**
   - **Change Email Address** ← paste `email_change.html`
   - **Reset Password** ← paste `recovery.html`
5. 每個 template 都要 set Subject：
   - Magic Link: `Sign in to Kieio · 登入 Kieio`
   - Confirm: `Confirm your Kieio account · 確認 Kieio 帳戶`
   - Recovery: `Reset your Kieio password · 重設 Kieio 密碼`
   - Email change: `Confirm new email · 確認新 email`
6. **Save** 每個 tab

### 點 test prod template

- 開隱身 browser
- 去 `kieio.com/en/login` (or zh-Hant/zh-Hans)
- 用一個你 access 到嘅 email 試 sign in
- 收到嘅 email 應該有三段堆疊

## 之後想做 per-locale email？

Supabase 本身做唔到 · 但有兩條路：

**A. Auth Hooks + Resend** — Supabase 提供 `send-email` webhook · 你個 endpoint 收到 user signup event · 自己 query user locale (從 profiles table) · call Resend API 用啱嘅 template · skip Supabase 本身嘅 email sender。
- 優點：完全控制 + per-locale
- 缺點：要寫 edge function · 多一層 infra

**B. 等 Supabase 加 native i18n support** — [GitHub issue #1015](https://github.com/supabase/supabase/issues/1015) 開咗幾年 · 仲未做。

家陣 stacked trilingual 已經夠用 · 唔需要急 (A)。
