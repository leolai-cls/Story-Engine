// Story Engine — Phase C v2 · Settings + Login + Locale
// Grok dashboard chrome · mono labels · table-density rows

const SettingsSection = ({ id, title, sub, children }) => (
  <section id={id} style={{ marginBottom: 44 }}>
    <header style={{ marginBottom: 16 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)' }}>
        SECTION · {(id || '').toUpperCase()}
      </div>
      <h2 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>{title}</h2>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{sub}</p>}
    </header>
    {children}
  </section>
);

const SettingsRow = ({ label, hint, control, danger }) => (
  <div style={{
    padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20,
    background: 'var(--surface)', borderBottom: '1px solid var(--border)',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--fg)', fontFamily: 'var(--font-cjk)' }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.55, fontFamily: 'var(--font-cjk)' }}>{hint}</div>}
    </div>
    <div style={{ flex: 'none' }}>{control}</div>
  </div>
);

const SettingsCard = ({ children }) => (
  <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
    {children}
  </div>
);

const Toggle = ({ on }) => (
  <button style={{
    width: 44, height: 26, borderRadius: 13,
    background: on ? 'var(--accent)' : 'var(--border-strong)',
    position: 'relative', flex: 'none',
    transition: 'background .15s var(--ease)',
  }}>
    <span style={{
      position: 'absolute', top: 2, left: on ? 20 : 2,
      width: 22, height: 22, borderRadius: '50%',
      background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      transition: 'left .15s var(--ease)',
    }} />
  </button>
);

const AdultModeBlock = ({ state = 'not_verified' }) => {
  const csam = (
    <div style={{
      padding: '12px 18px', background: 'var(--danger-bg)',
      borderTop: '1px solid oklch(0.55 0.15 25 / 0.3)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.55, fontFamily: 'var(--font-cjk)',
    }}>
      <div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--danger)', letterSpacing: '0.14em', marginRight: 8 }}>HARD RULE</span>
        平台嚴禁涉及未成年人士、真實人物或非法內容嘅創作。違者帳號永久停權並依法通報。
        <a style={{ color: 'var(--accent)', textDecoration: 'none', marginLeft: 6 }}>了解詳情</a>
      </div>
    </div>
  );
  if (state === 'not_verified') {
    return (
      <SettingsCard>
        <div style={{ padding: '20px 22px', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <span style={{
              width: 40, height: 40, borderRadius: 11, flex: 'none',
              background: 'var(--surface-2)', color: 'var(--fg-dim)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="lock" size={18} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>成人模式</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em', marginTop: 3 }}>
                NOT_VERIFIED · 需要身份驗證
              </div>
            </div>
            <Btn variant="outline" size="md" disabled icon="lock">完成驗證</Btn>
          </div>
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--surface-2)', border: '1px dashed var(--border-strong)',
            fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)',
          }}>
            開啟成人模式需要完成一次性身份驗證 · 確認你係成年人。
            <span style={{ color: 'var(--fg-dim)' }}>呢個功能會喺 Phase 6（money tier）一齊上線。</span>
          </div>
        </div>
        {csam}
      </SettingsCard>
    );
  }
  if (state === 'verified_off') {
    return (
      <SettingsCard>
        <div style={{ padding: '20px 22px', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{
              width: 40, height: 40, borderRadius: 11, flex: 'none',
              background: 'var(--ok-bg)', color: 'var(--ok)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={18} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>成人模式 · 已驗證</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em', marginTop: 3 }}>
                VERIFIED · OFF · 可隨時開啟
              </div>
            </div>
            <Toggle on={false} />
          </div>
        </div>
        {csam}
      </SettingsCard>
    );
  }
  return (
    <SettingsCard>
      <div style={{ padding: '20px 22px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <span className="mono" style={{
            width: 40, height: 40, borderRadius: 11, flex: 'none',
            background: 'var(--danger-bg)', color: 'var(--danger)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600,
          }}>18+</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>成人模式 · 已開啟</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em', marginTop: 3 }}>
              VERIFIED · ON · NSFW model + adult filter available
            </div>
          </div>
          <Toggle on={true} />
        </div>
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'var(--warn-bg)', border: '1px solid oklch(0.55 0.13 75 / 0.4)',
          fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)',
        }}>
          <strong>關閉後</strong>：NSFW default model 自動 reset 返 Sonnet 4.6（避免下個 turn 撞牆）。已創作嘅成人故事仍然可以玩。
        </div>
      </div>
      {csam}
    </SettingsCard>
  );
};

