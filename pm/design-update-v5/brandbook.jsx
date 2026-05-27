// Kieio brandbook v4 — locked direction
// (o) KIEIO · Termina Bold + Gimbal Extended · Lakers Purple primary · solid colors

const PURPLE = '#552583';
const CHARCOAL = '#0f0f11';
const WHITE = '#ffffff';

// Letter-spacing matching PSD tracking (1/1000 em units in Photoshop)
const LS_O = '-0.025em';  // PSD -25
const LS_K = '-0.050em';  // PSD -50

// ─── Logo primitives ──────────────────────────────────────────────────
// Inline (o) using the Gimbal Extended font + style tracking.
function Mark({ size = 200, color = PURPLE }) {
  return (
    <span style={{
      fontFamily: 'Gimbal Extended, sans-serif',
      fontWeight: 400,
      fontSize: size,
      letterSpacing: LS_O,
      color,
      lineHeight: 1,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>(o)</span>
  );
}

// Inline KIEIO using Termina Bold + tracking.
function Wordmark({ size = 100, color = WHITE }) {
  return (
    <span style={{
      fontFamily: 'Termina, sans-serif',
      fontWeight: 700,
      fontSize: size,
      letterSpacing: LS_K,
      color,
      lineHeight: 1,
      display: 'inline-block',
    }}>KIEIO</span>
  );
}

// Full horizontal lockup
function Logo({ size = 60, mark = PURPLE, word = WHITE }) {
  // (o) renders at ~1.35x the wordmark size for visual balance
  return (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: size * 0.35, lineHeight: 1, whiteSpace: 'nowrap'}}>
      <Mark size={size * 1.35} color={mark}/>
      <Wordmark size={size} color={word}/>
    </span>
  );
}

// Stacked lockup
function LogoStacked({ size = 60, mark = PURPLE, word = WHITE }) {
  return (
    <span style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.3, lineHeight: 1}}>
      <Mark size={size * 1.6} color={mark}/>
      <Wordmark size={size} color={word}/>
    </span>
  );
}

// ─── Shared chrome ────────────────────────────────────────────────────
const v4 = {
  board: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  pad: { position: 'absolute', inset: 0, padding: '56px 64px', display: 'flex', flexDirection: 'column' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 28 },
  topLabel: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--k-on-dark-soft)' },
  topPath:  { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.18em', color: 'var(--k-on-dark-dim)', textTransform: 'uppercase' },
  h2: { fontFamily: 'Termina, sans-serif', fontWeight: 700, fontSize: 32, letterSpacing: LS_K, lineHeight: 1.1, color: 'var(--k-on-dark)', marginBottom: 14, textTransform: 'uppercase' },
  lede: { fontFamily: 'Geist, sans-serif', fontSize: 14, lineHeight: 1.6, color: 'var(--k-on-dark-soft)', maxWidth: 620 },
  mono: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--k-on-dark-dim)' },
  foot: { marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--k-line-dark)', display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.16em', color: 'var(--k-on-dark-dim)', textTransform: 'uppercase' },
};
// Light-page variants (for spreads on light surfaces)
const v4l = {
  ...v4,
  topLabel: { ...v4.topLabel, color: 'rgba(15,15,17,0.65)' },
  topPath:  { ...v4.topPath,  color: 'rgba(15,15,17,0.45)' },
  h2:       { ...v4.h2,       color: 'var(--k-charcoal)' },
  lede:     { ...v4.lede,     color: 'rgba(15,15,17,0.65)' },
  mono:     { ...v4.mono,     color: 'rgba(15,15,17,0.50)' },
  foot:     { ...v4.foot,     color: 'rgba(15,15,17,0.50)', borderTop: '1px solid var(--k-line-light)' },
};

