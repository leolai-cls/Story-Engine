// Story Engine — Phase C v2 · Creation wizard
// Grok dashboard precision · mono technical chrome · taut spacing

// ─────────────────────────────────────────────────────────────
//  Field shells — Grok aesthetic
// ─────────────────────────────────────────────────────────────
const FieldLabel = ({ children, required, optional, kicker }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8,
  }}>
    <label className="mono" style={{
      fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--accent)',
      textTransform: 'uppercase',
    }}>{kicker || children}</label>
    {kicker && (
      <span style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>
        {children}
      </span>
    )}
    {required && <span className="mono" style={{ fontSize: 9.5, color: 'var(--danger)', letterSpacing: '0.1em' }}>REQUIRED</span>}
    {optional && <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>OPTIONAL</span>}
  </div>
);

const Field = ({ label, hint, children, required, optional }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <FieldLabel required={required} optional={optional} kicker={label}>{label}</FieldLabel>
    {hint && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.55, fontFamily: 'var(--font-cjk)' }}>{hint}</p>}
    {children}
  </div>
);

const TextInput = ({ value = '', placeholder, multiline = false, rows = 4, monoHint, cjk = true }) => {
  const style = {
    width: '100%', padding: '12px 14px',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 9,
    fontSize: 15, color: value ? 'var(--fg)' : 'var(--fg-dim)',
    fontFamily: cjk ? 'var(--font-cjk)' : 'var(--font-sans)',
    lineHeight: 1.65, outline: 'none', resize: multiline ? 'vertical' : 'none',
    boxShadow: 'var(--shadow-card)',
  };
  if (multiline) {
    return (
      <div style={{ position: 'relative' }}>
        <textarea defaultValue={value} placeholder={placeholder} rows={rows} style={style} />
        {monoHint && (
          <span className="mono" style={{
            position: 'absolute', right: 12, bottom: 8, fontSize: 10.5,
            color: 'var(--fg-dim)', letterSpacing: '0.04em',
          }}>{monoHint}</span>
        )}
      </div>
    );
  }
  return <input type="text" defaultValue={value} placeholder={placeholder} style={style} />;
};

// ─────────────────────────────────────────────────────────────
//  Genre picker (no icons — dot + label only)
// ─────────────────────────────────────────────────────────────
const GenrePicker = ({ value = 'mystery' }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    {Object.keys(GENRE).map(k => {
      const g = GENRE[k];
      const active = k === value;
      return (
        <button key={k} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 38, padding: '0 16px', borderRadius: 999,
          fontSize: 13.5, fontFamily: 'var(--font-cjk)',
          color: active ? '#fff' : 'var(--fg-2)',
          background: active ? 'var(--fg)' : 'var(--surface)',
          border: active ? '1px solid var(--fg)' : '1px solid var(--border-strong)',
          fontWeight: active ? 500 : 400,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: active ? '#fff' : `oklch(var(--chip-fg-l) var(--chip-fg-c) ${g.hue})`,
          }} />
          {g.label}
        </button>
      );
    })}
  </div>
);