const AdultConfirmDialog = () => (
  <ScreenFrame style={{ position: 'relative' }}>
    <div style={{ filter: 'blur(3px) brightness(0.92)', pointerEvents: 'none' }}>
      <SettingsDesktop adultState="verified_off" />
    </div>
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--overlay)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 540, padding: 32,
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-modal)',
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--danger)', letterSpacing: '0.16em' }}>
          確認開啟成人模式
        </span>
        <h2 style={{ margin: '14px 0 12px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>
          你準備好打開 18+ 內容？
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)' }}>打開之後：</p>
        <ul style={{
          margin: '12px 0', paddingLeft: 20,
          fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.9, fontFamily: 'var(--font-cjk)',
        }}>
          <li>Model picker 多咗 OpenRouter NSFW model</li>
          <li>Creation 可揀「成人」content_rating</li>
          <li>Library 多咗「18+」filter</li>
          <li>Story detail 唔再 hide 成人故事</li>
        </ul>
        <div style={{
          padding: '12px 14px', borderRadius: 8, marginTop: 6,
          background: 'var(--danger-bg)', border: '1px solid oklch(0.55 0.15 25 / 0.35)',
          fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)',
        }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--danger)', letterSpacing: '0.14em', marginRight: 6 }}>HARD RULE</span>
          平台嚴禁涉及未成年人士、真實人物或非法內容嘅創作。
          CSAM/illegal pre-filter 喺任何 mode 下都 always-on。
        </div>
        <label style={{
          marginTop: 20, display: 'flex', alignItems: 'flex-start', gap: 10,
          fontSize: 13, color: 'var(--fg-2)', cursor: 'pointer', fontFamily: 'var(--font-cjk)',
        }}>
          <span style={{
            width: 18, height: 18, flex: 'none', marginTop: 1,
            border: '1.5px solid var(--border-strong)', borderRadius: 4,
          }} />
          我已年滿 18 歲 · 並理解上述守則。
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <Btn variant="soft" size="lg" style={{ flex: 1 }}>取消</Btn>
          <Btn variant="primary" size="lg" style={{ flex: 1 }}>確認開啟</Btn>
        </div>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Settings desktop
