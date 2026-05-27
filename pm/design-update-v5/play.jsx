// Story Engine — Phase B v2 · Play screen (Grok dashboard mode)
// Light theme · book-typography narrative · stat-forward right rail · LLM chat input feel

// ─────────────────────────────────────────────────────────────
//  Sample playthrough — 銅鑼灣偵探事務所 · turn 14
// ─────────────────────────────────────────────────────────────
const PT = {
  storyId: 'cwb',
  storyTitle: '銅鑼灣偵探事務所',
  storyHue: 220,
  storyGenre: 'mystery',
  protagonist: '陳 Sir',
  turn: 14,
  model: 'sonnet-4.6',
  balance: 182,
  startedAt: '3 日前',
};

const NPCS = [
  { name: '阿薇', role: '失蹤者嘅妹妹', hue: 340,
    axes: { trust: 5, romance: 0, respect: 12, fear: 0 },
    lastDelta: { axis: 'trust', val: +15 },
    note: '剛剛肯講出「關生」嘅名',
    present: true },
  { name: '老鬼', role: '墳場睇更', hue: 140,
    axes: { trust: 35, romance: 0, respect: 28, fear: 0 },
    lastDelta: null,
    note: '已建立信任 · 願意幫手查',
    present: false },
];

const NARRATIVE = [
  { kind:'ai', turn:11, text:'「呢條街..」老鬼諗咗一陣，眼神望出窗外。「噚日凌晨有個著黑色風褸嘅男人企咗喺巷口好耐..大概兩點幾左右。佢冇行動冇講嘢，不過嗰個位嘅煙頭多咗五六支..你估啦。」', delta:null },
  { kind:'you', turn:12, text:'我去現場睇下。' },
  { kind:'ai', turn:12, text:'凌晨一點，巷口冷風吹過。路燈下，你蹲低身，發現水渠邊有支冇飲完嘅啤酒玻璃瓶 —— 唔係本地常見牌子。仲有一張揉到實一團嘅黃色五蚊紙幣，掉喺旁邊。', delta:{ kind:'clue', label:'外國啤酒瓶 + 五蚊紙幣' } },
  { kind:'you', turn:13, text:'我去搵阿薇，俾佢睇呢張紙幣。' },
  { kind:'ai', turn:13, text:'阿薇望住張紙幣，神情突然好複雜。「呢張...係我姐姐...嗰晚帶住嘅。」佢聲音細細，手指扭住衫尾。\n你發覺佢講「關生」呢個名嗰陣，眼角抽搐咗一下。', delta:{ kind:'axis', npc:'阿薇', axis:'trust', val:+15, note:'佢開始當你係可以信嘅人' } },
];

const AXIS_LABEL_PLAY = { trust:'信任', romance:'戀慕', respect:'敬重', fear:'懼怕' };
const AXIS_VAR_PLAY   = { trust:'--axis-trust', romance:'--axis-romance', respect:'--axis-respect', fear:'--axis-fear' };

