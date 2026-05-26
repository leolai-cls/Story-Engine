// Story Engine — shared atoms used across all phases
// Color/spacing tokens live in tokens.css. These are pure presentational
// components — no state, no fetching. Engineer ports each to shadcn/Radix.

// ─────────────────────────────────────────────────────────────
//  Iconography — single-line stroke icons, no fill, 16px default
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 16, stroke = 'currentColor', strokeWidth = 1.5 }) => {
  const paths = {
    search:    <><circle cx="7" cy="7" r="5"/><path d="M11 11l4 4"/></>,
    star:      <path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.4 4.1 13.5l.9-4.4-3.3-3 4.4-.5z"/>,
    'star-fill': <path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.4 4.1 13.5l.9-4.4-3.3-3 4.4-.5z" fill="currentColor"/>,
    play:      <path d="M4 2.5v11l9-5.5z"/>,
    arrow:     <path d="M3 8h10M9 4l4 4-4 4"/>,
    arrow_l:   <path d="M13 8H3M7 4l-4 4 4 4"/>,
    plus:      <path d="M8 3v10M3 8h10"/>,
    close:     <path d="M3 3l10 10M13 3L3 13"/>,
    chevron:   <path d="M5 3l5 5-5 5"/>,
    chevron_d: <path d="M3 5l5 5 5-5"/>,
    chevron_u: <path d="M3 11l5-5 5 5"/>,
    eye:       <><path d="M1.5 8C3 4.5 5.5 3 8 3s5 1.5 6.5 5c-1.5 3.5-4 5-6.5 5s-5-1.5-6.5-5z"/><circle cx="8" cy="8" r="2"/></>,
    lock:      <><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 016 0v2"/></>,
    book:      <><path d="M3 2.5h7a2 2 0 012 2v9H5a2 2 0 01-2-2z"/><path d="M3 11.5h9"/></>,
    bookmark:  <path d="M4 2.5h8v11l-4-2.5L4 13.5z"/>,
    dice:      <><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="5.5" r="0.8" fill="currentColor"/><circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/><circle cx="10.5" cy="5.5" r="0.8" fill="currentColor"/><circle cx="5.5" cy="10.5" r="0.8" fill="currentColor"/></>,
    send:      <path d="M2 8l12-5-3 12-3-5z"/>,
    heart:     <path d="M8 13.5S2.5 10 2.5 6a3 3 0 015.5-1.6A3 3 0 0113.5 6c0 4-5.5 7.5-5.5 7.5z"/>,
    fork:      <><circle cx="4" cy="3" r="1.5"/><circle cx="12" cy="3" r="1.5"/><circle cx="8" cy="13" r="1.5"/><path d="M4 4.5v3a2 2 0 002 2h4a2 2 0 002-2v-3M8 9.5v2"/></>,
    sparkle:   <path d="M8 1l1.3 4.7L14 7l-4.7 1.3L8 13l-1.3-4.7L2 7l4.7-1.3z"/>,
    grid:      <><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></>,
    list:      <path d="M2 4h12M2 8h12M2 12h12"/>,
    filter:    <path d="M2 3h12l-4.5 6v4l-3 1.5v-5.5z"/>,
    user:      <><circle cx="8" cy="6" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/></>,
    globe:     <><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></>,
    settings:  <><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M3 8H1M15 8h-2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/></>,
    journal:   <><path d="M3 2.5h9v11H3z"/><path d="M3 5.5h9M6 2.5v11"/></>,
    npc:       <><circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/><circle cx="12" cy="3.5" r="1" fill="currentColor"/></>,
    info:      <><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.5v0.1"/></>,
    warn:      <><path d="M8 1.5L15 13.5H1z"/><path d="M8 6v4M8 11.5v0.1"/></>,
    check:     <path d="M3 8l3.5 3.5L13 5"/>,
    clock:     <><circle cx="8" cy="8" r="6"/><path d="M8 4.5v3.5l2.5 1.5"/></>,
    flame:     <path d="M8 1.5C9.5 4 11 5 11 8a3 3 0 11-6 0c0-1 .5-2 1.5-2.5C6 7 7 8 8 1.5z"/>,
    sword:     <path d="M13 3v3L6.5 12.5l-2-2L11 4l2-1zM4 11l1 1M2.5 13.5l2 2"/>,
    grad:      <path d="M1 6l7-3 7 3-7 3-7-3zM4 7.5v3c0 1.5 2 2.5 4 2.5s4-1 4-2.5v-3"/>,
    crystal:   <path d="M8 1.5l5 4.5-5 8.5-5-8.5z M3 6h10 M8 1.5v13"/>,
    basket:    <path d="M2 5h12l-1.5 8.5h-9zM5 5l1-3h4l1 3"/>,
    detective: <><circle cx="5" cy="9" r="2.5"/><circle cx="11" cy="9" r="2.5"/><path d="M2.5 9c0-2 2-5 5.5-5s5.5 3 5.5 5M7.5 9h1"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'inline-block', verticalAlign: '-2px' }}>
      {paths[name]}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
