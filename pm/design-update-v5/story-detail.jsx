// Story Engine — Phase A v2 · Story detail
// Full-bleed cover hero · scenario landing · Grok-mono technical chrome

// ─────────────────────────────────────────────────────────────
//  Sample data
// ─────────────────────────────────────────────────────────────
const COMMENTS = [
  { id:'c1', author:'肥仔', hue:200, time:'3 日前', stars:5,
    body:'第一次玩到 NPC 真係 reject 玩家！我搞咗 5 個 turn 先 convince 到陳 Sir 借鎖匙俾我。值得。', replies:[
      { id:'c1r1', author:'Noir', hue:220, time:'2 日前', body:'Thanks ! 陳 Sir 嘅 trust 起步係 -20，要慢慢 build。', isAuthor:true },
    ] },
  { id:'c2', author:'Evian', hue:80, time:'1 週前', stars:4,
    body:'氣氛真係正。比起其他 platform 嘅 detective 故事，呢個唔會幫你 narrate「你成功咗」 — 你要自己諗點做。' },
  { id:'c3', author:'阿狗', hue:340, time:'2 週前', stars:5,
    body:'已經玩咗 3 個 playthrough · 每次結局都唔同。Memory journal 嗰個 lorebook 真係有用，第二輪可以睇返第一輪嘅線索。' },
];

const SAMPLE_STORY = STORIES[0];

// ─────────────────────────────────────────────────────────────
//  Stats tile · Grok mono
// ─────────────────────────────────────────────────────────────
const StatTile = ({ kicker, value, sub }) => (
  <div>
    <div className="mono" style={{
      fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-dim)',
      textTransform: 'uppercase', marginBottom: 6,
    }}>{kicker}</div>
    <div className="mono" style={{
      fontSize: 24, fontWeight: 600, color: 'var(--fg)',
      letterSpacing: '-0.02em', lineHeight: 1,
    }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4, fontFamily: 'var(--font-cjk)' }}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Comment
// ─────────────────────────────────────────────────────────────
const Comment = ({ c, depth = 0 }) => (
  <div style={{ marginLeft: depth * 40, paddingTop: 18 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <Avatar name={c.author} size={32} hue={c.hue} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>{c.author}</span>
          {c.isAuthor && (
            <span className="mono" style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.06em',
              background: 'var(--accent-bg)', color: 'var(--accent)',
            }}>AUTHOR</span>
          )}
          {c.stars && (
            <span style={{ color: '#c89a1a', display: 'inline-flex', gap: 1 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Icon key={i} name={i <= c.stars ? 'star-fill' : 'star'} size={11} strokeWidth={1.5} />
              ))}
            </span>
          )}
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>{c.time}</span>
        </div>
        <p style={{
          margin: '6px 0 0', fontSize: 14, color: 'var(--fg-2)',
          fontFamily: 'var(--font-cjk)', lineHeight: 1.65, textWrap: 'pretty',
        }}>{c.body}</p>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--fg-dim)' }}>
          <button style={{ color: 'inherit' }}>回覆</button>
          <button style={{ color: 'inherit' }}>檢舉</button>
        </div>
        {c.replies?.map(r => <Comment key={r.id} c={r} depth={1} />)}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Story detail · desktop · full-bleed cover hero + meta scroll
