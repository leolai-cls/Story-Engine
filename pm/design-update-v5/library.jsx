// Story Engine — Phase A v2 · Library
// Grok × Netflix · light theme · cover-dominant cards · cinematic hero

// ─────────────────────────────────────────────────────────────
//  Sample data — HK + TW oriented (繁中)
// ─────────────────────────────────────────────────────────────
const STORIES = [
  { id:'cwb', title:'銅鑼灣偵探事務所',     author:'Noir',     handle:'@noir',          genre:'mystery',   rating:'pg13',    stars:4.8, plays:7220, hue:220, blurb:'你接咗一單尋人。冇預咗呢個人，其實五年前已經死過一次。' },
  { id:'kwc', title:'九龍城寨 2099',         author:'Neo',     handle:'@neo',           genre:'adventure', rating:'mature',  stars:4.7, plays:4012, hue:320, blurb:'城寨被劃為自治區。義體、走私、舊式麻雀館——你係新嚟嘅清道夫。' },
  { id:'yc',  title:'西營盤的夜茶餐廳',     author:'阿傑',     handle:'@kit_li',        genre:'mystery',   rating:'general', stars:4.6, plays:2840, hue:240, blurb:'凌晨三點開檔嘅冰室，餐牌寫住「招魂奶茶」。你係夜更，今晚有客。' },
  { id:'nl',  title:'霓虹之夜‧尖沙咀1997', author:'復古',    handle:'@retrohk',       genre:'romance',   rating:'pg13',    stars:4.6, plays:2855, hue:10,  blurb:'你係夜總會琴手。今晚有個女人坐到打烊，遞咗張紙俾你，寫住一個地址。' },
  { id:'xz',  title:'修真‧峨眉劍訣',         author:'仙俠社',  handle:'@xianxia_co',    genre:'fantasy',   rating:'pg13',    stars:4.5, plays:5611, hue:285, blurb:'掌門病重。八大長老各懷鬼胎。你係剛入門嘅外姓弟子，無人留意你嘅劍。' },
  { id:'tw1', title:'台大椰林七日戀',         author:'Evian',  handle:'@evianlin',      genre:'campus',    rating:'pg13',    stars:4.3, plays:1922, hue:80,  blurb:'迎新週剛開始。你撞落同一個人手上嘅咖啡，第七日要嚟唔嚟，由你寫。' },
  { id:'nt',  title:'新界北靈異夜',           author:'阿鬼',     handle:'@hk_ghost',      genre:'horror',    rating:'mature',  stars:4.4, plays:3022, hue:350, blurb:'返工車最後一班過咗大埔之後，車卡淨返你一個。同埋對面坐住嘅。' },
  { id:'bb',  title:'東區大球場逆襲',         author:'葉生',     handle:'@yip',           genre:'sports',    rating:'general', stars:4.1, plays:1402, hue:160, blurb:'你係替補。決賽嗰晚，正選喺更衣室扭親腳。教練望住你。' },
  { id:'yc2', title:'異世界轉生但係茶記阿姐', author:'奶茶兄',  handle:'@milktea',       genre:'fantasy',   rating:'general', stars:4.2, plays:1840, hue:50,  blurb:'你死喺收銀機面前。再開眼，係魔王城自助餐部。你嘅技能：落單，凍飲加$2。' },
  { id:'rm',  title:'西貢深夜外賣車手',     author:'午夜',    handle:'@midnight',      genre:'slice',     rating:'pg13',    stars:4.5, plays:1502, hue:190, blurb:'凌晨兩點，三張單同一個地址。係廢屋。你接定唔接？' },
  { id:'nu',  title:'NTU 補習王傳說',        author:'阿論',     handle:'@essay',         genre:'campus',    rating:'general', stars:4.0, plays:920,  hue:100, blurb:'你係補習社新人。第一日撞上傳說中嘅學霸學生，佢上堂淨係玩手機。' },
  { id:'dt',  title:'失蹤的辦公室同事',     author:'卷宗',    handle:'@case_files',    genre:'mystery',   rating:'mature',  stars:4.3, plays:982,  hue:270, blurb:'Karen 連續三日冇返工，但 Slack status 一直 active。HR 叫你睇下。' },
];