//  Genre + rating chip
// ─────────────────────────────────────────────────────────────
const GENRE = {
  romance:   { label: '戀愛',   icon: 'heart',     hue: 0   },
  adventure: { label: '冒險',   icon: 'sword',     hue: 30  },
  campus:    { label: '校園',   icon: 'grad',      hue: 80  },
  fantasy:   { label: '奇幻',   icon: 'crystal',   hue: 290 },
  sports:    { label: '運動',   icon: 'basket',    hue: 160 },
  mystery:   { label: '懸疑',   icon: 'detective', hue: 240 },
  slice:     { label: '日常',   icon: 'book',      hue: 200 },
  horror:    { label: '恐怖',   icon: 'flame',     hue: 350 },
};

const GenreChip = ({ genre, size = 'sm' }) => {
  const g = GENRE[genre] || { label: genre, icon: 'book', hue: 240 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-cjk)',
      fontSize: size === 'sm' ? 11 : 12,
      padding: size === 'sm' ? '3px 9px' : '4px 11px',
      borderRadius: 999,
      background: `oklch(var(--chip-bg-l) var(--chip-bg-c) ${g.hue})`,
      color: `oklch(var(--chip-fg-l) var(--chip-fg-c) ${g.hue})`,
      border: `1px solid oklch(var(--chip-border-l) var(--chip-border-c) ${g.hue} / 0.6)`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: `oklch(var(--chip-fg-l) var(--chip-fg-c) ${g.hue})`,
        flex: 'none',
      }} />
      {g.label}
    </span>
  );
};

const RatingBadge = ({ rating, size = 'sm' }) => {
  const cfg = {
    general: { label: '一般',    fg: 'var(--fg-muted)',  bg: 'var(--surface-2)' },
    pg13:    { label: 'PG-13',  fg: 'var(--fg-muted)',  bg: 'var(--surface-2)' },
    mature:  { label: '成熟',    fg: 'var(--warn)',      bg: 'var(--warn-bg)' },
    adult:   { label: '18+',    fg: 'var(--danger)',    bg: 'var(--danger-bg)' },
  }[rating] || { label: rating, fg: 'var(--fg-muted)', bg: 'var(--surface-2)' };
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, letterSpacing: '0.05em',
      padding: '2px 6px', borderRadius: 4,
      background: cfg.bg, color: cfg.fg,
    }}>{cfg.label}</span>
  );
};

// ─────────────────────────────────────────────────────────────
//  Star rating display (read-only)
// ─────────────────────────────────────────────────────────────
const Stars = ({ value, count, size = 11 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-muted)' }}>
    <span style={{ color: 'oklch(0.82 0.13 80)', display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon key={i} name={i <= Math.round(value) ? 'star-fill' : 'star'} size={size} strokeWidth={1.5} />
      ))}
    </span>
    <span className="mono" style={{ fontSize: 11 }}>{value.toFixed(1)}</span>
    {count !== undefined && (
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>· {count.toLocaleString()}</span>
    )}
  </span>
);

// ─────────────────────────────────────────────────────────────
//  Cover — cinematic gradient placeholder with composed type.
//  Each cover IS the visual asset (title baked in, A24 poster vibe).
//  NOT a generic stripe placeholder.
// ─────────────────────────────────────────────────────────────
const COVER_PALETTE = {
  mystery:   { l1:0.22, c1:0.11, h1:230, l2:0.68, c2:0.10, h2:200, accent:'#f4d77a' },
  romance:   { l1:0.32, c1:0.16, h1:8,   l2:0.82, c2:0.10, h2:30,  accent:'#fff2e0' },
  fantasy:   { l1:0.26, c1:0.14, h1:285, l2:0.72, c2:0.12, h2:315, accent:'#d8c5ff' },
  adventure: { l1:0.28, c1:0.13, h1:28,  l2:0.74, c2:0.10, h2:55,  accent:'#ffd9a8' },
  campus:    { l1:0.38, c1:0.13, h1:95,  l2:0.84, c2:0.08, h2:70,  accent:'#fff9c4' },
  sports:    { l1:0.36, c1:0.14, h1:165, l2:0.80, c2:0.10, h2:185, accent:'#c0f0d2' },
  horror:    { l1:0.16, c1:0.08, h1:355, l2:0.52, c2:0.10, h2:15,  accent:'#ffb0b0' },
  slice:     { l1:0.42, c1:0.10, h1:200, l2:0.86, c2:0.06, h2:215, accent:'#cfeaff' },
};