// ─────────────────────────────────────────────────────────────
//  Play header — Grok dashboard chrome
// ─────────────────────────────────────────────────────────────
const PlayHeader = ({ onMemoryClick }) => (
  <header style={{
    height: 56, padding: '0 24px',
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--bg-elev)',
    borderBottom: '1px solid var(--border)',
  }}>
    <button style={{
      height: 30, padding: '0 10px', borderRadius: 6,
      color: 'var(--fg-muted)', fontSize: 12.5,
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      <Icon name="arrow_l" size={11} /> 故事庫
    </button>
    <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ width: 28, height: 36, flex: 'none' }}>
        <Cover story={{ title: PT.storyTitle, genre: PT.storyGenre, hue: PT.storyHue }} size="xs" showLabel={false} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--fg)',
          fontFamily: 'var(--font-cjk)', letterSpacing: '-0.005em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{PT.storyTitle}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.06em' }}>
          扮演 {PT.protagonist} · TURN {String(PT.turn).padStart(2,'0')} · {PT.model.toUpperCase()}
        </div>
      </div>
    </div>
    <div style={{ flex: 1 }} />
    <button onClick={onMemoryClick} style={{
      height: 32, padding: '0 14px', borderRadius: 7,
      background: 'var(--surface)', border: '1px solid var(--border)',
      fontSize: 12.5, color: 'var(--fg-2)',
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      <Icon name="journal" size={13} stroke="var(--accent)" />
      <span style={{ fontFamily: 'var(--font-cjk)' }}>回憶錄</span>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.06em' }}>
        12 LB · 1 CH
      </span>
    </button>
    <button style={{
      width: 32, height: 32, borderRadius: 6, color: 'var(--fg-muted)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}><Icon name="settings" size={15} /></button>
  </header>
);

// ─────────────────────────────────────────────────────────────
//  4-axis disposition bar — Grok readout style
// ─────────────────────────────────────────────────────────────
const DispositionAxis = ({ axis, val, lastDelta }) => {
  const sign = val > 0 ? '+' : '';
  const pct = (val + 100) / 2;
  const showDelta = lastDelta && lastDelta.axis === axis;
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
      <span className="mono" style={{ width: 40, fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.06em' }}>
        {AXIS_LABEL_PLAY[axis]}
      </span>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: 'var(--surface-2)',
        position: 'relative',
      }}>
        <div style={{
          position:'absolute', left:'50%', top: -3, bottom: -3, width: 1,
          background: 'var(--border-strong)',
        }} />
        <div style={{
          position:'absolute', top: 0, bottom: 0,
          left: val < 0 ? `${pct}%` : '50%',
          width: `${Math.abs(val) / 2}%`,
          background: `var(${AXIS_VAR_PLAY[axis]})`,
          borderRadius: 2,
        }} />
        <div style={{
          position:'absolute', top: -3, bottom: -3, width: 2,
          left: `calc(${pct}% - 1px)`,
          background: `var(${AXIS_VAR_PLAY[axis]})`,
        }} />
      </div>
      <span className="mono" style={{
        width: 38, textAlign: 'right', fontSize: 12,
        color: `var(${AXIS_VAR_PLAY[axis]})`, fontWeight: 600,
      }}>{sign}{val}</span>
      {showDelta && (
        <span className="mono" style={{
          fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
          background: `var(${AXIS_VAR_PLAY[axis]})`, color: '#fff',
          letterSpacing: '0.04em', minWidth: 28, textAlign: 'center',
        }}>{lastDelta.val > 0 ? '+' : ''}{lastDelta.val}</span>
      )}
    </div>
  );
};

const NPCCard = ({ npc }) => (
  <div style={{
    padding: 14, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
    opacity: npc.present ? 1 : 0.78,
    boxShadow: 'var(--shadow-card)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <Avatar name={npc.name} size={34} hue={npc.hue} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>{npc.name}</span>
          {npc.present && (
            <span title="在場" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--ok)',
              boxShadow: '0 0 0 3px var(--ok-bg)',
            }} />
          )}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
            {npc.present ? '在場' : '離場'}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1, fontFamily: 'var(--font-cjk)' }}>
          {npc.role}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {['trust','romance','respect','fear'].map(a => (
        <DispositionAxis key={a} axis={a} val={npc.axes[a]} lastDelta={npc.lastDelta} />
      ))}
    </div>
    {npc.note && (
      <div style={{
        marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)',
        fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.55,
        fontFamily: 'var(--font-cjk)',
        display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <span style={{ color: 'var(--accent)' }}>↳</span>
        {npc.note}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Dynamic State Panel (5 of 9 renderers shown)
// ─────────────────────────────────────────────────────────────
const SBar = ({ label, val, max, accent = 'var(--ok)' }) => (
  <div>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 11.5, color:'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 11, color:'var(--fg)' }}>{val}/{max}</span>
    </div>
    <div style={{ height: 5, background:'var(--surface-2)', borderRadius: 3, overflow:'hidden' }}>
      <div style={{ width: `${(val/max)*100}%`, height:'100%', background: accent, borderRadius: 3 }} />
    </div>
  </div>
);

const SCounter = ({ label, val, delta }) => (
  <div>
    <div style={{ fontSize: 11.5, color:'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
      <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>{val}</span>
      {delta && (
        <span className="mono" style={{
          fontSize: 10, color: delta > 0 ? 'var(--ok)' : 'var(--danger)',
        }}>{delta > 0 ? '+' : ''}{delta}</span>
      )}
    </div>
  </div>
);

const SEnum = ({ label, options, current }) => (
  <div>
    <div style={{ fontSize: 11.5, color:'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-cjk)' }}>{label}</div>
    <div style={{ display:'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 6, padding: 2 }}>
      {options.map(o => (
        <div key={o} style={{
          flex: 1, textAlign:'center', padding: '5px 4px',
          fontSize: 11, borderRadius: 4,
          background: o === current ? 'var(--surface)' : 'transparent',
          boxShadow: o === current ? 'var(--shadow-card)' : 'none',
          color: o === current ? 'var(--fg)' : 'var(--fg-dim)',
          fontWeight: o === current ? 500 : 400,
          fontFamily: 'var(--font-cjk)',
        }}>{o}</div>
      ))}
    </div>
  </div>
);

const SInventory = ({ items }) => (
  <div>
    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11.5, color:'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>攜帶物品</span>
      <span className="mono" style={{ fontSize: 10, color:'var(--fg-dim)', letterSpacing: '0.06em' }}>{items.length} ITEMS</span>
    </div>
    <div style={{ display:'flex', flexWrap:'wrap', gap: 5 }}>
      {items.map(i => (
        <span key={i} style={{
          fontSize: 11, padding: '4px 9px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 5, color:'var(--fg-2)', fontFamily: 'var(--font-cjk)',
        }}>{i}</span>
      ))}
    </div>
  </div>
);

const SList = ({ label, items }) => (
  <div>
    <div style={{ fontSize: 11.5, color:'var(--fg-muted)', marginBottom: 6, fontFamily: 'var(--font-cjk)' }}>{label}</div>
    <ul style={{ margin: 0, paddingLeft: 14, fontSize: 12.5, color:'var(--fg-2)', lineHeight: 1.75, fontFamily: 'var(--font-cjk)' }}>
      {items.map(i => <li key={i}>{i}</li>)}
    </ul>
  </div>
);

const StatePanel = () => (
  <div style={{
    padding: 16, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
    display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: 'var(--shadow-card)',
  }}>
    <div className="mono" style={{
      fontSize: 10, letterSpacing: '0.14em', color: 'var(--accent)',
      textTransform: 'uppercase',
    }}>STATE · AUTO-SCHEMA · 9 RENDERERS</div>
    <SBar label="體力" val={6} max={10} accent="var(--ok)" />
    <SBar label="HP" val={80} max={100} accent="var(--danger)" />
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14 }}>
      <SCounter label="現金" val="$342" delta={-58} />
      <SCounter label="線索" val={5} delta={+1} />
    </div>
    <SEnum label="偵查風格" options={['謹慎','aggressive','reckless']} current="謹慎" />
    <SInventory items={['鎖匙','筆記本','舊照片','五蚊','啤酒瓶碎片']} />
    <SList label="已知地點" items={['西營盤舊公寓','北角墳場','軒尼詩道後巷']} />
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Narrative turn — book typography
// ─────────────────────────────────────────────────────────────
const TurnAI = ({ t, soft = false }) => (
  <div data-turn={t.turn}
    title={soft ? 'NPC 反應與你預期不同' : undefined}
    style={{
      position: 'relative',
      padding: '4px 0 4px',
      borderLeft: soft ? '2px solid var(--warn)' : 'none',
      paddingLeft: soft ? 16 : 0,
    }}>
    <div className="mono" style={{
      fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-dim)',
      marginBottom: 10, textTransform: 'uppercase',
    }}>
      TURN {String(t.turn).padStart(2,'0')} · 敘事
    </div>
    <p style={{
      margin: 0,
      fontFamily: 'var(--font-cjk)',
      fontSize: 17, lineHeight: 1.95,
      letterSpacing: '0.005em',
      color: 'var(--fg)',
      whiteSpace: 'pre-wrap',
      textWrap: 'pretty',
    }}>{t.text}</p>
    {t.delta && t.delta.kind === 'axis' && (
      <div style={{
        marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 7,
        background: 'var(--surface)', border: '1px solid var(--border)',
        fontSize: 12, fontFamily: 'var(--font-cjk)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: `var(--axis-${t.delta.axis})`,
        }} />
        <span style={{ color: 'var(--fg-2)' }}>{t.delta.npc}</span>
        <span className="mono" style={{ color: `var(--axis-${t.delta.axis})`, fontWeight: 600 }}>
          {AXIS_LABEL_PLAY[t.delta.axis]} {t.delta.val > 0 ? '+' : ''}{t.delta.val}
        </span>
        {t.delta.note && (
          <span style={{ color: 'var(--fg-muted)', marginLeft: 4 }}>· {t.delta.note}</span>
        )}
      </div>
    )}
    {t.delta && t.delta.kind === 'clue' && (
      <div style={{
        marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 7,
        background: 'var(--accent-bg)', border: '1px solid var(--accent-line)',
        fontSize: 12, fontFamily: 'var(--font-cjk)',
      }}>
        <span className="mono" style={{ color: 'var(--accent)', letterSpacing: '0.08em', fontSize: 10 }}>
          NEW CLUE
        </span>
        <span style={{ color: 'var(--fg-2)' }}>{t.delta.label}</span>
      </div>
    )}
  </div>
);

const TurnYou = ({ t }) => (
  <div style={{
    margin: '32px 0',
    paddingLeft: 18,
    borderLeft: '2px solid var(--border-strong)',
  }}>
    <div className="mono" style={{
      fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-dim)',
      marginBottom: 6, textTransform: 'uppercase',
    }}>
      TURN {String(t.turn).padStart(2,'0')} · 你
    </div>
    <p style={{
      margin: 0,
      fontFamily: 'var(--font-cjk)',
      fontSize: 15, lineHeight: 1.75,
      color: 'var(--fg-muted)',
      fontStyle: 'italic',
    }}>{t.text}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Action input — LLM chat input feel
// ─────────────────────────────────────────────────────────────
const ActionInput = ({ value = '我用力拍打枱面，問佢：「我去搵關生，仲有冇其他人？」', cost = 2 }) => (
  <div style={{
    background: 'var(--bg-elev)',
    borderTop: '1px solid var(--border)',
    padding: '16px 24px 22px',
    position: 'sticky', bottom: 0,
  }}>
    <div style={{
      maxWidth: 760, margin: '0 auto',
      background: 'var(--surface)',
      border: '1px solid var(--border-strong)',
      borderRadius: 12,
      padding: '14px 16px',
      boxShadow: 'var(--shadow-pop)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: 5,
          background: 'var(--accent)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkle" size={10} stroke="#fff" strokeWidth={2} />
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em' }}>
          TURN {PT.turn} · 你嘅 ACTION
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-cjk)' }}>
          描述你嘅動作、對話、或者內心諗法
        </span>
      </div>
      <div style={{
        fontSize: 16, fontFamily: 'var(--font-cjk)', lineHeight: 1.75,
        color: 'var(--fg)', minHeight: 52,
      }}>{value}</div>
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.04em' }}>
          {value.length} / 500
        </span>
        <span style={{ color: 'var(--fg-faint)' }}>·</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          <span style={{ color: 'var(--fg-2)', fontWeight: 600 }}>~{cost} CR</span>
          <span style={{ margin: '0 4px' }}>·</span>
          <span style={{ color: 'var(--ok)' }}>餘 {PT.balance}</span>
        </span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{
          fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.06em',
          padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)',
        }}>⌘↵ 送出</span>
        <Btn variant="primary" size="md" iconRight="send">送出</Btn>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Play screen · desktop
// ─────────────────────────────────────────────────────────────
const PlayDesktop = ({ withSoftDirector = false }) => (
  <ScreenFrame style={{ display: 'flex', flexDirection: 'column' }}>
    <PlayHeader />
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 0 }}>
      {/* Narrative column */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '40px 32px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Scrolled-past chip */}
            <div style={{
              padding: '8px 16px', borderRadius: 999,
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--fg-muted)',
              display: 'inline-flex', alignItems: 'center', gap: 10, alignSelf: 'center',
              fontFamily: 'var(--font-cjk)',
            }}>
              <Icon name="chevron_u" size={11} stroke="var(--fg-muted)" />
              <span>已玩 13 turn · 由 turn 1 開始</span>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <button style={{ color: 'var(--accent)' }}>回到開頭</button>
            </div>

            {NARRATIVE.map((t, i) => t.kind === 'ai'
              ? <TurnAI key={i} t={t} soft={withSoftDirector && i === NARRATIVE.length - 1} />
              : <TurnYou key={i} t={t} />)}
          </div>
        </div>
        <ActionInput />
      </div>

      {/* Right rail */}
      <aside style={{
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg)',
        overflowY: 'auto',
        padding: 18,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: '0.14em', color: 'var(--accent)',
            marginBottom: 12, textTransform: 'uppercase',
          }}>
            角色 · CAST · {NPCS.filter(n => n.present).length} 在場
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {NPCS.map(n => <NPCCard key={n.name} npc={n} />)}
          </div>
        </div>
        <StatePanel />
      </aside>
    </div>
  </ScreenFrame>
);

const PlayDesktopBackdrop = () => (
  <div style={{
    filter: 'blur(3px) saturate(0.7)', pointerEvents: 'none',
    width: '100%', height: '100%',
  }}>
    <PlayDesktop />
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Skill check — result modal (parameterized for 4 outcomes)
// ─────────────────────────────────────────────────────────────
const OUTCOMES = {
  critical_success: { label:'CRITICAL SUCCESS', accent:'var(--accent)', accentBg:'var(--accent-bg)', accentLine:'var(--accent-line)', sparkle:true },
  success:          { label:'SUCCESS',          accent:'var(--ok)',     accentBg:'var(--ok-bg)',     accentLine:'oklch(0.55 0.13 160 / 0.4)' },
  failure:          { label:'FAILURE',          accent:'var(--danger)', accentBg:'var(--danger-bg)', accentLine:'var(--danger)' },
  critical_failure: { label:'CRITICAL FAILURE', accent:'var(--danger)', accentBg:'var(--danger-bg)', accentLine:'var(--danger)', dramatic:true },
};

const SkillCheckResult = ({ outcome, dice, skill, dc, title, body, aftermath, signature }) => {
  const o = OUTCOMES[outcome];
  return (
    <ScreenFrame style={{ position:'relative' }}>
      <PlayDesktopBackdrop />
      <div style={{
        position:'absolute', inset: 0, background:'var(--overlay)', backdropFilter:'blur(8px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding: 40,
      }}>
        <div style={{
          width: 600, padding: 32,
          background: 'var(--surface)', borderRadius: 16,
          border: `1px solid ${o.accentLine}`,
          boxShadow: o.dramatic
            ? '0 0 0 4px var(--danger-bg), var(--shadow-modal)'
            : 'var(--shadow-modal)',
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 22 }}>
            <span className="mono" style={{
              fontSize: 11, letterSpacing: '0.16em', color: o.accent,
              display:'inline-flex', alignItems:'center', gap: 6,
            }}>
              {o.sparkle && '✦'} SKILL CHECK · {o.label}
            </span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
              PERMANENT · 不可重試
            </span>
          </div>

          {/* Dice display */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 26 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 12,
              background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <span className="mono" style={{ fontSize: 32, color: 'var(--fg-2)', lineHeight: 1, fontWeight: 600 }}>{dice}</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 2, letterSpacing: '0.1em' }}>d20</span>
              {dice === 20 && (
                <span className="mono" style={{
                  position: 'absolute', top: -8, right: -10,
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.06em',
                  background: 'var(--accent)', color: '#fff',
                }}>NAT 20</span>
              )}
              {dice === 1 && (
                <span className="mono" style={{
                  position: 'absolute', top: -8, right: -10,
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.06em',
                  background: 'var(--danger)', color: '#fff',
                }}>NAT 1</span>
              )}
            </div>
            <span className="mono" style={{ fontSize: 18, color: 'var(--fg-dim)' }}>+ {skill}</span>
            <span className="mono" style={{ fontSize: 18, color: 'var(--fg-dim)' }}>=</span>
            <div style={{
              width: 72, height: 72, borderRadius: 12,
              background: o.accentBg, border: `1px solid ${o.accent}`,
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="mono" style={{ fontSize: 28, color: o.accent, lineHeight: 1, fontWeight: 600 }}>{dice + skill}</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 2, letterSpacing: '0.08em' }}>VS {dc}</span>
            </div>
          </div>

          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, fontFamily: 'var(--font-cjk)', letterSpacing: '-0.01em' }}>
            {title}
          </h3>
          <p style={{
            margin: '12px 0 0', fontFamily: 'var(--font-cjk)',
            fontSize: 15, lineHeight: 1.85, color: 'var(--fg-2)',
            whiteSpace: 'pre-wrap',
          }}>{body}</p>

          <div style={{
            marginTop: 22, padding: 14,
            background: 'var(--surface-2)', borderRadius: 9,
            display: 'flex', flexDirection: 'column', gap: 8,
            fontSize: 12.5,
          }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: '0.12em', color: 'var(--fg-dim)',
              textTransform: 'uppercase',
            }}>後果 · 永久記入記憶</div>
            {aftermath.map((d, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap: 10, fontFamily: 'var(--font-cjk)' }}>
                <span style={{ color: 'var(--fg-2)', width: 56, fontWeight: 500 }}>{d.target}</span>
                <span className="mono" style={{
                  color: d.axis ? `var(--axis-${d.axis})` : 'var(--fg)', fontWeight: 600,
                }}>{d.label}</span>
              </div>
            ))}
            {signature && (
              <div style={{
                marginTop: 4, paddingTop: 8,
                borderTop: '1px dashed var(--border)',
                color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)', lineHeight: 1.5,
              }}>{signature}</div>
            )}
          </div>

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', flex: 1, fontFamily: 'var(--font-cjk)' }}>
              已記入故事 · 寫下一個 action 繼續推進
            </span>
            <Btn variant="primary" size="md">繼續</Btn>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
};