const ACTIVE = [
  { story: STORIES[0], turn: 84, npc: '陳 Sir',
    snippet: '「你個人不如我想像中那麼樸。」陳 Sir 告訴你。',
    delta: { axis:'trust', val:+15 }, lastPlayed: '2 小時前' },
  { story: STORIES[1], turn: 31, npc: '阿狗',
    snippet: '電梯門一闔，你聽見階梯間裡面有腳步聲。',
    delta: { axis:'fear', val:+8 },   lastPlayed: '昨天' },
  { story: STORIES[3], turn: 17, npc: '阿薇',
    snippet: '「你看見嘞。」阿薇說，手指指向那個坐在金鐘衡上嘅女人。',
    delta: { axis:'trust', val:+12 }, lastPlayed: '上週' },
];

const AXIS_LABEL = { trust:'信任', romance:'戀慕', respect:'敬重', fear:'懼怕' };
const AXIS_VAR   = { trust:'--axis-trust', romance:'--axis-romance', respect:'--axis-respect', fear:'--axis-fear' };

// ─────────────────────────────────────────────────────────────
//  Story card — cover-dominant (Netflix-style)
//  Cover: ~85% of visual weight · 2 lines meta below in mono
// ─────────────────────────────────────────────────────────────
const StoryCard = ({ s, w = 224, eager = false }) => (
  <article style={{
    width: w, flex: 'none', display: 'flex', flexDirection: 'column',
    cursor: 'pointer',
    transition: 'transform .25s var(--ease)',
  }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
    <div style={{ position: 'relative' }}>
      <Cover story={s} ratio="3 / 4" size="md" />
      {/* Rating + plays float bottom-right */}
      <div style={{
        position: 'absolute', right: 10, top: 10,
        display: 'flex', gap: 5,
      }}>
        <RatingBadge rating={s.rating} />
      </div>
      <div style={{
        position: 'absolute', right: 10, bottom: 10,
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 999,
        background: 'rgba(20,18,14,0.55)', backdropFilter: 'blur(8px)',
        color: '#fff',
      }}>
        <span style={{ color: '#f4d77a', fontSize: 11 }}>★</span>
        <span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>{s.stars.toFixed(1)}</span>
      </div>
    </div>
    {/* Sparse meta line below */}
    <div style={{
      marginTop: 10, paddingLeft: 2,
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, color: 'var(--fg-muted)',
    }}>
      <Avatar name={s.author} size={16} hue={s.hue} />
      <span style={{ color: 'var(--fg-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.author}</span>
      <span style={{ color: 'var(--fg-faint)' }}>·</span>
      <span className="mono">{s.plays >= 1000 ? (s.plays / 1000).toFixed(1) + 'k' : s.plays}</span>
    </div>
  </article>
);

// ─────────────────────────────────────────────────────────────
//  Continue-playing card · large, narrative anchor, disposition delta
// ─────────────────────────────────────────────────────────────
const ContinueCard = ({ p }) => {
  const ax = AXIS_VAR[p.delta.axis];
  return (
    <article style={{
      width: 380, flex: 'none', display: 'flex', gap: 16,
      padding: 14, background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 12,
      boxShadow: 'var(--shadow-card)',
      cursor: 'pointer',
      transition: 'border-color .2s var(--ease), box-shadow .2s var(--ease)',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-pop)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}>
      <div style={{ width: 92, flex: 'none' }}>
        <Cover story={p.story} ratio="3 / 4" size="sm" />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
          TURN {p.turn} · {p.lastPlayed.toUpperCase()}
        </div>
        <h3 style={{
          margin: '4px 0 0', fontSize: 15, fontWeight: 600,
          fontFamily: 'var(--font-cjk)', letterSpacing: '-0.005em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{p.story.title}</h3>
        <p style={{
          margin: '6px 0 0', fontSize: 12, color: 'var(--fg-muted)',
          fontFamily: 'var(--font-cjk)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{p.snippet}</p>
        <div style={{ flex: 1, minHeight: 8 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingTop: 10, borderTop: '1px solid var(--border)',
        }}>
          <Btn variant="primary" size="sm" icon="play">繼續</Btn>
          <span style={{
            display:'inline-flex', alignItems:'center', gap: 4,
            fontSize: 11,
          }}>
            <span style={{ color: 'var(--fg-muted)' }}>{p.npc}</span>
            <span className="mono" style={{ color: `var(${ax})`, fontWeight: 600 }}>
              {AXIS_LABEL[p.delta.axis]} {p.delta.val > 0 ? '+' : ''}{p.delta.val}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
};

// ─────────────────────────────────────────────────────────────
//  Carousel row — Grok mono row title + dense scroll cadence
// ─────────────────────────────────────────────────────────────
const Carousel = ({ kicker, title, count, items, renderItem, padding = 56, gap = 18 }) => {
  if (!items || items.length === 0) return null;
  return (
    <section style={{ marginTop: 44, paddingLeft: padding }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18, paddingRight: padding }}>
        <div className="mono" style={{
          fontSize: 10.5, letterSpacing: '0.16em',
          color: 'var(--accent)', textTransform: 'uppercase',
        }}>{kicker}</div>
        <h2 style={{
          margin: 0, fontSize: 22, fontWeight: 600,
          letterSpacing: '-0.018em', fontFamily: 'var(--font-cjk)',
        }}>{title}</h2>
        {count !== undefined && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            · {count} stories
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button style={{
          fontSize: 12, color: 'var(--fg-muted)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 0',
        }}>
          全部 <Icon name="arrow" size={11} />
        </button>
      </header>
      <div className="row-scroll" style={{
        display: 'flex', gap, overflowX: 'auto', paddingBottom: 18, paddingRight: padding,
      }}>
        {items.map(item => renderItem(item))}
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
//  Cinematic hero — full-bleed cover · auto-cycle indicator
// ─────────────────────────────────────────────────────────────
const LibraryHero = ({ story = STORIES[0], slideIdx = 0, total = 4, search = true }) => (
  <section style={{
    position: 'relative', overflow: 'hidden',
    height: 520, margin: '0',
    borderBottom: '1px solid var(--border)',
  }}>
    {/* Background cover, full-bleed */}
    <div style={{ position: 'absolute', inset: 0 }}>
      <Cover story={story} ratio="auto" size="lg" titleOverride={null} showLabel={false}
        style={{
          width: '100%', height: '100%', borderRadius: 0,
          aspectRatio: 'auto',
          border: 'none', boxShadow: 'none',
        }} />
    </div>
    {/* Right-fade overlay → paper bg */}
    <div style={{
      position: 'absolute', inset: 0,
      background: `
        linear-gradient(90deg, rgba(20,18,14,0.55) 0%, rgba(20,18,14,0.25) 30%, transparent 55%),
        linear-gradient(0deg, var(--bg) 0%, transparent 30%),
        linear-gradient(270deg, var(--bg) 0%, transparent 45%)`,
    }} />
    {/* Top chrome — search inset over hero */}
    {search && (
      <div style={{
        position: 'absolute', top: 22, left: 56, right: 56,
        display: 'flex', alignItems: 'center', gap: 14, zIndex: 2,
      }}>
        <div style={{
          flex: 1, maxWidth: 480,
          display: 'flex', alignItems: 'center', gap: 8,
          height: 38, padding: '0 14px',
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          <Icon name="search" size={14} stroke="var(--fg-dim)" />
          <span style={{ fontSize: 13, color: 'var(--fg-dim)', flex: 1 }}>
            搜尋故事、作者、tag…
          </span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--fg-dim)',
            padding: '2px 5px', borderRadius: 3,
            background: 'rgba(20,18,14,0.06)',
          }}>⌘K</span>
        </div>
      </div>
    )}

    {/* Hero content — bottom-left aligned */}
    <div style={{
      position: 'absolute', left: 56, right: 56, bottom: 56,
      maxWidth: 640, color: '#fff', zIndex: 2,
      textShadow: '0 1px 8px rgba(0,0,0,0.4)',
    }}>
      <div className="mono" style={{
        fontSize: 11, letterSpacing: '0.18em',
        color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase',
      }}>
        <span style={{ color: '#f4d77a' }}>★ 編輯精選</span>
        <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.55)' }}>
          FEATURED · {(GENRE[story.genre] || {}).label} · {story.stars.toFixed(1)}/5
        </span>
      </div>
      <h1 style={{
        margin: '14px 0 0', fontSize: 56, fontWeight: 700,
        lineHeight: 1.05, letterSpacing: '-0.03em',
        fontFamily: 'var(--font-cjk)', color: '#fff',
        textWrap: 'balance',
      }}>{story.title}</h1>
      <p style={{
        margin: '18px 0 0', fontSize: 16,
        fontFamily: 'var(--font-cjk)', lineHeight: 1.65,
        color: 'rgba(255,255,255,0.88)',
        textWrap: 'pretty', maxWidth: 540,
      }}>{story.blurb}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
        <Btn variant="primary" size="lg" icon="play"
          style={{ background: '#fff', color: '#0a0a0b', fontWeight: 600 }}>
          開始扮演
        </Btn>
        <Btn variant="outline" size="lg" icon="info"
          style={{ background: 'rgba(20,18,14,0.32)', color: '#fff', borderColor: 'rgba(255,255,255,0.32)' }}>
          詳情
        </Btn>
        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.18)', margin: '0 6px' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
          <Avatar name={story.author} size={20} hue={story.hue} />
          <span style={{ color: '#fff' }}>{story.author}</span>
          <span className="mono" style={{ color: 'rgba(255,255,255,0.55)' }}>{story.handle}</span>
        </span>
      </div>
    </div>

    {/* Cycle indicator — bottom-right */}
    <div style={{
      position: 'absolute', right: 56, bottom: 56, zIndex: 2,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            width: i === slideIdx ? 28 : 8, height: 3,
            borderRadius: 2,
            background: i === slideIdx ? '#fff' : 'rgba(255,255,255,0.35)',
            transition: 'width .25s var(--ease)',
          }} />
        ))}
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.08em' }}>
        {String(slideIdx + 1).padStart(2,'0')} / {String(total).padStart(2,'0')}
      </span>
    </div>
  </section>
);

// ─────────────────────────────────────────────────────────────
//  Genre rail — sticky filter strip below hero
// ─────────────────────────────────────────────────────────────
const GenreRail = ({ adultEnabled = false }) => {
  const items = [
    { id:'all', label:'全部', active:true },
    ...Object.keys(GENRE).map(k => ({ id:k, label:GENRE[k].label, icon:GENRE[k].icon })),
  ];
  return (
    <div style={{
      position: 'sticky', top: 56, zIndex: 5,
      background: 'rgba(251,250,246,0.92)', backdropFilter: 'blur(14px)',
      borderBottom: '1px solid var(--border)',
      padding: '14px 56px',
      display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto',
    }}>
      {items.map(t => (
        <button key={t.id} style={{
          height: 32, padding: '0 14px', borderRadius: 999,
          fontSize: 13,
          background: t.active ? 'var(--fg)' : 'transparent',
          border: t.active ? '1px solid var(--fg)' : '1px solid var(--border)',
          flex: 'none', fontFamily: 'var(--font-cjk)',
          fontWeight: t.active ? 500 : 400,
          color: t.active ? 'var(--bg)' : 'var(--fg-muted)',
        }}>
          {t.label}
        </button>
      ))}
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
      <button style={{
        height: 32, padding: '0 14px', borderRadius: 999,
        fontSize: 13, color: 'var(--fg-muted)',
        background: 'transparent', border: '1px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
      }}>
        <Icon name="filter" size={12} /> 篩選
      </button>
      {!adultEnabled && (
        <button style={{
          height: 32, padding: '0 14px', borderRadius: 999,
          fontSize: 13, color: 'var(--fg-dim)',
          background: 'transparent', border: '1px solid var(--border)',
          display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
          cursor: 'not-allowed',
        }}>
          <Icon name="lock" size={11} /> 18+
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Library · desktop
// ─────────────────────────────────────────────────────────────
const LibraryDesktop = () => (
  <ScreenFrame>
    <TopBar active="library" />
    <LibraryHero story={STORIES[0]} slideIdx={0} total={4} />
    <GenreRail />

    <Carousel kicker="繼續玩 · CONTINUE" title="返到你停低嗰度" count={ACTIVE.length}
      items={ACTIVE} renderItem={p => <ContinueCard key={p.story.id} p={p} />} />

    <Carousel kicker="熱門 · TRENDING 24H" title="而家最多人玩"
      items={STORIES} renderItem={s => <StoryCard key={s.id} s={s} />} />

    <Carousel kicker="最新 · JUST IN" title="幾分鐘前發佈"
      items={[...STORIES].reverse()} renderItem={s => <StoryCard key={s.id} s={s} />} />

    <Carousel kicker="戀愛 · ROMANCE" title="心動嘅 scenarios"
      items={STORIES.filter(s => s.genre === 'romance' || s.id === 'tw1')}
      renderItem={s => <StoryCard key={s.id} s={s} />} />

    <Carousel kicker="懸疑 · MYSTERY" title="解謎人物嘅一夜"
      items={STORIES.filter(s => s.genre === 'mystery')}
      renderItem={s => <StoryCard key={s.id} s={s} />} />

    <Carousel kicker="奇幻 · FANTASY" title="另一個世界"
      items={STORIES.filter(s => s.genre === 'fantasy')}
      renderItem={s => <StoryCard key={s.id} s={s} />} />

    <div style={{ height: 80 }} />
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Library · visitor landing — cinematic full-bleed pitch
// ─────────────────────────────────────────────────────────────
const LibraryVisitor = () => (
  <ScreenFrame>
    <div style={{
      height: 60, padding: '0 56px', display: 'flex', alignItems: 'center', gap: 14,
      background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))' }} />
        <div className="mono" style={{ fontSize: 15, letterSpacing: '-0.02em' }}>story.engine</div>
      </div>
      <div style={{ flex: 1 }} />
      <Btn variant="ghost" size="sm">登入</Btn>
      <Btn variant="primary" size="sm" icon="sparkle">一鍵試玩</Btn>
    </div>

    {/* Hero pitch — left-aligned text · right side: 3-tile cover collage */}
    <section style={{
      padding: '72px 56px 0', position: 'relative',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center',
      minHeight: 540,
    }}>
      <div>
        <div className="mono" style={{
          fontSize: 11, letterSpacing: '0.18em', color: 'var(--accent)',
          textTransform: 'uppercase',
        }}>
          中文圈第一個 互動小說 RPG · BETA
        </div>
        <h1 style={{
          margin: '20px 0 0', fontSize: 64, fontWeight: 700,
          lineHeight: 1.02, letterSpacing: '-0.035em',
          fontFamily: 'var(--font-cjk)',
          textWrap: 'balance',
        }}>
          每個決定<br/>都被記住。
        </h1>
        <p style={{
          margin: '24px 0 0', fontSize: 17, color: 'var(--fg-2)',
          lineHeight: 1.6, fontFamily: 'var(--font-cjk)',
          textWrap: 'pretty', maxWidth: 480,
        }}>
          AI 即時寫敘事 · NPC 有自己嘅紅線同好感度 · 4 層長期記憶記住你做過嘅每一件事。<br/>
          <span style={{ color: 'var(--fg-muted)' }}>唔係 chatbot · 係一個會記得你嘅世界。</span>
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <Btn variant="primary" size="lg" iconRight="arrow">一鍵 Guest 試玩</Btn>
          <Btn variant="outline" size="lg">用 Email 登入</Btn>
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--fg-dim)' }}>
          無需信用卡 · 即時開始 · Guest 有獨立 credit 餘額
        </div>
      </div>

      {/* Right: layered cover collage */}
      <div style={{ position: 'relative', height: 480 }}>
        <div style={{
          position: 'absolute', right: 0, top: 20, width: 220,
          transform: 'rotate(4deg)',
        }}><Cover story={STORIES[0]} ratio="3 / 4" size="md" /></div>
        <div style={{
          position: 'absolute', left: 60, top: 80, width: 200,
          transform: 'rotate(-6deg)',
        }}><Cover story={STORIES[4]} ratio="3 / 4" size="md" /></div>
        <div style={{
          position: 'absolute', right: 80, bottom: 0, width: 200,
          transform: 'rotate(-2deg)',
        }}><Cover story={STORIES[3]} ratio="3 / 4" size="md" /></div>
      </div>
    </section>

    {/* Sample row */}
    <Carousel kicker="精選 · START HERE" title="揀一個世界試下"
      items={STORIES.slice(0, 7)} renderItem={s => <StoryCard key={s.id} s={s} />} />

    {/* Three-pillar trust section */}
    <section style={{ padding: '60px 56px', borderTop: '1px solid var(--border)', marginTop: 60 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
        {[
          { num:'01', kicker:'4 LAYER MEMORY',          title:'AI 記得你做過嘅事',     body:'近 20 turn 全文 · 滾動章節摘要 · pgvector 語意搜尋 · 自動 lorebook。對手戲嘅關係會 evolve。' },
          { num:'02', kicker:'PERMANENT CONSEQUENCES', title:'失敗唔可以重玩呢個 turn',body:'NPC 拒絕你 · 角色信任跌 · 都係永久記入故事。冇 retry button。' },
          { num:'03', kicker:'4-AXIS DISPOSITION',      title:'每個 NPC 都有自己嘅紅線',  body:'信任 · 戀慕 · 敬重 · 懼怕——四條軸 -100 到 +100。你嘅 charm 對某啲人 work，對某啲人完全唔 work。' },
        ].map(f => (
          <div key={f.num} style={{ borderTop: '1px solid var(--border)', paddingTop: 22 }}>
            <div className="mono" style={{
              fontSize: 44, fontWeight: 500, color: 'var(--fg-faint)',
              letterSpacing: '-0.02em', lineHeight: 1,
            }}>{f.num}</div>
            <div className="mono" style={{
              marginTop: 18, fontSize: 10.5, letterSpacing: '0.16em',
              color: 'var(--accent)',
            }}>{f.kicker}</div>
            <h3 style={{
              margin: '8px 0 0', fontSize: 19, fontWeight: 600,
              fontFamily: 'var(--font-cjk)', letterSpacing: '-0.015em',
            }}>{f.title}</h3>
            <p style={{
              margin: '10px 0 0', fontSize: 13, color: 'var(--fg-muted)',
              lineHeight: 1.75, fontFamily: 'var(--font-cjk)',
            }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
    <div style={{ height: 80 }} />
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Library · Adult mode ON (CSAM banner)
// ─────────────────────────────────────────────────────────────
const LibraryAdultOn = () => (
  <ScreenFrame>
    <TopBar active="library" />
    <div style={{
      padding: '12px 56px',
      background: 'var(--danger-bg)',
      borderBottom: '1px solid oklch(0.55 0.15 25 / 0.3)',
      display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 12.5, color: 'var(--fg-2)',
    }}>
      <Icon name="warn" size={13} stroke="var(--danger)" />
      <span className="mono" style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: '0.06em' }}>18+ ON</span>
      <span>平台嚴禁涉及未成年人士、真實人物或非法內容嘅創作。違者帳號永久停權並依法通報。</span>
      <div style={{ flex: 1 }} />
      <button style={{ fontSize: 11.5, color: 'var(--fg-muted)', textDecoration: 'underline' }}>了解詳情</button>
    </div>
    <LibraryHero story={STORIES[1]} slideIdx={1} total={4} />
    <GenreRail adultEnabled />
    <Carousel kicker="18+ · ADULT NSFW" title="成人 scenarios"
      items={STORIES.slice(1, 8).map(s => ({ ...s, rating: 'adult' }))}
      renderItem={s => <StoryCard key={s.id} s={s} />} />
    <Carousel kicker="熱門 · TRENDING 24H" title="而家最多人玩"
      items={STORIES} renderItem={s => <StoryCard key={s.id} s={s} />} />
    <div style={{ height: 80 }} />
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Library · 1-char search hint
// ─────────────────────────────────────────────────────────────
const LibrarySearchEmpty = () => (
  <ScreenFrame>
    <TopBar active="library" />
    <div style={{ padding: '32px 56px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 44, padding: '0 16px',
        background: 'var(--surface)', border: '1px solid var(--accent-line)',
        borderRadius: 10,
        boxShadow: '0 0 0 3px var(--accent-bg)',
        maxWidth: 720,
      }}>
        <Icon name="search" size={16} stroke="var(--accent)" />
        <span style={{ fontSize: 15, flex: 1, color: 'var(--fg)' }}>城</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>1 / 2 char</span>
        <button style={{ color: 'var(--fg-muted)', padding: 4 }}><Icon name="close" size={13} /></button>
      </div>
    </div>
    <div style={{
      margin: '24px 56px 0', maxWidth: 720, padding: 22,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      display: 'flex', gap: 16,
    }}>
      <span style={{
        width: 40, height: 40, flex: 'none', borderRadius: 10,
        background: 'var(--accent-bg)', color: 'var(--accent)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name="search" size={18} /></span>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>再打多一個字</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55, fontFamily: 'var(--font-cjk)' }}>
          中文搜尋至少需要 2 個字 · 例如「城寨」、「校園」、「奇幻」。<br/>
          英文搜尋可以由 3 個字母開始。
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {['校園戀愛', '九龍城寨', '修真', 'mystery', '茶餐廳'].map(t => (
            <button key={t} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
              background: 'var(--surface-2)', color: 'var(--fg-2)',
              border: '1px solid var(--border)',
            }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
    <div className="mono" style={{
      padding: '36px 56px 4px', fontSize: 11, color: 'var(--accent)',
      letterSpacing: '0.16em', textTransform: 'uppercase',
    }}>
      或瀏覽建議 · BROWSE INSTEAD
    </div>
    <Carousel kicker="熱門 · TRENDING" title="今日多人玩"
      items={STORIES.slice(0, 8)} renderItem={s => <StoryCard key={s.id} s={s} />} />
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Library · loading skeleton
// ─────────────────────────────────────────────────────────────
const LibraryLoading = () => {
  const Skel = ({ w, h, r = 6, style }) => (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, var(--surface-2) 0%, var(--surface) 50%, var(--surface-2) 100%)',
      backgroundSize: '200% 100%',
      animation: 'se-shimmer 1.4s var(--ease) infinite',
      ...style,
    }} />
  );
  return (
    <ScreenFrame>
      <style>{`@keyframes se-shimmer { 0% {background-position: 200% 0} 100% {background-position: -200% 0} }`}</style>
      <TopBar active="library" />
      {/* Hero skeleton */}
      <div style={{ position: 'relative', height: 520, padding: '22px 56px 56px', background: 'var(--surface-2)' }}>
        <Skel w={400} h={36} style={{ position: 'absolute', top: 22, left: 56 }} />
        <div style={{ position: 'absolute', bottom: 56, left: 56 }}>
          <Skel w={180} h={11} />
          <div style={{ height: 12 }} />
          <Skel w={420} h={56} />
          <div style={{ height: 14 }} />
          <Skel w={520} h={16} />
          <div style={{ height: 28 }} />
          <Skel w={300} h={48} r={8} />
        </div>
      </div>
      {[0, 1, 2].map(row => (
        <section key={row} style={{ paddingLeft: 56, marginTop: 44 }}>
          <Skel w={220} h={20} style={{ marginBottom: 18 }} />
          <div style={{ display: 'flex', gap: 18, overflow: 'hidden', paddingRight: 56 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ width: 224, flex: 'none' }}>
                <Skel w={224} h={299} r={10} />
                <div style={{ height: 10 }} />
                <Skel w={140} h={11} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────
//  Library · mobile
// ─────────────────────────────────────────────────────────────
const LibraryMobile = () => (
  <ScreenFrame>
    <TopBar mobile />
    {/* Compact cinematic hero */}
    <section style={{
      position: 'relative', height: 460, overflow: 'hidden',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Cover story={STORIES[0]} ratio="auto" titleOverride={null} showLabel={false}
          style={{ width: '100%', height: '100%', borderRadius: 0, aspectRatio: 'auto', border: 'none', boxShadow: 'none' }} />
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 30%, rgba(20,18,14,0.78) 80%, var(--bg) 100%)',
      }} />
      <div style={{
        position: 'absolute', left: 16, right: 16, bottom: 24,
        color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)',
      }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', color: '#f4d77a' }}>
          ★ 編輯精選 · MYSTERY
        </div>
        <h1 style={{
          margin: '10px 0 8px', fontSize: 28, fontWeight: 700,
          lineHeight: 1.1, letterSpacing: '-0.025em', fontFamily: 'var(--font-cjk)',
        }}>{STORIES[0].title}</h1>
        <p style={{
          margin: 0, fontSize: 13.5, fontFamily: 'var(--font-cjk)',
          color: 'rgba(255,255,255,0.85)', lineHeight: 1.55,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{STORIES[0].blurb}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Btn variant="primary" size="md" icon="play" style={{ background: '#fff', color: '#0a0a0b', flex: 1 }}>開始扮演</Btn>
          <Btn variant="outline" size="md" style={{ background: 'rgba(20,18,14,0.32)', color: '#fff', borderColor: 'rgba(255,255,255,0.32)' }}>詳情</Btn>
        </div>
      </div>
    </section>

    {/* Genre rail mobile */}
    <div className="row-scroll" style={{
      padding: '14px 16px 0', display: 'flex', gap: 6, overflowX: 'auto',
      borderBottom: '1px solid var(--border)', paddingBottom: 14,
    }}>
      {['全部','戀愛','冒險','校園','奇幻','運動','懸疑','恐怖'].map((t, i) => (
        <button key={t} style={{
          height: 30, padding: '0 12px', borderRadius: 999,
          fontSize: 12, color: i === 0 ? 'var(--bg)' : 'var(--fg-muted)',
          background: i === 0 ? 'var(--fg)' : 'transparent',
          border: i === 0 ? '1px solid var(--fg)' : '1px solid var(--border)',
          flex: 'none', whiteSpace: 'nowrap', fontFamily: 'var(--font-cjk)',
        }}>{t}</button>
      ))}
    </div>

    <Carousel padding={16} gap={12} kicker="繼續玩 · CONTINUE" title="返去你停低嗰度"
      items={ACTIVE} renderItem={p => <ContinueCard key={p.story.id} p={p} />} />
    <Carousel padding={16} gap={12} kicker="熱門 · TRENDING" title="而家最多人玩"
      items={STORIES.slice(0, 8)} renderItem={s => <StoryCard key={s.id} s={s} w={152} />} />
    <Carousel padding={16} gap={12} kicker="最新 · JUST IN" title="幾分鐘前發佈"
      items={[...STORIES].reverse()} renderItem={s => <StoryCard key={s.id} s={s} w={152} />} />
    <Carousel padding={16} gap={12} kicker="懸疑 · MYSTERY" title="解謎人物嘅一夜"
      items={STORIES.filter(s => s.genre === 'mystery')}
      renderItem={s => <StoryCard key={s.id} s={s} w={152} />} />
    <div style={{ height: 80 }} />

    <nav style={{
      position: 'sticky', bottom: 0,
      background: 'var(--bg-elev)', borderTop: '1px solid var(--border)',
      height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    }}>
      {[
        { id:'lib', icon:'grid', label:'故事' },
        { id:'play',icon:'play', label:'進行中' },
        { id:'new', icon:'plus', label:'創作' },
        { id:'set', icon:'user', label:'我' },
      ].map((t, i) => (
        <button key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: i === 0 ? 'var(--fg)' : 'var(--fg-dim)',
          fontSize: 10.5,
        }}>
          <Icon name={t.icon} size={19} strokeWidth={i === 0 ? 1.8 : 1.5} />
          {t.label}
        </button>
      ))}
    </nav>
  </ScreenFrame>
);

Object.assign(window, {
  STORIES, ACTIVE, AXIS_LABEL, AXIS_VAR,
  StoryCard, ContinueCard, Carousel, LibraryHero, GenreRail,
  LibraryDesktop, LibraryVisitor, LibrarySearchEmpty, LibraryLoading,
  LibraryAdultOn, LibraryMobile,
  FilterBar: GenreRail, // backward compat for any caller
});