const Cover = ({ story, tag, hue = 270, ratio = '3 / 4', size = 'md', titleOverride, style, showLabel = true }) => {
  // Accept either a story object or loose props (tag/hue) for legacy callers
  const title = titleOverride || story?.title;
  const genre = story?.genre || 'mystery';
  const handle = story?.handle;
  const author = story?.author;
  const h = story?.hue ?? hue;
  const p = COVER_PALETTE[genre] || COVER_PALETTE.mystery;

  const radius = size === 'sm' ? 6 : size === 'lg' ? 14 : 10;
  const titleSize = size === 'xs' ? 13 : size === 'sm' ? 17 : size === 'lg' ? 38 : 22;
  const padding = size === 'xs' ? '8px 10px' : size === 'sm' ? '12px 14px' : size === 'lg' ? '28px 28px' : '16px 18px';
  const showMicro = size !== 'xs' && showLabel;

  return (
    <div style={{
      aspectRatio: ratio,
      borderRadius: radius,
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      // Layered gradient: warm light wash top, deep mood color bottom
      background: `
        radial-gradient(120% 90% at 110% 0%, oklch(${p.l2} ${p.c2 - 0.02} ${p.h2}) 0%, transparent 55%),
        radial-gradient(140% 100% at -10% 110%, oklch(${p.l1 + 0.08} ${p.c1} ${p.h1}) 0%, transparent 60%),
        linear-gradient(160deg, oklch(${p.l2 + 0.05} ${p.c2} ${p.h2 + (h - p.h1) * 0.2}) 0%, oklch(${p.l1} ${p.c1 + 0.02} ${p.h1}) 60%, oklch(${Math.max(0.10, p.l1 - 0.10)} ${p.c1 + 0.02} ${p.h1 - 15}) 100%)`,
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-card)',
      ...style,
    }}>
      {/* Subtle grain via SVG noise */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>")`,
        mixBlendMode: 'overlay', opacity: 0.55,
      }} />
      {/* Edge vignette */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.28) 100%)',
        pointerEvents: 'none',
      }} />
      {/* Genre kicker — top-left */}
      {showMicro && (
        <div className="mono" style={{
          position: 'absolute', top: size === 'lg' ? 22 : 12, left: size === 'lg' ? 26 : 14,
          fontSize: size === 'lg' ? 10.5 : 9.5,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.78)',
        }}>
          <span style={{ color: p.accent }}>● </span>
          {(GENRE[genre] || {}).label || genre}
        </div>
      )}
      {/* Title overlay — bottom-left baseline */}
      {title && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding,
          color: '#fff',
          textShadow: '0 1px 6px rgba(0,0,0,0.45)',
        }}>
          <h3 style={{
            margin: 0,
            fontFamily: 'var(--font-cjk)',
            fontSize: titleSize,
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: '#fff',
            textWrap: 'balance',
            display: '-webkit-box', WebkitLineClamp: size === 'lg' ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{title}</h3>
          {size === 'lg' && (author || handle) && (
            <div className="mono" style={{
              marginTop: 10, fontSize: 11, letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.7)',
            }}>{handle || `@${author}`}</div>
          )}
        </div>
      )}
      {/* Legacy tag (used in some Phase A artboards) */}
      {!title && tag && (
        <div className="mono" style={{
          position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
          fontSize: 9.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)',
        }}>{tag}</div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Avatar
// ─────────────────────────────────────────────────────────────
const Avatar = ({ name = '?', size = 20, hue = 200 }) => {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span style={{
      width: size, height: size, flex: 'none',
      borderRadius: '50%',
      background: `linear-gradient(135deg, oklch(var(--avatar-l-hi) var(--avatar-c) ${hue}), oklch(var(--avatar-l-lo) var(--avatar-c) ${hue + 30}))`,
      color: '#fff',
      fontSize: size * 0.45,
      fontFamily: 'var(--font-latin)',
      fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      letterSpacing: '-0.02em',
      border: '1px solid var(--border)',
    }}>{initial}</span>
  );
};