const SkillCheckRolling = () => (
  <ScreenFrame style={{ position:'relative' }}>
    <PlayDesktopBackdrop />
    <div style={{
      position:'absolute', inset: 0, background:'var(--overlay)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding: 40,
    }}>
      <div style={{
        width: 560, padding: 36,
        background: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-modal)',
        textAlign: 'center',
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.16em' }}>
          SKILL CHECK · 擲骰中
        </span>
        <h2 style={{ margin: '14px 0 6px', fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-cjk)', letterSpacing: '-0.015em' }}>
          威逼 阿薇
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>
          你想用拍枱施壓 · 阿薇 信任 +5 · 你嘅 Intimidate 6
        </p>

        <div style={{ margin: '32px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div style={{
            width: 84, height: 84, borderRadius: 14,
            background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            animation: 'die-shake 0.18s steps(2, end) infinite',
          }}>
            <span className="mono" style={{ fontSize: 32, color: 'var(--fg-dim)', lineHeight: 1, fontWeight: 600 }}>?</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 4, letterSpacing: '0.1em' }}>d20</span>
          </div>
          <span className="mono" style={{ fontSize: 22, color: 'var(--fg-dim)' }}>+</span>
          <div style={{
            width: 84, height: 84, borderRadius: 14,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="mono" style={{ fontSize: 32, color: 'var(--fg)', lineHeight: 1, fontWeight: 600 }}>6</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 4, letterSpacing: '0.08em' }}>威逼</span>
          </div>
          <span className="mono" style={{ fontSize: 22, color: 'var(--fg-dim)' }}>vs</span>
          <div style={{
            width: 84, height: 84, borderRadius: 14,
            background: 'var(--warn-bg)', border: '1px solid var(--warn)',
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="mono" style={{ fontSize: 32, color: 'var(--warn)', lineHeight: 1, fontWeight: 600 }}>14</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 4, letterSpacing: '0.08em' }}>DC</span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>
          阿薇<span style={{ color: 'var(--fg)' }}>會唔會</span>退讓？
        </p>
        <style>{`@keyframes die-shake { 0%{transform:rotate(-3deg)} 100%{transform:rotate(3deg)} }`}</style>
      </div>
    </div>
  </ScreenFrame>
);