// ─────────────────────────────────────────────────────────────
const SettingsDesktop = ({ adultState = 'not_verified' }) => (
  <ScreenFrame>
    <TopBar active="library" />
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 32px 100px' }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)' }}>
        SETTINGS · @阿俊
      </div>
      <h1 style={{ margin: '14px 0 0', fontSize: 38, fontWeight: 700, letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)' }}>
        設定
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 44, marginTop: 36 }}>
        <nav style={{ position: 'sticky', top: 76, alignSelf: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { id:'profile',     label:'個人資料' },
              { id:'preferences', label:'偏好' },
              { id:'adult',       label:'成人模式' },
              { id:'credits',     label:'Credits' },
              { id:'account',     label:'帳號' },
            ].map((s, i) => (
              <a key={s.id} href={'#' + s.id} style={{
                padding: '9px 12px', borderRadius: 7,
                fontSize: 13.5, color: i === 0 ? 'var(--fg)' : 'var(--fg-muted)',
                background: i === 0 ? 'var(--surface)' : 'transparent',
                border: i === 0 ? '1px solid var(--border)' : '1px solid transparent',
                textDecoration: 'none',
                fontFamily: 'var(--font-cjk)',
                fontWeight: i === 0 ? 600 : 400,
              }}>{s.label}</a>
            ))}
          </div>
        </nav>

        <div>
          <SettingsSection id="profile" title="個人資料">
            <SettingsCard>
              <SettingsRow label="頭像" hint="會出現喺 Library card 同 comments"
                control={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name="阿俊" size={40} hue={290} />
                    <Btn variant="outline" size="sm">上載</Btn>
                  </div>
                } />
              <SettingsRow label="顯示名稱" hint="呢個係其他 player 睇到嘅名"
                control={<TextInput value="阿俊" />} />
              <SettingsRow label="Email" hint="只用嚟 magic link 登入 · 唔會公開"
                control={
                  <span className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                    a***n@gmail.com
                  </span>
                } />
              <SettingsRow label="介面語言" hint="影響全站 UI · 唔影響你寫故事嘅語言"
                control={<LocaleSelect compact />} />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="preferences" title="偏好" sub="呢度嘅 setting 適用於所有故事 · 個別 playthrough 仍可獨立揀">
            <SettingsCard>
              <SettingsRow label="預設敘事 model" hint="新開 playthrough 嘅 default · Adult mode 影響 NSFW model 嘅可選性"
                control={
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 7,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 13 }}>Claude Sonnet 4.6</span>
                    <Icon name="chevron_d" size={11} stroke="var(--fg-muted)" />
                  </button>
                } />
              <SettingsRow label="UI 密度" hint="影響 Library 卡片 + Play 行距"
                control={
                  <div style={{ display:'flex', gap: 2, background: 'var(--border)', borderRadius: 6, padding: 2 }}>
                    {['寬鬆','標準','緊湊'].map((l, i) => (
                      <button key={l} style={{
                        padding: '6px 14px', fontSize: 12.5, borderRadius: 5,
                        background: i === 1 ? 'var(--surface)' : 'transparent',
                        color: i === 1 ? 'var(--fg)' : 'var(--fg-muted)',
                        fontFamily: 'var(--font-cjk)',
                        fontWeight: i === 1 ? 600 : 400,
                      }}>{l}</button>
                    ))}
                  </div>
                } />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="adult" title="成人模式" sub="法律要求 · CSAM/illegal pre-filter 永遠 on · 無論開唔開都 enforce">
            <AdultModeBlock state={adultState} />
          </SettingsSection>

          <SettingsSection id="credits" title="Credits" sub="按 turn 扣 · 每個 model 唔同 price · Phase 4 上線 top-up">
            <SettingsCard>
              <div style={{ padding: '24px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.14em' }}>BALANCE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: 40, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.025em', lineHeight: 1 }}>184</span>
                  <span style={{ fontSize: 14, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>credits</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <Btn variant="primary" size="md" icon="plus">加 credits</Btn>
                  <Btn variant="outline" size="md">查看 ledger</Btn>
                  <span className="mono" style={{
                    marginLeft: 'auto', alignSelf: 'center',
                    fontSize: 10, padding: '3px 8px', borderRadius: 3, letterSpacing: '0.08em',
                    background: 'var(--surface-2)', color: 'var(--fg-dim)',
                  }}>TOP-UP · PHASE 4</span>
                </div>
              </div>
              <SettingsRow label="近 7 日用量" hint="58 turn · ~$1.18 USD 等值"
                control={
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 36 }}>
                    {[12, 18, 8, 22, 14, 26, 9].map((v, i) => (
                      <div key={i} style={{
                        width: 9, height: v * 1.3,
                        background: i === 6 ? 'var(--accent)' : 'var(--surface-2)',
                        borderRadius: 2,
                      }} />
                    ))}
                  </div>
                } />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="account" title="帳號">
            <SettingsCard>
              <SettingsRow label="登出" hint="所有裝置同時登出"
                control={<Btn variant="soft" size="md">登出</Btn>} />
              <SettingsRow label="匯出我嘅 data" hint="所有 playthrough · 記憶 · 評論 · ~zip 檔"
                control={<Btn variant="outline" size="md" disabled>匯出（v1.5+）</Btn>} />
              <SettingsRow danger label="刪除帳號" hint="不可逆 · 所有故事、playthrough、記憶會永久消失"
                control={<Btn variant="danger" size="md">刪除…</Btn>} />
            </SettingsCard>
          </SettingsSection>
        </div>
      </div>
    </div>
  </ScreenFrame>
);