function Chrome({ num, title, total = 12, mode = 'dark', children }) {
  const s = mode === 'light' ? v4l : v4;
  return (
    <div className={'k-page' + (mode === 'light' ? ' light' : '')} style={v4.board}>
      <div style={v4.pad}>
        <div style={v4.top}>
          <span style={s.topLabel}>Kieio · Brandbook v4 · Locked</span>
          <span style={s.topPath}>{String(num).padStart(2,'0')} / {String(total).padStart(2,'0')} · {title}</span>
        </div>
        {children}
        <div style={s.foot}>
          <span>kieio.com · /KEE-yo/</span>
          <span>You imagine · KIEIO narrates · You become</span>
        </div>
      </div>
    </div>
  );
}

/* ─── 01 · COVER ────────────────────────────────────────────────────── */
function BBCover() {
  return (
    <Chrome num={1} title="Cover">
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <div style={{marginBottom: 56}}>
          <span style={{...v4.mono, fontSize: 11}}>
            <span style={{display:'inline-block', width:6, height:6, borderRadius:'50%', background: PURPLE, marginRight: 10, verticalAlign:'middle'}}/>
            /ˈkiː.oʊ/ · KEE-yo · 讀「KEE-yo」
          </span>
        </div>
        <Logo size={108} mark={PURPLE} word={WHITE}/>
        <div style={{marginTop: 56, fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 36, letterSpacing: LS_K, color:'var(--k-on-dark-soft)', lineHeight: 1.15, textTransform:'uppercase'}}>
          You imagine.<br/>
          <span style={{color: PURPLE}}>KIEIO</span> narrates.<br/>
          You become.
        </div>
        <div style={{marginTop: 16, fontFamily:'Noto Sans TC, sans-serif', fontSize: 17, color:'var(--k-on-dark-dim)', letterSpacing: '0.04em'}}>
          你想像 · KIEIO 講述 · 你成為
        </div>
      </div>
      <div style={v4.foot}>
        <span>Brandbook v4 · 2026.05</span>
        <span>(O) KIEIO · Termina Bold + Gimbal Extended</span>
      </div>
    </Chrome>
  );
}

/* ─── 02 · THE NAME ─────────────────────────────────────────────────── */
function BBName() {
  return (
    <Chrome num={2} title="The name">
      <div style={v4.h2}>KIEIO. Say it like Leo, with a K.</div>
      <div style={v4.lede}>The name doesn't tell you what we do. It's a sound — two syllables you carry the way you carry Notion, Arc, Mubi. Meaning accumulates from use.</div>
      <div style={{flex: 1, display:'flex', alignItems:'center', gap: 56, marginTop: 32}}>
        <div style={{flex: 1.4}}>
          <div style={v4.mono}>How to say it</div>
          <div style={{marginTop: 14, fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 110, letterSpacing: LS_K, lineHeight: 1, textTransform:'uppercase'}}>
            KEE<span style={{color: PURPLE}}>·</span>YO
          </div>
          <div style={{marginTop: 14, fontFamily:'JetBrains Mono, monospace', fontSize: 22, letterSpacing:'0.16em', color:'var(--k-on-dark-soft)'}}>
            / ˈ k i ː . o ʊ /
          </div>
        </div>
        <div style={{width: 1, height: 220, background:'var(--k-line-dark)'}}/>
        <div style={{flex: 1, display:'flex', flexDirection:'column', gap: 18}}>
          <div>
            <div style={v4.mono}>Rhymes with</div>
            <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 22, marginTop: 6, textTransform:'uppercase', letterSpacing: LS_K, color:'var(--k-on-dark)'}}>Leo · Cleo · Theo</div>
          </div>
          <div>
            <div style={v4.mono}>Never</div>
            <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 18, color:'var(--k-on-dark-dim)', marginTop: 6, textTransform:'uppercase', letterSpacing: LS_K, textDecoration:'line-through'}}>KIGH-yo · ki-EYE-yo</div>
          </div>
          <div>
            <div style={v4.mono}>繁中</div>
            <div style={{fontFamily:'Noto Sans TC, sans-serif', fontSize: 22, fontWeight: 600, marginTop: 6, color:'var(--k-on-dark)'}}>「KEE-yo」 · 兩個音節</div>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 03 · WORDMARK ─────────────────────────────────────────────────── */