const SkillCheckFailure = () => (
  <SkillCheckResult outcome="failure" dice={4} skill={6} dc={14}
    title="阿薇縮埋身，瞪住你"
    body={'「你...你嚇到我喇。」佢嘅聲變得好硬。「我冇嘢同你講。你走啦。」\n佢企起身，行入廚房，砰一聲關埋門。'}
    aftermath={[
      { target:'阿薇', axis:'trust', label:'信任 -20' },
      { target:'阿薇', axis:'fear',  label:'懼怕 +15' },
    ]}
    signature="阿薇唔會再喺今日同你講「關生」嘅事 · 你要喺其他地方搵線索。"
  />
);

const SkillCheckSuccess = () => (
  <SkillCheckResult outcome="success" dice={12} skill={6} dc={14}
    title="阿薇 sigh 一下，緩緩開口"
    body={'「...好啦。」佢避開你嘅眼神。「佢上次去過西營盤舊公寓嗰邊。我亦係知到呢度。」\n佢講完之後立即低頭，似乎好驚關生會知道佢講咗。'}
    aftermath={[
      { target:'阿薇', axis:'trust', label:'信任 +5' },
      { target:'你',   label:'新地點 · 西營盤舊公寓' },
    ]}
    signature="佢願意提供關鍵線索 · 但仍有隱瞞。"
  />
);