// ─────────────────────────────────────────────────────────────
const StoryDetailDesktop = ({ s = SAMPLE_STORY, hasFork = false, isOwn = false }) => (
  <ScreenFrame>
    <TopBar active="library" />

    {/* HERO — full-bleed cover, gradient to paper */}
    <section style={{
      position: 'relative', height: 620, overflow: 'hidden',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Cover story={s} ratio="auto" titleOverride={null} showLabel={false}
          style={{ width: '100%', height: '100%', borderRadius: 0, aspectRatio: 'auto', border: 'none', boxShadow: 'none' }} />
      </div>
      {/* Triple gradient: vignette + bottom-fade-to-paper + top-darken for crumbs */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          linear-gradient(180deg, rgba(20,18,14,0.42) 0%, transparent 18%, transparent 50%, var(--bg) 100%),
          radial-gradient(80% 60% at 22% 50%, rgba(20,18,14,0.28) 0%, transparent 70%)`,
      }} />
      {/* Breadcrumb */}
      <div style={{
        position: 'absolute', top: 20, left: 56,
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.78)',
      }}>
        <button style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="arrow_l" size={11} /> 故事庫
        </button>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>/</span>
        <span className="mono" style={{ letterSpacing: '0.06em' }}>{(GENRE[s.genre] || {}).label}</span>
      </div>

      {/* Hero content · bottom-left */}
      <div style={{
        position: 'absolute', left: 56, right: 56, bottom: 56,
        color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.42)',
        maxWidth: 760,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <GenreChip genre={s.genre} />
          <RatingBadge rating={s.rating} />
          <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.1em' }}>
            繁中 · ZH-HANT
          </span>
        </div>
        <h1 style={{
          margin: 0, fontSize: 64, fontWeight: 700,
          lineHeight: 1.02, letterSpacing: '-0.035em',
          fontFamily: 'var(--font-cjk)', color: '#fff',
          textWrap: 'balance',
        }}>{s.title}</h1>
        <p style={{
          margin: '20px 0 0', fontSize: 17,
          fontFamily: 'var(--font-cjk)', lineHeight: 1.6,
          color: 'rgba(255,255,255,0.92)',
          textWrap: 'pretty', maxWidth: 580,
        }}>{s.blurb}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28 }}>
          <Btn variant="primary" size="lg" icon="play"
            style={{ background: '#fff', color: '#0a0a0b', fontWeight: 600, padding: '0 22px', height: 48 }}>
            開始扮演
          </Btn>
          {hasFork && (
            <Btn variant="outline" size="lg" icon="bookmark"
              style={{ background: 'rgba(20,18,14,0.32)', color: '#fff', borderColor: 'rgba(255,255,255,0.32)', height: 48 }}>
              繼續我嘅 playthrough
            </Btn>
          )}
          <Btn variant="ghost" size="lg" icon="fork"
            style={{ color: '#fff', height: 48 }}>
            Fork 改編
          </Btn>
          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.18)', margin: '0 6px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <Avatar name={s.author} size={22} hue={s.hue} />
            <span style={{ color: '#fff', fontWeight: 500 }}>{s.author}</span>
            <span className="mono" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.handle}</span>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-cjk)' }}>
          ~2 credits / turn · 隨時可停 · 進度永久保存 · 你嘅餘額 184
        </div>
      </div>
    </section>

    {/* Stats strip · sits across the hero/body boundary */}
    <section style={{
      maxWidth: 1180, margin: '0 auto', padding: '32px 56px 0',
    }}>
      <div style={{
        padding: '24px 28px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 14,
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 28,
        boxShadow: 'var(--shadow-card)',
      }}>
        <StatTile kicker="RATING" value={s.stars.toFixed(1) + ' / 5'} sub="880 個評分" />
        <StatTile kicker="OPENED · TOTAL" value="7,220" sub="playthrough · 累計" />
        <StatTile kicker="ACTIVE NOW" value="482" sub="仲喺進行中" />
        <StatTile kicker="FORKED" value="312" sub="獨立改編" />
        <StatTile kicker="MEDIAN SESSION" value="14 turn" sub="中位數" />
      </div>
    </section>

    {/* Opening + Cast · 2-col */}
    <section style={{
      maxWidth: 1180, margin: '0 auto', padding: '48px 56px 0',
      display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 48,
    }}>
      {/* Opening */}
      <div>
        <div className="mono" style={{
          fontSize: 11, letterSpacing: '0.16em', color: 'var(--accent)',
          textTransform: 'uppercase', marginBottom: 12,
        }}>開場 · OPENING NARRATIVE</div>
        <div style={{
          position: 'relative',
          padding: '32px 36px',
          background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          <p style={{
            margin: 0, fontSize: 17,
            fontFamily: 'var(--font-cjk)', lineHeight: 1.95,
            color: 'var(--fg)', letterSpacing: '0.005em', textWrap: 'pretty',
          }}>
            銅鑼灣，星期三，凌晨一點四十七分。<br/>
            你嘅辦公室喺一棟舊式商廈嘅七樓，招牌冇燈，個 lift 一開門就有股霉味。客人坐喺對面，五十幾歲，西裝裇衫袖口磨到起毛。佢冇報名，淨係將一張相片擺低喺枱面。<br/>
            相入面係佢嘅女兒。但你認得佢——五年前你親手簽過佢嘅死亡證明。<br/>
            「<span style={{ color: 'var(--accent)', fontWeight: 500 }}>陳 Sir</span>，幫我搵返佢。」佢講。「我願意俾你做任何嘢。」
          </p>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 90,
            background: 'linear-gradient(180deg, transparent, var(--surface))',
            pointerEvents: 'none',
            borderRadius: '0 0 14px 14px',
          }} />
        </div>
        <button style={{
          marginTop: 14, fontSize: 13, color: 'var(--accent)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          展開完整開場 <Icon name="chevron_d" size={12} />
        </button>

        {/* Tag row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 32 }}>
          {['偵探','香港','深夜','靈異','黑色幽默','代入感強','多重創者'].map(t => (
            <button key={t} style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 6,
              background: 'var(--surface)', color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-cjk)',
            }}>#{t}</button>
          ))}
        </div>
      </div>

      {/* Cast */}
      <div>
        <div className="mono" style={{
          fontSize: 11, letterSpacing: '0.16em', color: 'var(--accent)',
          textTransform: 'uppercase', marginBottom: 12,
        }}>主要角色 · CAST · 3 NPC</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { name:'陳 Sir', role:'退休督察 · 你嘅老闆', hue:220, traits:['冷靜','講原則','酒鬼'] },
            { name:'阿薇',  role:'失蹤者嘅妹妹',        hue:340, traits:['焦慮','隱瞞','聰明'] },
            { name:'老鬼',  role:'墳場睇更',            hue:140, traits:['迷信','話多','靠得住'] },
          ].map(n => (
            <div key={n.name} style={{
              padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={n.name} size={40} hue={n.hue} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>{n.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{n.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 12 }}>
                {n.traits.map(t => (
                  <span key={t} className="mono" style={{
                    fontSize: 9.5, padding: '3px 7px', borderRadius: 3,
                    background: 'var(--surface-2)', color: 'var(--fg-muted)',
                    letterSpacing: '0.04em',
                  }}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Reviews / Comments */}
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 56px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 22 }}>
        <div className="mono" style={{
          fontSize: 11, letterSpacing: '0.16em', color: 'var(--accent)',
          textTransform: 'uppercase',
        }}>評論 · COMMENTS</div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)' }}>
          玩過嘅人點睇
        </h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>· {COMMENTS.length} REPLIES</span>
      </div>

      {!isOwn && (
        <div style={{
          padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>玩完點 rate 呢個 scenario？</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3, fontFamily: 'var(--font-cjk)' }}>每個故事限評一次 · 可加一句感想</div>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {[1,2,3,4,5].map(i => (
              <button key={i} style={{ color: 'var(--fg-faint)', padding: 2 }}>
                <Icon name="star" size={24} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {COMMENTS.map(c => <Comment key={c.id} c={c} />)}
      </div>
    </section>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Fork modal
// ─────────────────────────────────────────────────────────────
const ForkModal = ({ s = SAMPLE_STORY, adultEnabled = false }) => (
  <ScreenFrame style={{ position: 'relative' }}>
    <div style={{ filter: 'blur(3px) brightness(0.9)', pointerEvents: 'none' }}>
      <StoryDetailDesktop s={s} />
    </div>
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--overlay)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
    }}>
      <div style={{
        width: 560, background: 'var(--surface)',
        border: '1px solid var(--border-strong)', borderRadius: 16,
        padding: 28, boxShadow: 'var(--shadow-modal)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 96, flex: 'none' }}><Cover story={s} size="sm" /></div>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.14em' }}>
              FORK · 開新 PLAYTHROUGH
            </div>
            <h2 style={{
              margin: '8px 0 6px', fontSize: 22, fontWeight: 700,
              letterSpacing: '-0.02em', fontFamily: 'var(--font-cjk)',
            }}>開始 {s.title}</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55, fontFamily: 'var(--font-cjk)' }}>
              你嘅 playthrough 完全獨立 · 唔影響其他玩家嘅故事。
            </p>
          </div>
          <button style={{ width: 28, height: 28, color: 'var(--fg-muted)' }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }} />

        <div style={{ marginBottom: 20 }}>
          <label className="mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
            主角名字 · 之後可改
          </label>
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 14px', height: 44,
            background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 8,
          }}>
            <input style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              fontSize: 15, color: 'var(--fg)', fontFamily: 'var(--font-cjk)',
            }} defaultValue="陳 Sir" />
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>建議：陳 Sir / 阿傑</span>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
            敘事 AI Model
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {[
              { id:'sonnet', name:'Sonnet 4.6', tag:'平衡', price:'2', selected:true },
              { id:'haiku',  name:'Haiku 4.5',  tag:'快',   price:'1' },
              { id:'opus',   name:'Opus 4.7',   tag:'最深', price:'5', tier:'Creator' },
              { id:'gemini', name:'Gemini 2.0', tag:'長',   price:'2' },
            ].map(m => (
              <button key={m.id} style={{
                padding: '12px 14px', borderRadius: 8, textAlign: 'left',
                background: m.selected ? 'var(--accent-bg)' : 'var(--bg)',
                border: `1px solid ${m.selected ? 'var(--accent-line)' : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', gap: 3,
                opacity: m.tier ? 0.55 : 1,
                cursor: m.tier ? 'not-allowed' : 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</span>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)' }}>{m.tag}</span>
                  <div style={{ flex: 1 }} />
                  {m.tier && <span className="mono" style={{ fontSize: 9.5, color: 'var(--warn)', padding: '1px 5px', background: 'var(--warn-bg)', borderRadius: 3 }}>需 {m.tier}</span>}
                </div>
                <div className="mono" style={{ fontSize: 11, color: m.selected ? 'var(--accent)' : 'var(--fg-dim)' }}>
                  {m.price} credits / turn
                </div>
              </button>
            ))}
          </div>
          <button style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            睇全部 7 個 model <Icon name="chevron" size={10} />
          </button>
        </div>

        <div style={{
          padding: '12px 14px', background: 'var(--bg)', borderRadius: 8,
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          fontSize: 12.5, fontFamily: 'var(--font-cjk)',
        }}>
          <Icon name="info" size={14} stroke="var(--fg-muted)" />
          <span style={{ color: 'var(--fg-muted)' }}>
            每 turn 約 <span className="mono" style={{ color: 'var(--fg)' }}>~2 credits</span>
            <span style={{ margin: '0 6px' }}>·</span>
            餘額 <span className="mono" style={{ color: 'var(--ok)' }}>184 credits</span>
            <span style={{ margin: '0 6px' }}>·</span>
            隨時可停
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="soft" size="lg" style={{ flex: 1 }}>取消</Btn>
          <Btn variant="primary" size="lg" icon="play" style={{ flex: 2 }}>開始扮演</Btn>
        </div>
      </div>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Story detail · mobile
// ─────────────────────────────────────────────────────────────
const StoryDetailMobile = ({ s = SAMPLE_STORY }) => (
  <ScreenFrame>
    <TopBar mobile />
    {/* Full-bleed cover hero · mobile */}
    <section style={{ position: 'relative', height: 540, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Cover story={s} ratio="auto" titleOverride={null} showLabel={false}
          style={{ width: '100%', height: '100%', borderRadius: 0, aspectRatio: 'auto', border: 'none', boxShadow: 'none' }} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(20,18,14,0.45) 0%, transparent 25%, transparent 55%, var(--bg) 100%)',
      }} />
      <div style={{
        position: 'absolute', left: 16, right: 16, bottom: 28,
        color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.42)',
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <GenreChip genre={s.genre} />
          <RatingBadge rating={s.rating} />
        </div>
        <h1 style={{
          margin: 0, fontSize: 34, fontWeight: 700,
          lineHeight: 1.08, letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)',
        }}>{s.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 }}>
          <Avatar name={s.author} size={20} hue={s.hue} />
          <span style={{ fontWeight: 500 }}>{s.author}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>· ★ {s.stars.toFixed(1)} · 7.2k 開過</span>
        </div>
      </div>
    </section>

    <div style={{ padding: '0 16px' }}>
      <p style={{
        margin: '20px 0 0', fontSize: 14.5,
        fontFamily: 'var(--font-cjk)', lineHeight: 1.7,
        color: 'var(--fg-2)', textWrap: 'pretty',
      }}>{s.blurb}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {['偵探','香港','深夜','靈異','黑色幽默'].map(t => (
          <span key={t} style={{
            fontSize: 11, padding: '4px 9px', borderRadius: 5,
            background: 'var(--surface)', color: 'var(--fg-muted)',
            border: '1px solid var(--border)', fontFamily: 'var(--font-cjk)',
          }}>#{t}</span>
        ))}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1, background: 'var(--border)',
        borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)',
        marginTop: 24,
      }}>
        {[
          { k:'RATING',     v:'4.8' },
          { k:'OPENED',     v:'7.2k' },
          { k:'ACTIVE',     v:'482' },
          { k:'MEDIAN',     v:'14 t' },
        ].map(x => (
          <div key={x.k} style={{ padding: '14px 8px', textAlign: 'center', background: 'var(--surface)' }}>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{x.v}</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', marginTop: 4, letterSpacing: '0.08em' }}>{x.k}</div>
          </div>
        ))}
      </div>

      {/* Opening */}
      <div className="mono" style={{
        fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)',
        marginTop: 28, marginBottom: 10,
      }}>開場 · OPENING</div>
      <div style={{
        padding: 18, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
        position: 'relative', maxHeight: 220, overflow: 'hidden',
      }}>
        <p style={{
          margin: 0, fontSize: 14.5, lineHeight: 1.8,
          fontFamily: 'var(--font-cjk)', color: 'var(--fg-2)',
        }}>
          銅鑼灣，星期三，凌晨一點四十七分。<br/>
          你嘅辦公室喺一棟舊式商廈嘅七樓，招牌冇燈，個 lift 一開門就有股霉味。客人坐喺對面，五十幾歲，西裝裇衫袖口磨到起毛。佢冇報名，淨係將一張相片擺低喺枱面…
        </p>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 70,
          background: 'linear-gradient(180deg, transparent, var(--surface))',
        }} />
      </div>
      <button style={{ marginTop: 12, fontSize: 13, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        展開完整開場 <Icon name="chevron_d" size={11} />
      </button>

      {/* Cast */}
      <div className="mono" style={{
        fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)',
        marginTop: 32, marginBottom: 10,
      }}>主要角色 · 3 NPC</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { name:'陳 Sir', role:'退休督察 · 你嘅老闆', hue:220 },
          { name:'阿薇',  role:'失蹤者嘅妹妹',        hue:340 },
          { name:'老鬼',  role:'墳場睇更',            hue:140 },
        ].map(n => (
          <div key={n.name} style={{
            padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Avatar name={n.name} size={36} hue={n.hue} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>{n.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{n.role}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Comments */}
      <div className="mono" style={{
        fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)',
        marginTop: 32, marginBottom: 10,
      }}>評論 · {COMMENTS.length} REPLIES</div>
      {COMMENTS.slice(0, 2).map(c => <Comment key={c.id} c={c} />)}
      <div style={{ height: 80 }} />
    </div>

    {/* Sticky bottom CTA */}
    <div style={{
      position: 'sticky', bottom: 0, padding: '12px 16px',
      background: 'rgba(251,250,246,0.94)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>~2 CR / TURN · 餘 184</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>隨時可停 · 進度永久保存</div>
      </div>
      <Btn variant="primary" size="lg" icon="play">開始扮演</Btn>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  403 friendly · adult required
// ─────────────────────────────────────────────────────────────
const StoryDetail403 = () => (
  <ScreenFrame>
    <TopBar active="library" />
    <section style={{ maxWidth: 560, margin: '80px auto 0', padding: '0 24px', textAlign: 'center' }}>
      <span style={{
        width: 64, height: 64, margin: '0 auto', display: 'inline-flex',
        borderRadius: 16, background: 'var(--surface)',
        border: '1px solid var(--border)',
        alignItems: 'center', justifyContent: 'center', color: 'var(--warn)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <Icon name="lock" size={24} />
      </span>
      <div className="mono" style={{
        marginTop: 18, fontSize: 11, color: 'var(--warn)',
        letterSpacing: '0.14em',
      }}>HTTP 403 · ADULT MODE REQUIRED</div>
      <h1 style={{
        margin: '14px 0 12px', fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)',
      }}>
        呢個故事鎖咗喺成人模式入面
      </h1>
      <p style={{
        margin: '0 auto', fontSize: 15, color: 'var(--fg-muted)',
        lineHeight: 1.65, maxWidth: 440, fontFamily: 'var(--font-cjk)',
      }}>
        作者標記咗呢個故事為 <span className="mono" style={{ color: 'var(--fg)' }}>18+</span> 內容。
        要繼續，請喺 <span style={{ color: 'var(--fg)' }}>設定</span> 開啟成人模式（一次性身份驗證）。
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28 }}>
        <Btn variant="primary" size="lg" iconRight="arrow">前往設定</Btn>
        <Btn variant="outline" size="lg">返故事庫</Btn>
      </div>
      <div style={{
        marginTop: 32, padding: 18,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        textAlign: 'left', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, fontFamily: 'var(--font-cjk)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Icon name="info" size={14} stroke="var(--fg-muted)" />
          <div>
            <div style={{ color: 'var(--fg-2)', fontWeight: 600, marginBottom: 4 }}>點解需要驗證？</div>
            平台必須確認用戶為成年人，方可解鎖 18+ 內容。
            驗證由 Stripe Identity 處理 · 一次性 · 唔會儲低身份證件影像。
            <span style={{ color: 'var(--fg-dim)' }}>（功能 Phase 6 上線）</span>
          </div>
        </div>
      </div>
    </section>
  </ScreenFrame>
);

Object.assign(window, {
  COMMENTS, StatTile, Comment, StoryDetailDesktop, ForkModal, StoryDetailMobile, StoryDetail403,
});