function BBWordmark() {
  return (
    <Chrome num={3} title="Wordmark">
      <div style={v4.h2}>(o) KIEIO. Two fonts. One mark.</div>
      <div style={v4.lede}>
        The mark is (o) set in <strong style={{color:'var(--k-on-dark)'}}>Gimbal Extended Regular</strong>. The wordmark is KIEIO in <strong style={{color:'var(--k-on-dark)'}}>Termina Bold</strong>. Together they read as cinematic, geometric, AI-native. Tracking: (o) at −25, KIEIO at −50 (PSD units).
      </div>
      <div style={{flex: 1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap: 48, marginTop: 18}}>
        <Logo size={120} mark={PURPLE} word={WHITE}/>
        <div style={{display:'flex', gap: 56, alignItems:'center'}}>
          {[60, 36, 22].map((h) => (
            <div key={h} style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 12}}>
              <Logo size={h} mark={PURPLE} word={WHITE}/>
              <span style={v4.mono}>{h}px</span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 04 · THE MARK ─────────────────────────────────────────────────── */
function BBMark() {
  return (
    <Chrome num={4} title="The mark · (o)">
      <div style={v4.h2}>A lens. An eye. A portal.</div>
      <div style={v4.lede}>
        The mark is a typographic device — two parens cupping a lowercase o, set in Gimbal Extended Regular. It can be typed: "(o)". The favicon ladder drops the parens below 24px and the o survives alone.
      </div>
      <div style={{flex: 1, display:'flex', alignItems:'center', justifyContent:'center', gap: 72, marginTop: 18}}>
        <div style={{padding: '40px 56px', background:'var(--k-charcoal-2)', borderRadius: 8, border: '1px solid var(--k-line-dark)'}}>
          <Mark size={200} color={PURPLE}/>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap: 20, maxWidth: 320}}>
          <div>
            <div style={v4.mono}>What it reads as</div>
            <div style={{fontFamily:'Geist, sans-serif', fontSize: 13.5, lineHeight: 1.65, marginTop: 6, color:'var(--k-on-dark-soft)'}}>
              An aperture · a lens · a watching eye · a portal · the open mouth of a story being told.
            </div>
          </div>
          <div>
            <div style={v4.mono}>Typeable</div>
            <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 28, marginTop: 4, color:'var(--k-on-dark)'}}>(o)</div>
          </div>
          <div>
            <div style={v4.mono}>Color</div>
            <div style={{fontFamily:'Geist, sans-serif', fontSize: 13.5, lineHeight: 1.65, marginTop: 6, color:'var(--k-on-dark-soft)'}}>
              Lakers Purple is the primary fill. Mono white or charcoal for fallback.
            </div>
          </div>
        </div>
      </div>
      <div style={{display:'flex', justifyContent:'center', gap: 36, alignItems:'flex-end', marginBottom: 14}}>
        {[56, 36, 24, 16].map((s) => (
          <div key={s} style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 8}}>
            {s >= 24 ? <Mark size={s} color={PURPLE}/> : (
              <span style={{fontFamily:'Gimbal Extended, sans-serif', fontSize: s, color: PURPLE, lineHeight: 1}}>o</span>
            )}
            <span style={v4.mono}>{s}px</span>
          </div>
        ))}
      </div>
    </Chrome>
  );
}