const SettingsMobile = () => (
  <ScreenFrame>
    <TopBar mobile />
    <div style={{ padding: '24px 18px 80px' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em' }}>SETTINGS</div>
      <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>設定</h1>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-muted)' }}>@阿俊</p>

      <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <SettingsSection id="profile" title="個人資料">
          <SettingsCard>
            <SettingsRow label="頭像" control={<Avatar name="阿俊" size={36} hue={290} />} />
            <SettingsRow label="顯示名稱" control={<span style={{ fontSize: 13, fontFamily: 'var(--font-cjk)' }}>阿俊</span>} />
            <SettingsRow label="語言" control={<LocaleSelect compact />} />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection id="adult" title="成人模式">
          <AdultModeBlock state="not_verified" />
        </SettingsSection>

        <SettingsSection id="credits" title="Credits">
          <SettingsCard>
            <div style={{ padding: 20, background: 'var(--surface)' }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em' }}>BALANCE</div>
              <div className="mono" style={{ fontSize: 32, marginTop: 6, fontWeight: 600 }}>
                184 <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>credits</span>
              </div>
              <Btn variant="primary" size="md" icon="plus" style={{ marginTop: 16 }}>加 credits</Btn>
            </div>
          </SettingsCard>
        </SettingsSection>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Login
// ─────────────────────────────────────────────────────────────
const LoginDesktop = ({ stage = 'initial' }) => (
  <ScreenFrame>
    <div style={{
      height: 60, padding: '0 32px', display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))' }} />
        <div className="mono" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>story.engine</div>
      </div>
      <div style={{ flex: 1 }} />
      <LocaleSelect compact />
    </div>

    <div style={{
      maxWidth: 440, margin: '100px auto 0', padding: '0 24px',
      textAlign: 'center',
    }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)' }}>SIGN IN</div>
      <h1 style={{ margin: '12px 0 8px', fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)' }}>
        歡迎返嚟
      </h1>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>
        用 email magic link · 唔需要密碼
      </p>

      <div style={{
        marginTop: 32, padding: 28, borderRadius: 16,
        background: 'var(--surface)', border: '1px solid var(--border)',
        textAlign: 'left', boxShadow: 'var(--shadow-card)',
      }}>
        {stage === 'initial' && (
          <>
            <Field label="Email">
              <TextInput value="" placeholder="you@example.com" cjk={false} />
            </Field>
            <Btn variant="primary" size="lg" iconRight="send" style={{ width: '100%', marginTop: 14 }}>
              寄 magic link
            </Btn>
            <div style={{
              margin: '24px 0', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <Btn variant="outline" size="lg" icon="sparkle" style={{ width: '100%' }}>
              一鍵 Guest 試玩
            </Btn>
            <p style={{
              margin: '14px 0 0', fontSize: 11.5, color: 'var(--fg-dim)',
              textAlign: 'center', lineHeight: 1.55, fontFamily: 'var(--font-cjk)',
            }}>
              Guest 模式 · 即時試玩 · 想長期保存就 sign up 用 email
            </p>
          </>
        )}
        {stage === 'email_sent' && (
          <>
            <span style={{
              width: 60, height: 60, margin: '0 auto 18px', display: 'flex',
              borderRadius: 15, background: 'var(--accent-bg)', color: 'var(--accent)',
              alignItems: 'center', justifyContent: 'center',
            }}><Icon name="send" size={24} /></span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font-cjk)' }}>
              Magic link 已寄出
            </h2>
            <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)' }}>
              請查 <span className="mono" style={{ color: 'var(--fg-2)' }}>a***n@gmail.com</span>
              。link 喺 15 分鐘內有效。
            </p>
            <div style={{
              marginTop: 20, padding: '12px 14px', borderRadius: 8,
              background: 'var(--surface-2)', border: '1px dashed var(--border)',
              fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center', fontFamily: 'var(--font-cjk)',
            }}>
              冇收到？檢查 spam folder · 或 <a style={{ color: 'var(--accent)', textDecoration: 'none' }}>重寄</a>
            </div>
            <Btn variant="ghost" size="md" style={{ width: '100%', marginTop: 14 }} icon="arrow_l">
              用第二個 email
            </Btn>
          </>
        )}
      </div>

      <p style={{
        margin: '26px auto 0', maxWidth: 340,
        fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.6, fontFamily: 'var(--font-cjk)',
      }}>
        登入即代表你同意 <a style={{ color: 'var(--fg-muted)' }}>服務條款</a>
        及 <a style={{ color: 'var(--fg-muted)' }}>私隱政策</a>
      </p>
    </div>
  </ScreenFrame>
);

const LoginMobile = () => (
  <ScreenFrame>
    <div style={{
      height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))' }} />
        <div className="mono" style={{ fontSize: 13.5 }}>story.engine</div>
      </div>
      <LocaleSelect compact />
    </div>
    <div style={{ padding: '48px 22px 24px', textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em' }}>SIGN IN</div>
      <h1 style={{ margin: '10px 0 6px', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>歡迎返嚟</h1>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>用 email magic link · 唔需要密碼</p>

      <div style={{
        marginTop: 28, padding: 22, borderRadius: 14,
        background: 'var(--surface)', border: '1px solid var(--border)',
        textAlign: 'left', boxShadow: 'var(--shadow-card)',
      }}>
        <Field label="Email">
          <TextInput value="" placeholder="you@example.com" cjk={false} />
        </Field>
        <Btn variant="primary" size="lg" iconRight="send" style={{ width: '100%', marginTop: 12 }}>
          寄 magic link
        </Btn>
        <div style={{ margin: '18px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <Btn variant="outline" size="lg" icon="sparkle" style={{ width: '100%' }}>
          一鍵 Guest 試玩
        </Btn>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center', lineHeight: 1.55, fontFamily: 'var(--font-cjk)' }}>
          Guest 模式 · 即時試玩 · 想長期保存就 sign up 用 email
        </p>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Locale switcher
// ─────────────────────────────────────────────────────────────
const LocaleSelect = ({ compact = false, value = 'zh-Hant' }) => {
  const opts = [
    { v: 'zh-Hant', label: '繁中',     full: '繁體中文 · 香港 / 台灣' },
    { v: 'zh-Hans', label: '简中',     full: '简体中文' },
    { v: 'en',      label: 'EN',       full: 'English' },
  ];
  const current = opts.find(o => o.v === value) || opts[0];
  if (compact) {
    return (
      <button style={{
        height: 32, padding: '0 12px', borderRadius: 7,
        border: '1px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12.5, color: 'var(--fg-2)', background: 'var(--surface)',
        fontFamily: 'var(--font-cjk)',
      }}>
        {current.label}
        <Icon name="chevron_d" size={10} stroke="var(--fg-muted)" />
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {opts.map(o => {
        const a = o.v === value;
        return (
          <button key={o.v} style={{
            padding: '13px 16px', borderRadius: 9,
            background: a ? 'var(--accent-bg)' : 'var(--surface)',
            border: `1px solid ${a ? 'var(--accent-line)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
            boxShadow: 'var(--shadow-card)',
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              border: `2px solid ${a ? 'var(--accent)' : 'var(--border-strong)'}`,
              background: a ? 'var(--accent)' : 'transparent',
              position: 'relative',
            }}>{a && <span style={{ position:'absolute', inset: 3, borderRadius: '50%', background: '#fff' }} />}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: a ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-cjk)' }}>{o.label}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: '0.06em' }}>{o.full}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

const LocalePlacements = () => (
  <ScreenFrame style={{ padding: 36 }}>
    <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)' }}>
      LOCALE SWITCHER · CROSS-CUTTING
    </div>
    <h2 style={{ margin: '12px 0 8px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>
      Placements
    </h2>
    <p style={{ margin: '0 0 32px', fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>
      已 i18n 化 · 預設 zh-Hant · cookie + next-intl middleware · 內容 (story narrative) 唔受影響
    </p>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
      <div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
          A · TOPBAR PILL (EVERY AUTHED PAGE)
        </div>
        <div style={{ padding: 16, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))' }} />
            <div className="mono" style={{ fontSize: 14 }}>story.engine</div>
            <div style={{ flex: 1 }} />
            <LocaleSelect compact />
            <Avatar name="阿俊" size={28} hue={290} />
          </div>
        </div>
      </div>

      <div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
          B · LOGIN / AUTH
        </div>
        <div style={{ padding: 16, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 11, display: 'flex', justifyContent: 'flex-end' }}>
          <LocaleSelect compact />
        </div>
      </div>

      <div style={{ gridColumn: 'span 2' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
          C · SETTINGS → 個人資料 → 介面語言 (FULL RADIO)
        </div>
        <div style={{ padding: 22, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, maxWidth: 400 }}>
          <LocaleSelect />
        </div>
      </div>

      <div style={{ gridColumn: 'span 2' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.14em', marginBottom: 12 }}>
          D · MOBILE FOOTER (VISITOR LANDING)
        </div>
        <div style={{ padding: 14, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>© 2026 story.engine</span>
          <div style={{ flex: 1 }} />
          <LocaleSelect compact />
        </div>
      </div>
    </div>
  </ScreenFrame>
);

Object.assign(window, {
  SettingsSection, SettingsRow, SettingsCard, Toggle,
  AdultModeBlock, AdultConfirmDialog,
  SettingsDesktop, SettingsMobile,
  LoginDesktop, LoginMobile,
  LocaleSelect, LocalePlacements,
});