const SkillCheckCritSuccess = () => (
  <SkillCheckResult outcome="critical_success" dice={20} skill={6} dc={14}
    title="阿薇喺你面前崩潰，邊喊邊講"
    body={'「我...我細路時見過...關生佢...佢唔係好人...我姊姊見佢之前，我已經叫佢唔好...」\n佢跪低，雙手掩面。某個心防睇睇間崩咗下嚟。'}
    aftermath={[
      { target:'阿薇', axis:'trust',   label:'信任 +15' },
      { target:'阿薇', axis:'romance', label:'戀慕 +8' },
      { target:'你',   label:'解鎖 · 「童年回憶」章節' },
    ]}
    signature="NAT 20 · 你觸動咗阿薇最深嘅一層。這段關係不可逆轉。"
  />
);

const SkillCheckCritFailure = () => (
  <SkillCheckResult outcome="critical_failure" dice={1} skill={6} dc={14}
    title="阿薇企起身，揈低鎖匙喺你枱面"
    body={'「你以為你係 detective？你淨係一條敗類。」佢聲音冷到結冰。\n「我唔會再同你講半句嘢。永遠。」\n砰一聲，門關埋。你聽到關鑰匙嘅聲音。'}
    aftermath={[
      { target:'阿薇', axis:'trust', label:'信任 -50' },
      { target:'阿薇', axis:'fear',  label:'懼怕 +25' },
      { target:'你',   label:'主線斷裂 · 「阿薇路線」永久關閉' },
    ]}
    signature="NAT 1 · 你今次扮演嘅關係永不復返。Story arc 會繼續 — 但唔同你。"
  />
);