/* ─── 05 · LOCKUPS ──────────────────────────────────────────────────── */
function BBLockups() {
  const Cell = ({ children, label, bg = 'var(--k-charcoal-2)', dim }) => (
    <div style={{
      border: dim ? '1px solid var(--k-line-light)' : '1px solid var(--k-line-dark)',
      borderRadius: 6, padding: '32px 28px',
      display:'flex', flexDirection:'column', justifyContent:'space-between',
      minHeight: 200,
      background: bg,
    }}>
      <div style={{flex: 1, display:'flex', alignItems:'center', justifyContent:'flex-start'}}>{children}</div>
      <div style={{...v4.mono, marginTop: 16, color: dim ? 'rgba(15,15,17,0.45)' : 'var(--k-on-dark-dim)'}}>{label}</div>
    </div>
  );
  return (
    <Chrome num={5} title="Lockups">
      <div style={v4.h2}>Four lockups. One system.</div>
      <div style={v4.lede}>Horizontal is the default. Stacked for square crops. Mark-only for favicons and avatars. The mono variants ship for surfaces where a single ink is required.</div>
      <div style={{flex: 1, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20, marginTop: 24}}>
        <Cell label="A · Horizontal · purple (o) · default"><Logo size={64} mark={PURPLE} word={WHITE}/></Cell>
        <Cell label="B · Stacked · purple (o)"><LogoStacked size={52} mark={PURPLE} word={WHITE}/></Cell>
        <Cell label="C · Mark only · favicons, app icons"><Mark size={100} color={PURPLE}/></Cell>
        <Cell bg={WHITE} dim label="D · Mono on white · single-ink fallback"><Logo size={56} mark={CHARCOAL} word={CHARCOAL}/></Cell>
      </div>
    </Chrome>
  );
}

/* ─── 06 · COLOR ────────────────────────────────────────────────────── */
function BBColor() {
  const Sw = ({ name, hex, note, fg = WHITE }) => (
    <div style={{background: hex, color: fg, padding:'22px 20px', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight: 180, border: hex === '#ffffff' ? '1px solid var(--k-line-light)' : 'none'}}>
      <div>
        <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 10, letterSpacing:'0.16em', opacity: 0.7, textTransform:'uppercase'}}>{note}</div>
        <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 20, letterSpacing: LS_K, marginTop: 4, textTransform:'uppercase'}}>{name}</div>
      </div>
      <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 11, opacity: 0.85}}>{hex}</div>
    </div>
  );
  return (
    <Chrome num={6} title="Color">
      <div style={v4.h2}>Purple primary. Charcoal anchors.</div>
      <div style={v4.lede}>Lakers Purple #552583 (PMS 526 C) is the primary brand color. Charcoal and white are the surface anchors. Lavender, sky and pink are alternate accents for decorative use only — never the default lockup.</div>
      <div style={{flex: 1, display:'flex', flexDirection:'column', gap: 14, marginTop: 22}}>
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap: 0}}>
          <Sw name="Lakers Purple" hex="#552583" note="01 · PRIMARY · PMS 526 C"/>
          <Sw name="Charcoal" hex="#0f0f11" note="02 · primary surface"/>
          <Sw name="White" hex="#ffffff" fg={CHARCOAL} note="03 · light surface"/>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1.2fr', gap: 0}}>
          <Sw name="Lavender" hex="#c7b8ff" fg={CHARCOAL} note="alt · 04"/>
          <Sw name="Sky" hex="#7edbff" fg={CHARCOAL} note="alt · 05"/>
          <Sw name="Pink" hex="#ffb6e8" fg={CHARCOAL} note="alt · 06"/>
          <div style={{padding:'22px 24px', background:'var(--k-charcoal-2)', border: '1px solid var(--k-line-dark)'}}>
            <div style={v4.mono}>Rules</div>
            <ul style={{margin:'10px 0 0', padding: 0, listStyle:'none', fontFamily:'Geist, sans-serif', fontSize: 12.5, lineHeight: 1.7, color:'var(--k-on-dark-soft)'}}>
              <li>· Purple is the default (o) color.</li>
              <li>· KIEIO is always white-on-dark or charcoal-on-light.</li>
              <li>· Pastels are decorative only — never primary lockup.</li>
              <li>· No gradients in production UI.</li>
            </ul>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 07 · TYPOGRAPHY ───────────────────────────────────────────────── */