// ─────────────────────────────────────────────────────────────
//  Button — primary / ghost / outline / danger
// ─────────────────────────────────────────────────────────────
const Btn = ({ children, variant = 'ghost', size = 'md', icon, iconRight, disabled, style, ...rest }) => {
  const sizes = {
    sm: { h: 28, px: 10, fs: 12 },
    md: { h: 36, px: 14, fs: 13 },
    lg: { h: 44, px: 18, fs: 14 },
  }[size];
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: '#0a0a0b',
      border: '1px solid transparent',
      fontWeight: 600,
    },
    outline: {
      background: 'transparent',
      color: 'var(--fg)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--fg-2)',
      border: '1px solid transparent',
    },
    soft: {
      background: 'var(--surface-2)',
      color: 'var(--fg-2)',
      border: '1px solid var(--border)',
    },
    danger: {
      background: 'var(--danger-bg)',
      color: 'var(--danger)',
      border: '1px solid oklch(0.55 0.15 25 / 0.4)',
    },
  }[variant];
  return (
    <button
      disabled={disabled}
      style={{
        height: sizes.h,
        padding: `0 ${sizes.px}px`,
        fontSize: sizes.fs,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .12s var(--ease), opacity .12s',
        ...variants,
        ...style,
      }}
      {...rest}>
      {icon && <Icon name={icon} size={sizes.fs + 1} strokeWidth={1.6} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.fs + 1} strokeWidth={1.6} />}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
//  TopBar — used on Library + Story detail + Settings
// ─────────────────────────────────────────────────────────────
const TopBar = ({ active = 'library', user = { name: '阿俊', tier: 'Adventurer' }, search = false, mobile = false }) => {
  if (mobile) {
    return (
      <div style={{
        height: 52, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))',
          flex: 'none',
        }} />
        <div className="mono" style={{ fontSize: 13, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
          story.engine
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ width: 32, height: 32, borderRadius: 6, color: 'var(--fg-2)' }}>
          <Icon name="search" size={16} />
        </button>
        <Avatar name={user.name} size={28} hue={290} />
      </div>
    );
  }
  return (
    <div style={{
      height: 56, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 24,
      background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: 'linear-gradient(135deg, var(--accent), oklch(0.45 0.16 320))',
        }} />
        <div className="mono" style={{ fontSize: 14, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
          story.engine
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 4 }}>
          [v0.4 · beta]
        </span>
      </div>
      <nav style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
        {[
          { id: 'library', label: '故事' },
          { id: 'create',  label: '創作' },
          { id: 'play',    label: '進行中' },
        ].map(item => (
          <button key={item.id} style={{
            height: 30, padding: '0 12px', borderRadius: 6,
            fontSize: 13,
            color: active === item.id ? 'var(--fg)' : 'var(--fg-muted)',
            background: active === item.id ? 'var(--surface-2)' : 'transparent',
          }}>{item.label}</button>
        ))}
      </nav>
      {search && (
        <div style={{
          flex: 1, maxWidth: 460, marginLeft: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          height: 34, padding: '0 12px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 7,
        }}>
          <Icon name="search" size={14} stroke="var(--fg-dim)" />
          <span style={{ fontSize: 13, color: 'var(--fg-dim)', flex: 1 }}>
            搜尋故事、作者、tag…
          </span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--fg-dim)',
            padding: '2px 5px', borderRadius: 3,
            border: '1px solid var(--border)',
          }}>⌘K</span>
        </div>
      )}
      <div style={{ flex: search ? 'none' : 1 }} />
      <button style={{
        height: 30, padding: '0 10px', borderRadius: 6,
        color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
      }}>
        <Icon name="globe" size={14} /> 繁中
      </button>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px 4px 4px', borderRadius: 18,
        border: '1px solid var(--border)',
      }}>
        <Avatar name={user.name} size={24} hue={290} />
        <span style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{user.name}</span>
        <span className="mono" style={{
          fontSize: 9.5, padding: '2px 5px', borderRadius: 3,
          background: 'var(--accent-bg)', color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>{user.tier.toUpperCase()}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Frame wrapper for an artboard's "device" chrome inset
// ─────────────────────────────────────────────────────────────
const ScreenFrame = ({ children, scroll = true, style }) => (
  <div className="se" style={{
    width: '100%', height: '100%',
    background: 'var(--bg)',
    overflow: scroll ? 'hidden auto' : 'hidden',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--fg)',
    ...style,
  }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────
//  Spinner — generic atom used across phases (loading states)
// ─────────────────────────────────────────────────────────────
const SpinDot = ({ size = 10, color = 'var(--accent)' }) => (
  <span style={{
    width: size, height: size, borderRadius: size / 2,
    border: `1.5px solid ${color}`,
    borderTopColor: 'transparent',
    display: 'inline-block',
    animation: 'sd 0.8s linear infinite',
  }}>
    <style>{`@keyframes sd { to { transform: rotate(360deg) } }`}</style>
  </span>
);

// Expose to window for cross-script use
Object.assign(window, {
  Icon, GENRE, GenreChip, RatingBadge, Stars, Cover, Avatar, Btn, TopBar, ScreenFrame, SpinDot,
});