const LangRadio = ({ value = 'zh-Hant' }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    {[
      { v: 'zh-Hant', label: '繁中',     sub: 'TRADITIONAL · DEFAULT' },
      { v: 'zh-Hans', label: '简中',     sub: 'SIMPLIFIED' },
      { v: 'en',      label: 'English', sub: 'EN' },
    ].map(o => {
      const a = o.v === value;
      return (
        <button key={o.v} style={{
          flex: 1, padding: '12px 14px', borderRadius: 9,
          background: a ? 'var(--accent-bg)' : 'var(--surface)',
          border: `1px solid ${a ? 'var(--accent-line)' : 'var(--border-strong)'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
          boxShadow: 'var(--shadow-card)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: a ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-cjk)' }}>{o.label}</span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>
            {o.sub}
          </span>
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Content rating picker
// ─────────────────────────────────────────────────────────────
const RatingPicker = ({ value = 'pg13', adultEnabled = false }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
    {[
      { v: 'general', label: '一般',  sub: 'GENERAL',  desc: '冇限制 · 任何人' },
      { v: 'pg13',    label: 'PG-13', sub: 'PG-13',    desc: '輕度血腥 / 戀愛' },
      { v: 'mature',  label: '成熟',  sub: 'MATURE',   desc: '暴力 / 性暗示 · 18+' },
      { v: 'adult',   label: '成人',  sub: 'ADULT',    desc: 'NSFW · 完全露骨', locked: !adultEnabled },
    ].map(o => {
      const a = o.v === value;
      return (
        <button key={o.v}
          disabled={o.locked}
          title={o.locked ? '需要喺 設定 開啟成人模式' : undefined}
          style={{
            padding: '14px 14px', borderRadius: 9, textAlign: 'left',
            background: a ? 'var(--accent-bg)' : 'var(--surface)',
            border: `1px solid ${a ? 'var(--accent-line)' : 'var(--border-strong)'}`,
            display: 'flex', flexDirection: 'column', gap: 5,
            opacity: o.locked ? 0.55 : 1,
            cursor: o.locked ? 'not-allowed' : 'pointer',
            position: 'relative', boxShadow: 'var(--shadow-card)',
          }}>
          {o.locked && (
            <Icon name="lock" size={11} stroke="var(--fg-dim)" />
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: a ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-cjk)' }}>{o.label}</span>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{o.sub}</span>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5, fontFamily: 'var(--font-cjk)' }}>
            {o.desc}
          </span>
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Model picker
// ─────────────────────────────────────────────────────────────
const ModelPicker = ({ adultEnabled = false, value = 'sonnet' }) => {
  const models = [
    { id:'sonnet', name:'Claude Sonnet 4.6', vendor:'ANTHROPIC', tag:'平衡 · 預設', price:2 },
    { id:'haiku',  name:'Claude Haiku 4.5',  vendor:'ANTHROPIC', tag:'快 · 省',     price:1 },
    { id:'opus',   name:'Claude Opus 4.7',   vendor:'ANTHROPIC', tag:'最深層次',    price:5, tier:'Creator' },
    { id:'gpt4o',  name:'GPT-4o',            vendor:'OPENAI',    tag:'活潑',        price:2 },
    { id:'gemini', name:'Gemini 2.0 Flash',  vendor:'GOOGLE',    tag:'長 context',  price:2 },
    { id:'grok',   name:'Grok 3',            vendor:'XAI',       tag:'多元觀點',    price:3, tier:'Adventurer' },
    { id:'llama',  name:'Llama 3.1 405B U',  vendor:'OPENROUTER',tag:'露骨內容',    price:3, nsfw:true },
  ];
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11,
      overflow: 'hidden', boxShadow: 'var(--shadow-card)',
    }}>
      {models.map((m, i) => {
        const a = m.id === value;
        const locked = m.tier === 'Creator' || (m.nsfw && !adultEnabled);
        return (
          <button key={m.id}
            disabled={locked}
            style={{
              width: '100%', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 14,
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              background: a ? 'var(--accent-bg)' : 'transparent',
              textAlign: 'left',
              opacity: locked ? 0.55 : 1,
              cursor: locked ? 'not-allowed' : 'pointer',
            }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              border: `2px solid ${a ? 'var(--accent)' : 'var(--border-strong)'}`,
              background: a ? 'var(--accent)' : 'transparent',
              flex: 'none', position: 'relative',
            }}>
              {a && <span style={{ position:'absolute', inset: 3, borderRadius: '50%', background: '#fff' }} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{m.vendor}</span>
                {m.nsfw && (
                  <span className="mono" style={{
                    fontSize: 9.5, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.06em',
                    background: 'var(--danger-bg)', color: 'var(--danger)',
                  }}>NSFW</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{m.tag}</span>
            </div>
            {locked && m.tier && (
              <span className="mono" style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 3, letterSpacing: '0.06em',
                background: 'var(--warn-bg)', color: 'var(--warn)',
              }}>需 {m.tier.toUpperCase()}</span>
            )}
            {locked && m.nsfw && (
              <span className="mono" style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 3, letterSpacing: '0.06em',
                background: 'var(--surface-2)', color: 'var(--fg-dim)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Icon name="lock" size={9} stroke="var(--fg-dim)" /> 需成人模式
              </span>
            )}
            <span className="mono" style={{
              fontSize: 12, color: 'var(--fg-2)', fontWeight: 600,
              padding: '5px 10px', background: 'var(--surface-2)', borderRadius: 6,
            }}>{m.price} CR / TURN</span>
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Wizard shell · single page form
// ─────────────────────────────────────────────────────────────
const WizardShell = ({ adultEnabled = false, filled = false, contentRating = 'pg13' }) => (
  <ScreenFrame>
    <TopBar active="create" />
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px 120px' }}>
      <div className="mono" style={{
        fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)',
      }}>CREATE · 創作新故事</div>
      <h1 style={{
        margin: '14px 0 10px', fontSize: 42, fontWeight: 700,
        letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)', lineHeight: 1.08,
      }}>
        寫一段 premise · AI 為你打造世界
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--fg-muted)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)' }}>
        4 個並行 task · ~50 秒生成 meta + opening · state schema · story bible · character cards
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, marginTop: 40 }}>
        <Field label="故事 premise" required hint="描述世界、情境、主角嘅出發點 · 越具體越好 · 約 50-300 字">
          <TextInput
            multiline rows={5}
            value={filled ? '九龍城寨被劃為自治區嘅 2099 年。義體市場、走私網絡、舊式麻雀館共存。你係新嚟嘅清道夫 — 受僱清除違規 AI 同被遺棄嘅義體。第一單委託：搵返失蹤嘅一個小朋友嘅母親留低嘅義體心臟。' : ''}
            placeholder="例：TW 大學校園戀愛 · 主角係轉學生 · 對手戲係文藝系才女⋯"
            monoHint={filled ? '184 / 1000' : '0 / 1000'} />
        </Field>

        <Field label="類型" required>
          <GenrePicker value={filled ? 'fantasy' : 'mystery'} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Field label="語言" required>
            <LangRadio value="zh-Hant" />
          </Field>
          <Field label="主角提示" optional hint="留空 = AI 自動命名">
            <TextInput value={filled ? '阿狗' : ''} placeholder="例：阿狗 / 林家熙 / Sarah" />
          </Field>
        </div>

        <Field label="內容分級" required hint="影響後尾邊啲 player 睇到呢個故事">
          <RatingPicker value={contentRating} adultEnabled={adultEnabled} />
          {!adultEnabled && contentRating === 'adult' && (
            <div style={{
              marginTop: 10, padding: '11px 14px', borderRadius: 8,
              background: 'var(--warn-bg)', border: '1px solid oklch(0.55 0.13 75 / 0.4)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12.5, color: 'var(--fg-2)', fontFamily: 'var(--font-cjk)',
            }}>
              <Icon name="lock" size={12} stroke="var(--warn)" />
              成人分級鎖咗 · 請喺
              <a style={{ color: 'var(--accent)', textDecoration: 'none' }}>設定 開啟成人模式</a>
            </div>
          )}
        </Field>

        <Field label="敘事 AI Model" required hint="呢個係寫敘事嗰個 model · 之後可以喺 Settings 改 default">
          <ModelPicker adultEnabled={adultEnabled} value="sonnet" />
        </Field>

        <div style={{
          padding: 20, borderRadius: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 18,
          boxShadow: 'var(--shadow-card)',
        }}>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em' }}>
              CREATION COST · ONE-TIME
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
                5–10 cr
              </span>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>· 餘額 184</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4, fontFamily: 'var(--font-cjk)' }}>
              4 個並行 task · meta + opening · state schema · story bible · character cards
            </div>
          </div>
          <Btn variant="primary" size="lg" iconRight="sparkle">開始生成 · ~50 秒</Btn>
        </div>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Generation progress — peak Grok dashboard moment
// ─────────────────────────────────────────────────────────────
const TASKS = [
  { id:'meta',    label:'故事 meta + opening 敘事', icon:'book' },
  { id:'schema',  label:'自適應 state schema',      icon:'settings' },
  { id:'bible',   label:'Story Bible · 世界規則',   icon:'crystal' },
  { id:'chars',   label:'NPC character cards',     icon:'npc' },
];

const TaskRow = ({ task, status, pct }) => {
  const cfg = {
    idle:    { color:'var(--fg-dim)',  bg:'var(--surface-2)', label:'WAITING' },
    running: { color:'var(--accent)',  bg:'var(--accent-bg)', label:'GENERATING' },
    done:    { color:'var(--ok)',      bg:'var(--ok-bg)',     label:'DONE' },
    error:   { color:'var(--danger)',  bg:'var(--danger-bg)', label:'RETRY' },
  }[status];
  return (
    <div style={{
      padding: '16px 18px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 11,
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9, flex: 'none',
          background: cfg.bg, color: cfg.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {status === 'done'    ? <Icon name="check" size={15} stroke={cfg.color} /> :
           status === 'error'   ? <Icon name="warn"  size={15} stroke={cfg.color} /> :
           status === 'running' ? <SpinDot size={11} color={cfg.color} /> :
           <Icon name={task.icon} size={14} stroke={cfg.color} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>{task.label}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em', marginTop: 2 }}>
            SONNET-4.6 · {cfg.label}
          </div>
        </div>
        {status === 'running' && (
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{pct}%</span>
        )}
      </div>
      {(status === 'running' || status === 'done') && (
        <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
          <div style={{
            width: status === 'done' ? '100%' : `${pct}%`, height: '100%',
            background: status === 'done' ? 'var(--ok)' : 'var(--accent)',
            transition: 'width .3s var(--ease)',
          }} />
        </div>
      )}
    </div>
  );
};

const WizardGenerating = ({ statuses, eta = 23 }) => (
  <ScreenFrame>
    <TopBar active="create" />
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '60px 32px 40px' }}>
      <div className="mono" style={{
        fontSize: 11, letterSpacing: '0.16em', color: 'var(--accent)',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        <SpinDot size={10} /> GENERATING · 4 PARALLEL TASKS · ~{eta}s
      </div>
      <h1 style={{
        margin: '16px 0 10px', fontSize: 38, fontWeight: 700,
        letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)', lineHeight: 1.1,
      }}>
        AI 正在為你打造世界
      </h1>
      <p style={{ margin: 0, fontSize: 14.5, color: 'var(--fg-muted)', lineHeight: 1.7, fontFamily: 'var(--font-cjk)' }}>
        你可以打開新 tab 繼續 browse · 完成會通知
      </p>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TASKS.map((t, i) => (
          <TaskRow key={t.id} task={t} status={statuses[i].status} pct={statuses[i].pct} />
        ))}
      </div>

      <div style={{
        marginTop: 28, padding: '16px 20px', borderRadius: 11,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>OVERALL</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>
            {statuses.filter(s => s.status === 'done').length} / {TASKS.length}
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${(statuses.reduce((a, s) => a + (s.status === 'done' ? 100 : s.pct), 0) / TASKS.length)}%`,
            height: '100%', background: 'var(--accent)',
            transition: 'width .3s var(--ease)',
          }} />
        </div>
      </div>

      <button style={{
        marginTop: 22, fontSize: 12, color: 'var(--fg-muted)',
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}>
        <Icon name="close" size={11} /> 取消生成
      </button>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Wizard · moderation reject
// ─────────────────────────────────────────────────────────────
const WizardReject = () => (
  <ScreenFrame>
    <TopBar active="create" />
    <div style={{ maxWidth: 600, margin: '80px auto 0', padding: '0 32px', textAlign: 'center' }}>
      <span style={{
        width: 60, height: 60, margin: '0 auto', display: 'inline-flex',
        borderRadius: 15, background: 'var(--warn-bg)', color: 'var(--warn)',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--shadow-card)',
      }}><Icon name="warn" size={22} /></span>
      <div className="mono" style={{
        marginTop: 18, fontSize: 11, color: 'var(--warn)',
        letterSpacing: '0.14em',
      }}>403 · MODERATION_REJECTED</div>
      <h1 style={{
        margin: '14px 0 12px', fontSize: 26, fontWeight: 700,
        letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)',
      }}>
        呢個 premise 觸發咗安全規則
      </h1>
      <p style={{ margin: '0 auto', fontSize: 14.5, color: 'var(--fg-muted)', lineHeight: 1.7, maxWidth: 480, fontFamily: 'var(--font-cjk)' }}>
        平台嚴禁涉及未成年人、極端暴力、自殘、仇恨內容嘅創作。
        你嘅 premise 並未保存 · 試下用其他角度 reframe。
      </p>
      <div style={{
        marginTop: 22, padding: 16, borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        textAlign: 'left', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.65, fontFamily: 'var(--font-cjk)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <strong style={{ color: 'var(--fg-2)' }}>💡 Tip</strong>:
        AI 嘅敘事可以非常黑暗，但呢個 platform 入面，描寫犯罪嘅故事要將事件設置喺主角嘅 <em>觀察者</em>或 <em>受害者</em>角度，唔好做加害者。
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26 }}>
        <Btn variant="primary" size="lg">改寫 premise</Btn>
        <Btn variant="outline" size="lg">返故事庫</Btn>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Wizard · mobile
// ─────────────────────────────────────────────────────────────
const WizardMobile = () => (
  <ScreenFrame>
    <TopBar mobile />
    <div style={{ padding: '24px 18px 100px' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em' }}>CREATE</div>
      <h1 style={{ margin: '8px 0 6px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>
        創作新故事
      </h1>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>
        Premise · 類型 · model — AI ~50 秒生成
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 26 }}>
        <Field label="故事 premise" required>
          <TextInput multiline rows={4} placeholder="例：TW 大學校園戀愛 · 主角係轉學生⋯" monoHint="0 / 1000" />
        </Field>
        <Field label="類型" required>
          <GenrePicker />
        </Field>
        <Field label="內容分級" required>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { l:'一般',  s:'GENERAL', a:true },
              { l:'PG-13', s:'PG-13' },
              { l:'成熟', s:'MATURE' },
              { l:'成人 18+', s:'ADULT', locked:true },
            ].map(o => (
              <button key={o.l} disabled={o.locked} style={{
                padding: '11px 12px', borderRadius: 8, textAlign: 'left',
                background: o.a ? 'var(--accent-bg)' : 'var(--surface)',
                border: `1px solid ${o.a ? 'var(--accent-line)' : 'var(--border)'}`,
                fontSize: 13, color: o.a ? 'var(--accent)' : 'var(--fg)',
                opacity: o.locked ? 0.55 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-cjk)',
              }}>
                {o.locked && <Icon name="lock" size={10} stroke="var(--fg-dim)" />}
                {o.l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="敘事 model">
          <ModelPicker value="sonnet" />
        </Field>
      </div>
    </div>
    <div style={{
      position: 'sticky', bottom: 0, padding: '12px 16px',
      background: 'rgba(251,250,246,0.94)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 600 }}>5-10 CR · 餘 184</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>ONE-TIME · ~50s</div>
      </div>
      <Btn variant="primary" size="lg" iconRight="sparkle">開始生成</Btn>
    </div>
  </ScreenFrame>
);

Object.assign(window, {
  Field, FieldLabel, TextInput, GenrePicker, LangRadio, RatingPicker, ModelPicker,
  WizardShell, WizardGenerating, WizardReject, WizardMobile, TASKS, TaskRow,
});