function BBType() {
  return (
    <Chrome num={7} title="Typography">
      <div style={v4.h2}>Four families. Two scripts. One voice.</div>
      <div style={v4.lede}>Termina Bold sets KIEIO and headlines. Gimbal Extended Regular sets the (o) mark and supporting display moments. Geist handles body. JetBrains Mono carries technical information. 繁中 pairs Noto Sans TC.</div>
      <div style={{flex: 1, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 28, marginTop: 22}}>
        <div style={{display:'flex', flexDirection:'column', gap: 22}}>
          <div>
            <div style={v4.mono}>Display 1 · Termina Bold</div>
            <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 48, letterSpacing: LS_K, lineHeight: 1, marginTop: 6, textTransform:'uppercase'}}>KIEIO · STORY · TURN</div>
          </div>
          <div>
            <div style={v4.mono}>Display 2 · Gimbal Extended</div>
            <div style={{fontFamily:'Gimbal Extended, sans-serif', fontWeight: 400, fontSize: 48, letterSpacing: LS_O, lineHeight: 1, marginTop: 6}}>(o) (e) (i) (k)</div>
          </div>
          <div>
            <div style={v4.mono}>Display CJK · Noto Sans TC Black</div>
            <div style={{fontFamily:'Noto Sans TC, sans-serif', fontWeight: 900, fontSize: 36, lineHeight: 1.15, marginTop: 6}}>走入故事 · 做主角</div>
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap: 22}}>
          <div>
            <div style={v4.mono}>Body · Geist Sans</div>
            <div style={{fontFamily:'Geist, sans-serif', fontSize: 15, lineHeight: 1.6, marginTop: 6, color:'var(--k-on-dark-soft)'}}>The narrator listens before they speak. Every action is weighed. Every consequence is remembered.</div>
          </div>
          <div>
            <div style={v4.mono}>Body CJK · Noto Sans TC</div>
            <div style={{fontFamily:'Noto Sans TC, sans-serif', fontSize: 15, lineHeight: 1.75, marginTop: 6, color:'var(--k-on-dark-soft)'}}>每個人都可以走入自己嘅故事，做主角。NPC 會記得你做過嘅嘢。</div>
          </div>
          <div>
            <div style={v4.mono}>Technical · JetBrains Mono</div>
            <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 14, lineHeight: 1.6, marginTop: 6, color:'var(--k-on-dark-soft)'}}>/ˈkiː.oʊ/ · turn 247 · roll 14 + 3<br/>memory.layer = "semantic"</div>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 08 · VOICE & TONE ─────────────────────────────────────────────── */
function BBVoice() {
  const Row = ({ what, on, off, onZh }) => (
    <div style={{display:'grid', gridTemplateColumns:'120px 1fr 1fr', gap: 18, padding:'14px 0', borderBottom:'1px solid var(--k-line-dark)'}}>
      <div style={{...v4.mono, paddingTop: 2}}>{what}</div>
      <div>
        <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 9, color: PURPLE, letterSpacing:'0.16em', marginBottom: 4, fontWeight: 600}}>ON BRAND</div>
        <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.4, color:'var(--k-on-dark)', letterSpacing: LS_K, textTransform:'uppercase'}}>{on}</div>
        {onZh && <div style={{fontFamily:'Noto Sans TC, sans-serif', fontSize: 14, lineHeight: 1.6, color:'var(--k-on-dark-soft)', marginTop: 6, fontWeight: 500}}>{onZh}</div>}
      </div>
      <div>
        <div style={{fontFamily:'JetBrains Mono, monospace', fontSize: 9, color:'var(--k-on-dark-dim)', letterSpacing:'0.16em', marginBottom: 4}}>OFF BRAND</div>
        <div style={{fontFamily:'Geist, sans-serif', fontSize: 14, lineHeight: 1.5, color:'var(--k-on-dark-dim)', textDecoration:'line-through'}}>{off}</div>
      </div>
    </div>
  );
  return (
    <Chrome num={8} title="Voice & tone">
      <div style={v4.h2}>Direct. Intelligent. A peer.</div>
      <div style={v4.lede}>Kieio writes the way its NPCs talk: doesn't flatter, doesn't sing, doesn't apologize. Warm where warmth is earned, technical where technicality is useful. Never cute.</div>
      <div style={{flex: 1, marginTop: 16, overflow:'hidden'}}>
        <Row what="Welcome" on="A place to live another life." onZh="走入自己嘅故事，做主角。" off="Welcome traveller! ✨ Ready to start your magical journey?"/>
        <Row what="Error" on="That move would break the world's rules." onZh="呢一步會違反世界規則。" off="Oops! Something went wrong 🙈 Please try again."/>
        <Row what="Feature" on="NPCs remember what you said two hundred turns ago." onZh="NPC 會記得你二百個回合之前講過嘅嘢。" off="Powered by 4-layer hybrid memory architecture™️"/>
        <Row what="NSFW gate" on="This content is age-restricted. Verify once to unlock." onZh="此內容受年齡限制。一次驗證，永久解鎖。" off="🔞 Spicy content alert! Are you 18+? 😉"/>
      </div>
    </Chrome>
  );
}