const DirectorPushback = () => <PlayDesktop withSoftDirector />;

// ─────────────────────────────────────────────────────────────
//  Loading states
// ─────────────────────────────────────────────────────────────
const LoadingModeration = () => (
  <ScreenFrame style={{ position:'relative' }}>
    <PlayDesktopBackdrop />
    <div style={{
      position:'absolute', left: '50%', bottom: 140, transform: 'translateX(-50%)',
      padding: '14px 20px',
      background: 'var(--surface)', border: '1px solid var(--border-strong)',
      borderRadius: 999, boxShadow: 'var(--shadow-pop)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 11,
        background: 'var(--ok-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name="check" size={12} stroke="var(--ok)" /></span>
      <span style={{ fontSize: 13, color: 'var(--fg-2)', fontFamily: 'var(--font-cjk)' }}>
        <span className="mono" style={{ color: 'var(--fg-dim)', marginRight: 8, letterSpacing: '0.08em' }}>1/2</span>
        安全檢查通過
      </span>
      <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
      <span style={{ fontSize: 13, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-cjk)' }}>
        <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>2/2</span>
        <SpinDot size={10} /> AI 寫緊敘事...
      </span>
    </div>
  </ScreenFrame>
);

const LoadingStreaming = () => (
  <ScreenFrame style={{ display:'flex', flexDirection:'column' }}>
    <PlayHeader />
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '40px 32px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: 760 }}>
            <TurnYou t={{ turn: 14, text:'我用力拍打枱面，問佢：「我去搵關生，仲有冇其他人？」' }} />
            <div>
              <div className="mono" style={{
                fontSize: 10, letterSpacing: '0.14em', color: 'var(--accent)',
                marginBottom: 10, textTransform: 'uppercase',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <SpinDot size={9} /> TURN 14 · 敘事 · STREAMING
              </div>
              <p style={{
                margin: 0, fontFamily: 'var(--font-cjk)',
                fontSize: 17, lineHeight: 1.95, color: 'var(--fg)',
              }}>
                阿薇望住你，臉色變白。佢嘅手指收緊，緊到指節都白晒。
                「你...你想做咩？」<span style={{
                  display: 'inline-block', width: 8, height: 20, marginLeft: 3,
                  background: 'var(--accent)', verticalAlign: 'middle',
                  animation: 'cursor-blink 0.8s steps(2) infinite',
                }} />
              </p>
            </div>
            <style>{`@keyframes cursor-blink { 50% { opacity: 0 } }`}</style>
          </div>
        </div>
        <div style={{
          background: 'var(--bg-elev)', borderTop: '1px solid var(--border)',
          padding: '14px 24px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)',
        }}>
          <SpinDot size={10} /> 寫緊敘事…
          <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>~6s</span>
        </div>
      </div>
      <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg)', padding: 18 }}>
        <div className="mono" style={{
          fontSize: 10, letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: 12,
        }}>角色 · 1 在場</div>
        <NPCCard npc={NPCS[0]} />
      </aside>
    </div>
  </ScreenFrame>
);

// ─────────────────────────────────────────────────────────────
//  Error cards
// ─────────────────────────────────────────────────────────────
const ErrorCard = ({ code, label, title, body, primary, secondary }) => (
  <div style={{
    width: '100%', maxWidth: 500,
    padding: 26, background: 'var(--surface)',
    border: '1px solid var(--border-strong)', borderRadius: 14,
    boxShadow: 'var(--shadow-modal)',
  }}>
    <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 16 }}>
      <span className="mono" style={{
        fontSize: 10, letterSpacing: '0.14em', color: 'var(--warn)',
      }}>{label}</span>
      <div style={{ flex: 1 }} />
      <span className="mono" style={{
        fontSize: 10, padding: '2px 7px', borderRadius: 3,
        background: 'var(--surface-2)', color: 'var(--fg-dim)',
        letterSpacing: '0.06em',
      }}>{code}</span>
    </div>
    <h3 style={{
      margin: 0, fontSize: 19, fontWeight: 600,
      fontFamily: 'var(--font-cjk)', letterSpacing: '-0.015em',
    }}>{title}</h3>
    <p style={{
      margin: '12px 0 0', fontSize: 14, color: 'var(--fg-muted)',
      lineHeight: 1.7, fontFamily: 'var(--font-cjk)',
    }}>{body}</p>
    <div style={{ display:'flex', gap: 10, marginTop: 22 }}>
      <Btn variant="primary" size="md">{primary}</Btn>
      {secondary && <Btn variant="ghost" size="md">{secondary}</Btn>}
    </div>
  </div>
);

const ErrorOverlay = ({ children }) => (
  <ScreenFrame style={{ position:'relative' }}>
    <PlayDesktopBackdrop />
    <div style={{
      position:'absolute', inset: 0, background:'var(--overlay)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding: 40,
    }}>{children}</div>
  </ScreenFrame>
);

const ErrorActionBlocked = () => (
  <ErrorOverlay>
    <ErrorCard
      code="400 · ACTION_BLOCKED"
      label="安全規則"
      title="呢個 action 觸發咗安全規則"
      body="平台嚴禁涉及未成年人、極端暴力、自殘、或仇恨內容嘅創作。你嘅 action 並未送俾 AI。試下用其他講法 · 或者描述你想達到嘅效果，俾敘事者代你 frame。"
      primary="改寫 action"
      secondary="查看安全守則"
    />
  </ErrorOverlay>
);

const ErrorInsufficient = () => (
  <ErrorOverlay>
    <ErrorCard
      code="402 · INSUFFICIENT_CREDITS"
      label="餘額不足"
      title="你餘額剩低 0 credits"
      body="呢個 turn 需要 2 credits · 你而家剩 0。買 credits 後可即時繼續，今個 action 唔會 lost · 我哋已經幫你 draft 起。"
      primary="加 credits"
      secondary="先儲低 draft"
    />
  </ErrorOverlay>
);

const Error503 = () => (
  <ErrorOverlay>
    <ErrorCard
      code="503 · MODERATION_MISCONFIGURED"
      label="服務暫時不可用"
      title="安全檢查服務出咗少少問題"
      body="呢個唔係你嘅 action 嘅問題 · 係我哋後台暫時連唔到 moderation provider。已經收到通知，請過幾分鐘再試。你嘅 draft 已自動儲低。"
      primary="重試"
      secondary="返故事庫"
    />
  </ErrorOverlay>
);

// ─────────────────────────────────────────────────────────────
//  Mobile
// ─────────────────────────────────────────────────────────────
const PlayMobile = () => {
  const [tab, setTab] = React.useState('narrative');
  return (
    <ScreenFrame style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      }}>
        <button style={{ width: 32, height: 32, color: 'var(--fg-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="arrow_l" size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-cjk)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{PT.storyTitle}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.06em' }}>
            TURN {PT.turn} · 餘 {PT.balance} CR
          </div>
        </div>
        <button style={{ width: 32, height: 32, color: 'var(--fg-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="journal" size={16} />
        </button>
        <button style={{ width: 32, height: 32, color: 'var(--fg-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="settings" size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        {[
          { id: 'narrative', label: '敘事' },
          { id: 'npc',       label: '角色 · 1' },
          { id: 'state',     label: '狀態' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '12px 8px', fontSize: 12.5,
            color: tab === t.id ? 'var(--fg)' : 'var(--fg-muted)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            fontFamily: 'var(--font-cjk)',
            fontWeight: tab === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tab === 'narrative' && (
          <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {NARRATIVE.slice(-4).map((t, i) => t.kind === 'ai'
              ? <TurnAI key={i} t={t} />
              : <TurnYou key={i} t={t} />)}
          </div>
        )}
        {tab === 'npc' && (
          <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {NPCS.map(n => <NPCCard key={n.name} npc={n} />)}
          </div>
        )}
        {tab === 'state' && (
          <div style={{ padding: '16px 14px' }}>
            <StatePanel />
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-elev)', borderTop: '1px solid var(--border)',
        padding: '12px 14px',
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderRadius: 11, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 14, fontFamily: 'var(--font-cjk)', color: 'var(--fg-dim)' }}>
            描述你嘅 action...
          </div>
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>0 / 500</span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-2)', fontWeight: 600 }}>~2 CR</span>
            <Btn variant="primary" size="sm" icon="send">送出</Btn>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
};

Object.assign(window, {
  PT, NPCS, NARRATIVE, AXIS_LABEL_PLAY, AXIS_VAR_PLAY,
  DispositionAxis, NPCCard, StatePanel, TurnAI, TurnYou, ActionInput,
  PlayHeader, PlayDesktop, PlayDesktopBackdrop, PlayMobile,
  SkillCheckRolling, SkillCheckFailure, SkillCheckSuccess, SkillCheckCritSuccess, SkillCheckCritFailure,
  DirectorPushback,
  LoadingModeration, LoadingStreaming,
  ErrorActionBlocked, ErrorInsufficient, Error503,
});