/* ─── 09 · ICONOGRAPHY ──────────────────────────────────────────────── */
function BBIcons() {
  const I = ({ d }) => (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--k-on-dark)" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter">{d}</svg>
  );
  const items = [
    {name:'aperture', d:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="var(--k-on-dark)"/></>},
    {name:'library', d:<><line x1="4" y1="4" x2="4" y2="20"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="20" y1="6" x2="20" y2="20"/></>},
    {name:'memory', d:<><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="9" y1="4" x2="9" y2="20"/></>},
    {name:'dice', d:<><rect x="4" y="4" width="16" height="16"/><circle cx="9" cy="9" r="1" fill="var(--k-on-dark)"/><circle cx="15" cy="15" r="1" fill="var(--k-on-dark)"/><circle cx="12" cy="12" r="1" fill="var(--k-on-dark)"/></>},
    {name:'character', d:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></>},
    {name:'fork', d:<><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8c0 4 6 4 6 8"/><path d="M18 8c0 4-6 4-6 8"/></>},
    {name:'narrator', d:<><path d="M4 10v4l5 3V7z" fill="var(--k-on-dark)"/><path d="M13 8c2 0 3 2 3 4s-1 4-3 4"/><path d="M17 6c3 0 4 3 4 6s-1 6-4 6"/></>},
    {name:'adult', d:<><circle cx="12" cy="12" r="8"/><line x1="8" y1="8" x2="16" y2="16"/></>},
  ];
  return (
    <Chrome num={9} title="Iconography">
      <div style={v4.h2}>A custom set, sharing the mark's geometry.</div>
      <div style={v4.lede}>Icons sit on a 24-unit grid, 1.7px strokes, square caps, mitered corners. They share Termina's rectilinear posture — never rounded "friendly". The aperture icon echoes the (o) mark.</div>
      <div style={{flex: 1, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 22, marginTop: 28, alignContent:'flex-start'}}>
        {items.map((it) => (
          <div key={it.name} style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 10, padding:'20px 14px', background:'var(--k-charcoal-2)', borderRadius: 6, border: '1px solid var(--k-line-dark)'}}>
            <I d={it.d}/>
            <span style={{...v4.mono, fontSize: 10}}>{it.name}</span>
          </div>
        ))}
      </div>
    </Chrome>
  );
}

/* ─── 10 · APP ICON · FAVICON ───────────────────────────────────────── */
function AppIcon({ size, bg, fill, radius }) {
  const r = radius ?? size * 0.22;
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: bg,
      display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow: bg === CHARCOAL || bg === PURPLE ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
      border: bg === WHITE ? '1px solid rgba(0,0,0,0.06)' : 'none',
      overflow: 'hidden',
    }}>
      <Mark size={size * 0.36} color={fill}/>
    </div>
  );
}

function BBAppIcon() {
  return (
    <Chrome num={10} title="App icon · favicon · social">
      <div style={v4.h2}>(o) survives the squeeze.</div>
      <div style={v4.lede}>At 16px the parens drop and the o survives alone. The mark was designed for this. Purple is the default surface; charcoal and white for fallback.</div>
      <div style={{flex: 1, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 18, marginTop: 28, alignItems:'start'}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 12}}>
          <AppIcon size={150} radius={34} bg={PURPLE} fill={WHITE}/>
          <div style={v4.mono}>Purple · default</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 12}}>
          <AppIcon size={150} radius={34} bg={CHARCOAL} fill={PURPLE}/>
          <div style={v4.mono}>Charcoal + purple</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 12}}>
          <AppIcon size={150} bg={PURPLE} fill={WHITE} radius={75}/>
          <div style={v4.mono}>Social · circle</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start', gap: 14, padding:'18px 20px', background:'var(--k-charcoal-2)', border:'1px solid var(--k-line-dark)', borderRadius: 6}}>
          <div style={v4.mono}>Favicon ladder</div>
          {[[40,'40 · dock'],[24,'24 · tab @2x'],[16,'16 · ★ floor — o only']].map(([sz, label]) => (
            <div key={sz} style={{display:'flex', alignItems:'center', gap: 14}}>
              {sz >= 24 ? <Mark size={sz} color={PURPLE}/> : (
                <span style={{fontFamily:'Gimbal Extended, sans-serif', fontSize: sz, color: PURPLE, lineHeight: 1}}>o</span>
              )}
              <span style={{fontFamily:'JetBrains Mono, monospace', fontSize: 11, color:'var(--k-on-dark-soft)'}}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 11 · SOCIAL CARD ──────────────────────────────────────────────── */
function BBSocial() {
  return (
    <Chrome num={11} title="Social card · OG image">
      <div style={v4.h2}>One card. Two messages.</div>
      <div style={v4.lede}>Default OG image set in the brandbook itself. Story-specific cards take the same template and swap the line.</div>
      <div style={{flex: 1, display:'flex', flexDirection:'column', justifyContent:'center', marginTop: 22}}>
        <div style={{
          width:'100%', aspectRatio:'1200 / 630',
          background: CHARCOAL,
          color: WHITE, padding:'46px 56px',
          display:'flex', flexDirection:'column', justifyContent:'space-between',
          borderRadius: 8, boxShadow:'0 12px 40px rgba(0,0,0,0.3)',
          position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute', inset: 0,
            background: `radial-gradient(60% 50% at 18% 30%, rgba(85,37,131,0.25), transparent 70%)`,
            pointerEvents:'none'}}/>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative'}}>
            <Logo size={32} mark={PURPLE} word={WHITE}/>
            <span style={{...v4.mono, fontSize: 11}}>KIEIO.COM · AI TEXT RPG</span>
          </div>
          <div style={{position:'relative', zIndex: 1}}>
            <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 64, letterSpacing: LS_K, lineHeight: 1.05, color: WHITE, textTransform:'uppercase'}}>
              You imagine.<br/>
              <span style={{color: '#a78ad1'}}>KIEIO</span> narrates.<br/>
              You become.
            </div>
            <div style={{marginTop: 18, fontFamily:'Noto Sans TC, sans-serif', fontSize: 19, color: 'rgba(255,255,255,0.55)', letterSpacing:'0.04em'}}>
              中文圈嘅互動式故事 RPG · 走入故事，做主角
            </div>
          </div>
          <div style={{position:'absolute', right: -60, bottom: -100, opacity: 0.12, pointerEvents:'none', fontFamily:'Gimbal Extended, sans-serif', fontSize: 480, color: PURPLE, lineHeight: 0.8, letterSpacing: LS_O}}>
            (o)
          </div>
        </div>
      </div>
    </Chrome>
  );
}

/* ─── 12 · LANDING HERO ─────────────────────────────────────────────── */
function BBHero() {
  return (
    <Chrome num={12} title="Landing hero">
      <div style={v4.h2}>The first surface a stranger meets.</div>
      <div style={v4.lede}>Cinematic. The logo, phonetic helper, one line, one CTA. The page earns the rest by establishing voice first.</div>
      <div style={{flex: 1, marginTop: 22, border:'1px solid var(--k-line-dark)', borderRadius: 8, overflow:'hidden', position:'relative', background: CHARCOAL}}>
        <div style={{position:'absolute', inset: 0, background:`radial-gradient(60% 50% at 30% 40%, rgba(85,37,131,0.30), transparent 70%), radial-gradient(50% 40% at 78% 80%, rgba(85,37,131,0.18), transparent 70%)`, pointerEvents:'none'}}/>
        <div style={{position:'relative', zIndex: 1}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 28px', borderBottom:'1px solid var(--k-line-dark)'}}>
            <Logo size={22} mark={PURPLE} word={WHITE}/>
            <div style={{display:'flex', alignItems:'center', gap: 22, fontFamily:'Geist, sans-serif', fontSize: 13, color:'var(--k-on-dark-soft)'}}>
              <span>Library</span><span>Community</span><span>Pricing</span>
              <span style={{fontFamily:'Noto Sans TC, sans-serif'}}>繁中</span>
              <span style={{padding:'7px 14px', background: PURPLE, color: WHITE, borderRadius: 4, fontSize: 12, letterSpacing:'0.04em', fontWeight: 600}}>Sign in</span>
            </div>
          </div>
          <div style={{padding:'48px 28px 36px', display:'flex', flexDirection:'column', gap: 18, position:'relative'}}>
            <span style={{...v4.mono, fontSize: 11}}>
              <span style={{display:'inline-block', width:5, height:5, borderRadius:'50%', background: PURPLE, marginRight: 10, verticalAlign:'middle'}}/>
              /KEE-yo/ · 讀 KEE-yo
            </span>
            <div style={{fontFamily:'Termina, sans-serif', fontWeight: 700, fontSize: 60, letterSpacing: LS_K, lineHeight: 1.05, color: WHITE, maxWidth: 760, textTransform:'uppercase'}}>
              You imagine.<br/>
              <span style={{color: '#a78ad1'}}>KIEIO</span> narrates.<br/>
              You become.
            </div>
            <div style={{fontFamily:'Noto Sans TC, sans-serif', fontSize: 16, color:'var(--k-on-dark-soft)', maxWidth: 560, lineHeight: 1.75}}>
              中文圈嘅互動式故事 RPG。你寫一句種子，AI 為你生成一個世界、一班角色、一場故事。
            </div>
            <div style={{display:'flex', gap: 12, marginTop: 14}}>
              <button style={{background: PURPLE, color: WHITE, border:'none', padding:'12px 22px', fontFamily:'Geist, sans-serif', fontSize: 13, letterSpacing:'0.04em', cursor:'pointer', borderRadius: 4, fontWeight: 600}}>Begin your adventure →</button>
              <button style={{background:'transparent', color: WHITE, border:'1px solid var(--k-on-dark-faint)', padding:'12px 22px', fontFamily:'Geist, sans-serif', fontSize: 13, letterSpacing:'0.04em', cursor:'pointer', borderRadius: 4}}>Browse the library</button>
            </div>
          </div>
        </div>
      </div>
    </Chrome>
  );
}

window.BBCover = BBCover;
window.BBName = BBName;
window.BBWordmark = BBWordmark;
window.BBMark = BBMark;
window.BBLockups = BBLockups;
window.BBColor = BBColor;
window.BBType = BBType;
window.BBVoice = BBVoice;
window.BBIcons = BBIcons;
window.BBAppIcon = BBAppIcon;
window.BBSocial = BBSocial;
window.BBHero = BBHero;
