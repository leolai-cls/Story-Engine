// Story Engine — Phase B v2 · Memory Journal (Grok technical readout)
// "Inspecting an LLM's working memory" not "reading a wiki"
// Per-playthrough · 100% read-only · 4-layer backend surfaced 1:1

const MEM_SUMMARIES = [
  { idx: 1, range: 'TURN 1–10', title: '夜半委託',
    body: '凌晨一點，西裝磨損嘅老者來搵你，揭出一張你五年前簽過嘅死亡證明 — 相中人係佢嘅女兒。你接咗單嘢。你聯絡咗北角墳場睇更老鬼，建立初步信任，並從佢度知道有個著黑色風褸嘅男人喺巷口出現過。',
    writtenAt: 'turn 10 · 1 日前', tokens: 142 },
];

const LOREBOOK = {
  character: [
    { name:'阿薇', always_on:true, desc:'失蹤者嘅妹妹，21 歲。神情常常焦慮，講「關生」時眼角會抽搐。穿衫尾扭實係佢嘅緊張習慣。',
      mentions: 4, firstSeen: 'TURN 3' },
    { name:'委託人 (老黃)', always_on:true, desc:'西裝裇衫袖口磨到起毛嘅老者，五十幾歲。失蹤者嘅父親。願意俾任何代價搵返女兒。',
      mentions: 2, firstSeen: 'TURN 1' },
    { name:'老鬼', always_on:false, desc:'北角墳場睇更，60 幾歲。話多但靠得住，識行內人。已建立信任。',
      mentions: 3, firstSeen: 'TURN 6' },
    { name:'關生', always_on:false, desc:'阿薇姐姐失蹤前最後見嘅人。身份未明。喺西營盤舊公寓附近巷口出現過。',
      mentions: 2, firstSeen: 'TURN 11' },
  ],
  place: [
    { name:'銅鑼灣偵探事務所', always_on:true, desc:'你嘅辦公室。舊式商廈七樓，招牌冇燈，個 lift 有股霉味。',
      mentions: 5, firstSeen: 'TURN 1' },
    { name:'西營盤舊公寓', always_on:false, desc:'失蹤者最後出現嘅地方。巷口曾出現可疑男人。',
      mentions: 2, firstSeen: 'TURN 8' },
    { name:'北角墳場', always_on:false, desc:'老鬼工作嘅地方。深夜可以入。',
      mentions: 2, firstSeen: 'TURN 6' },
  ],
  item: [
    { name:'失蹤者照片', always_on:true, desc:'老者帶嚟嘅相片。背面寫住「2021.07」。',
      mentions: 3, firstSeen: 'TURN 1' },
    { name:'外國啤酒玻璃瓶', always_on:false, desc:'西營盤巷口拾到。唔係本地常見牌子。',
      mentions: 1, firstSeen: 'TURN 12' },
    { name:'五蚊紙幣', always_on:false, desc:'巷口揉到實一團。阿薇認得 — 係佢姐姐嗰晚帶住嘅。',
      mentions: 2, firstSeen: 'TURN 12' },
  ],
  event: [
    { name:'死亡證明事件 · 五年前', always_on:true, desc:'你親手簽過失蹤者嘅死亡證明。意味住佢應該已經死咗，但相中人睇起嚟仲生存。',
      mentions: 2, firstSeen: 'TURN 1' },
  ],
  concept: [
    { name:'招魂奶茶', always_on:false, desc:'西營盤一間冰室嘅秘密 menu。背景人士間流傳。',
      mentions: 1, firstSeen: 'TURN 4' },
  ],
};

const ACTIVE_MEMORIES = [
  { turn: 13, similarity: 0.91, source: '過往 turn',
    snippet: '阿薇望住地下，手指扭住衫尾。「佢...嗰晚應該係見一個叫『關生』嘅人。我見過佢一次。係喺老公寓嗰邊。」',
    relevance: 'AI 因為呢段，記住阿薇有「扭衫尾」嘅緊張動作習慣 — 等下會放入佢嘅 reaction' },
  { turn: 12, similarity: 0.87, source: '相似片段',
    snippet: '凌晨一點，巷口冷風吹過。你蹲低，發現水渠邊有支冇飲完嘅啤酒玻璃瓶 — 唔係本地常見牌子。',
    relevance: 'AI 記住你係細心嘅 detective · 會搵物證做推論' },
  { turn: 1, similarity: 0.78, source: '滾動摘要',
    snippet: '老者坐喺對面，五十幾歲，西裝裇衫袖口磨到起毛。佢冇報名，淨係將一張相片擺低喺枱面。',
    relevance: '建立呢個 case 嘅最初動機 — 老者係你嘅老客' },
  { turn: 6, similarity: 0.72, source: 'Lorebook · 人物',
    snippet: '老鬼係北角墳場睇更 · 60 幾歲 · 話多但靠得住 · 識行內人。',
    relevance: 'Lorebook entry 包住「老鬼識行內人」— AI 現在考慮讓佢介紹另一個 NPC' },
];

const ENTITY_LABEL = { character:'人物', place:'地點', item:'物品', event:'事件', concept:'概念' };
const ENTITY_HUE   = { character:340, place:200, item:80, event:25, concept:280 };

// ─────────────────────────────────────────────────────────────
//  Lorebook entry — Grok dashboard card · read-only
// ─────────────────────────────────────────────────────────────
const LoreCard = ({ entry, type }) => (
  <div style={{
    padding: 16, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 11,
    display: 'flex', flexDirection: 'column', gap: 10,
    boxShadow: 'var(--shadow-card)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {entry.always_on && (
        <span title="ALWAYS_ON · AI 每 turn 都記得" style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 0 3px var(--accent-bg)',
          flex: 'none',
        }} />
      )}
      <h3 style={{
        margin: 0, fontSize: 15, fontWeight: 600,
        fontFamily: 'var(--font-cjk)', letterSpacing: '-0.005em',
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{entry.name}</h3>
      <span className="mono" style={{
        fontSize: 9.5, padding: '2px 7px', borderRadius: 3, letterSpacing: '0.08em',
        background: `oklch(var(--chip-bg-l) var(--chip-bg-c) ${ENTITY_HUE[type]})`,
        color:      `oklch(var(--chip-fg-l) var(--chip-fg-c) ${ENTITY_HUE[type]})`,
      }}>{ENTITY_LABEL[type].toUpperCase()}</span>
    </div>
    <p style={{
      margin: 0, fontSize: 13, lineHeight: 1.7,
      color: 'var(--fg-2)', fontFamily: 'var(--font-cjk)',
    }}>{entry.desc}</p>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginTop: 2,
      paddingTop: 10, borderTop: '1px dashed var(--border)',
      fontSize: 10.5, color: 'var(--fg-dim)',
    }}>
      <span className="mono" style={{ letterSpacing: '0.06em' }}>
        REF {entry.mentions}× · 首見 {entry.firstSeen}
      </span>
      <div style={{ flex: 1 }} />
      <span title="AI 自動記錄 · 不可編輯 · Migration 0018 server-only write" style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: 'var(--fg-dim)',
      }}>
        <Icon name="lock" size={10} stroke="var(--fg-dim)" />
        <span className="mono" style={{ letterSpacing: '0.08em' }}>READ-ONLY</span>
      </span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Tab: 當前活躍記憶 (RAG retrieved for current turn) — killer demo
// ─────────────────────────────────────────────────────────────
const TabActive = ({ empty = false }) => (
  <div style={{ padding: '32px 36px', maxWidth: 820, margin: '0 auto' }}>
    {/* Live banner */}
    <div style={{
      padding: 16, marginBottom: 24,
      background: 'var(--accent-bg)', border: '1px solid var(--accent-line)',
      borderRadius: 11,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8, flex: 'none',
        background: 'var(--accent)', color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <SpinDot size={9} color="#fff" />
      </span>
      <div style={{ flex: 1 }}>
        <div className="mono" style={{
          fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--accent)',
          marginBottom: 4, textTransform: 'uppercase',
        }}>
          LIVE · TURN {PT.turn} · AI 而家用緊呢{empty ? '0' : ' ' + ACTIVE_MEMORIES.length}段
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, fontFamily: 'var(--font-cjk)' }}>
          每 turn AI 都會從你嘅整段歷史搜出最相關嘅記憶，注入返敘事。下面係 AI 「腦海入面浮現緊」嘅段落。
        </p>
      </div>
    </div>

    {empty ? (
      <div style={{
        padding: '48px 32px', textAlign: 'center',
        background: 'var(--surface)', border: '1px dashed var(--border-strong)',
        borderRadius: 14,
      }}>
        <div className="mono" style={{
          fontSize: 36, fontWeight: 500, color: 'var(--fg-faint)',
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>∅</div>
        <h3 style={{
          margin: '18px 0 10px', fontSize: 17, fontWeight: 600,
          fontFamily: 'var(--font-cjk)',
        }}>呢個 turn AI 冇 retrieve 出特別相關嘅過往記憶</h3>
        <p style={{
          margin: '0 auto', maxWidth: 480,
          fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7,
          fontFamily: 'var(--font-cjk)',
        }}>
          AI 純粹用近 20 turn 嘅 context 同你嘅 Story Bible 寫敘事。<br/>
          <span style={{ color: 'var(--fg-dim)' }}>（我哋設咗相似度 floor — 寧願冇 match 都唔要 noisy match。）</span>
        </p>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ACTIVE_MEMORIES.map((m, i) => (
          <article key={i} style={{
            padding: '20px 22px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className="mono" style={{
                fontSize: 18, fontWeight: 600, color: 'var(--fg-dim)',
                width: 28, letterSpacing: '-0.02em',
              }}>{String(i + 1).padStart(2, '0')}</span>
              <span className="mono" style={{
                fontSize: 10.5, letterSpacing: '0.1em', color: 'var(--fg-muted)',
              }}>FROM TURN {m.turn}</span>
              <span className="mono" style={{
                fontSize: 9.5, padding: '2px 8px', borderRadius: 3, letterSpacing: '0.08em',
                background: 'var(--surface-2)', color: 'var(--fg-2)', fontWeight: 500,
              }}>{m.source.toUpperCase()}</span>
              <div style={{ flex: 1 }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
                  SIM
                </span>
                <div style={{ width: 64, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${m.similarity * 100}%`, height: '100%',
                    background: 'var(--accent)',
                  }} />
                </div>
                <span className="mono" style={{
                  fontSize: 12, color: 'var(--fg)', width: 36, textAlign: 'right', fontWeight: 600,
                }}>{m.similarity.toFixed(2)}</span>
              </div>
            </div>
            <blockquote style={{
              margin: 0, padding: '14px 18px',
              background: 'var(--surface-2)', borderRadius: 9,
              fontFamily: 'var(--font-cjk)', fontSize: 14.5, lineHeight: 1.8,
              color: 'var(--fg)', borderLeft: '2px solid var(--border-strong)',
              fontStyle: 'normal',
            }}>{m.snippet}</blockquote>
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
              fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6,
              fontFamily: 'var(--font-cjk)',
            }}>
              <span style={{ color: 'var(--accent)', flex: 'none', marginTop: 2, fontWeight: 600 }}>↳</span>
              {m.relevance}
            </div>
          </article>
        ))}
      </div>
    )}

    <div style={{
      marginTop: 26, padding: '12px 16px', borderRadius: 9,
      background: 'transparent', border: '1px dashed var(--border-strong)',
      fontSize: 12, color: 'var(--fg-muted)',
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-cjk)',
    }}>
      <Icon name="info" size={12} stroke="var(--fg-muted)" />
      <span>呢個 panel 喺 player 寫下個 action 之後會 refresh · 再次 retrieve 最相關嘅記憶</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Tab: 回憶錄 (rolling summaries)
// ─────────────────────────────────────────────────────────────
const TabSummaries = ({ turnCount = 14 }) => {
  if (MEM_SUMMARIES.length === 0) {
    const next = 10;
    return (
      <div style={{ padding: '60px 36px 0', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div className="mono" style={{
          fontSize: 36, fontWeight: 500, color: 'var(--fg-faint)',
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>0 / 1</div>
        <h2 style={{
          margin: '20px 0 10px', fontSize: 20, fontWeight: 600,
          fontFamily: 'var(--font-cjk)', letterSpacing: '-0.015em',
        }}>AI 仲未開始整理回憶</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.7, fontFamily: 'var(--font-cjk)' }}>
          玩到 turn 10 · AI 會自動寫第一章嘅摘要，記住你做過嘅關鍵決定。<br/>
          之後每 ~20 turn 會再 update。
        </p>
        <div style={{
          marginTop: 28, padding: 16, borderRadius: 11,
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>
              距離第一章摘要
            </span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>{turnCount} / {next}</span>
          </div>
          <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(turnCount / next) * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '32px 36px', maxWidth: 820, margin: '0 auto' }}>
      <p style={{
        margin: '0 0 28px', fontSize: 13.5, color: 'var(--fg-muted)',
        lineHeight: 1.7, fontFamily: 'var(--font-cjk)',
      }}>
        AI 每 ~20 turn 整理一次。摘要會持續影響 AI 嘅判斷 — 即使你玩到 turn 80，第一章嘅嘢佢仍然記得。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {MEM_SUMMARIES.map(s => (
          <article key={s.idx} style={{
            padding: '24px 26px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 13,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
              <span className="mono" style={{
                fontSize: 28, fontWeight: 600, color: 'var(--accent)',
                letterSpacing: '-0.02em', lineHeight: 1,
              }}>0{s.idx}</span>
              <div>
                <span className="mono" style={{
                  fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: '0.1em',
                }}>{s.range} · {s.writtenAt.toUpperCase()} · {s.tokens} TOKENS</span>
                <h3 style={{
                  margin: '4px 0 0', fontSize: 22, fontWeight: 600,
                  fontFamily: 'var(--font-cjk)', letterSpacing: '-0.015em',
                }}>{s.title}</h3>
              </div>
            </div>
            <p style={{
              margin: 0, fontSize: 15,
              fontFamily: 'var(--font-cjk)', lineHeight: 1.9,
              color: 'var(--fg-2)', textWrap: 'pretty',
            }}>{s.body}</p>
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: 'var(--fg-dim)',
            }}>
              <Icon name="lock" size={10} stroke="var(--fg-dim)" />
              <span className="mono" style={{ letterSpacing: '0.08em' }}>READ-ONLY · AI-WRITTEN</span>
            </div>
          </article>
        ))}
        <div style={{
          padding: '16px 20px', borderRadius: 11,
          background: 'transparent', border: '1px dashed var(--border-strong)',
          fontSize: 13, color: 'var(--fg-muted)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'var(--font-cjk)',
        }}>
          <Icon name="clock" size={13} stroke="var(--fg-muted)" />
          下一章預計喺 <span className="mono" style={{ color: 'var(--fg)' }}>turn 20</span> 寫
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>+6 TURN</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Tab: 角色記事 (lorebook)
// ─────────────────────────────────────────────────────────────
const TabLorebook = ({ empty = false }) => {
  if (empty) {
    return (
      <div style={{ padding: '60px 36px 0', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div className="mono" style={{
          fontSize: 36, fontWeight: 500, color: 'var(--fg-faint)',
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>0</div>
        <h2 style={{ margin: '20px 0 10px', fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>
          AI 仲未識到呢個世界嘅人物
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.7, fontFamily: 'var(--font-cjk)' }}>
          玩多啲 turn · AI 會自動將你遇到嘅人物、地點、物件、事件 extract 出嚟，
          整理成記事，等後尾遇到都唔會「失憶」。
        </p>
      </div>
    );
  }

  const types = ['character','place','item','event','concept'];
  const totalCount = types.reduce((n, t) => n + LOREBOOK[t].length, 0);
  const alwaysOnCount = types.reduce((n, t) => n + LOREBOOK[t].filter(e => e.always_on).length, 0);

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22,
        paddingBottom: 18, borderBottom: '1px solid var(--border)',
      }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', flex: 1, lineHeight: 1.65, fontFamily: 'var(--font-cjk)' }}>
          AI 自動 extract 嘅 entity · 影響每 turn 嘅敘事。
          <span className="mono" style={{ color: 'var(--accent)', marginLeft: 6 }}>●</span>
          <span style={{ marginLeft: 4 }}>= always_on · AI 永遠記得</span>
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <Icon name="search" size={12} stroke="var(--fg-dim)" />
          <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-cjk)' }}>搜尋 lorebook</span>
          <span className="mono" style={{
            fontSize: 9.5, color: 'var(--fg-dim)',
            padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3, marginLeft: 6,
          }}>/</span>
        </div>
        <div className="mono" style={{
          fontSize: 10.5, color: 'var(--fg-dim)', letterSpacing: '0.08em',
        }}>{totalCount} ENTRIES · {alwaysOnCount} ALWAYS_ON</div>
      </div>

      {types.map(t => (
        <section key={t} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h3 style={{
              margin: 0, fontSize: 14, fontWeight: 600,
              fontFamily: 'var(--font-cjk)',
            }}>{ENTITY_LABEL[t]}</h3>
            <span className="mono" style={{
              fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em',
              padding: '2px 7px', background: 'var(--surface-2)',
              borderRadius: 3,
            }}>{LOREBOOK[t].length}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12,
          }}>
            {LOREBOOK[t]
              .sort((a, b) => (b.always_on ? 1 : 0) - (a.always_on ? 1 : 0))
              .map(e => <LoreCard key={e.name} entry={e} type={t} />)}
          </div>
        </section>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  CSAM strip — adult mode persistent footer (Hard #2)
// ─────────────────────────────────────────────────────────────
const CSAMStrip = ({ adultMode = false }) => {
  if (!adultMode) return null;
  return (
    <div style={{
      padding: '10px 28px', background: 'var(--danger-bg)',
      borderTop: '1px solid oklch(0.55 0.15 25 / 0.3)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--font-cjk)',
    }}>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--danger)', letterSpacing: '0.12em' }}>HARD RULE</span>
      <span>平台嚴禁涉及未成年人士、真實人物或非法內容嘅創作，違者帳號永久停權並依法通報。</span>
      <div style={{ flex: 1 }} />
      <button style={{ fontSize: 11.5, color: 'var(--fg-muted)', textDecoration: 'underline' }}>了解詳情</button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  Memory Journal · desktop
// ─────────────────────────────────────────────────────────────
const MemoryJournalDesktop = ({ initialTab = 'active', adultMode = false, empty = false, activeEmpty = false }) => {
  const [tab, setTab] = React.useState(initialTab);
  const tabs = [
    { id: 'active',    label: '當前活躍記憶', sub: 'LIVE',     hint: '影響緊呢個 turn 嘅段落' },
    { id: 'summaries', label: '回憶錄',     sub: '1 章',     hint: '滾動章節摘要 · 每 ~20 turn' },
    { id: 'lorebook',  label: '角色記事',    sub: '12 條',    hint: '人物 · 地點 · 物品 · 事件 · 概念' },
  ];
  return (
    <ScreenFrame style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        padding: '0 28px', height: 64,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      }}>
        <button style={{
          height: 32, padding: '0 12px', borderRadius: 7,
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--fg-2)', fontSize: 12.5,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="arrow_l" size={11} /> 返扮演
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <div style={{ width: 32, height: 40, flex: 'none' }}>
          <Cover story={{ title: PT.storyTitle, genre: PT.storyGenre, hue: PT.storyHue }} size="xs" showLabel={false} />
        </div>
        <div>
          <h1 style={{
            margin: 0, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-cjk)',
          }}>你呢次扮演 {PT.protagonist} 嘅記憶</h1>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
            {PT.storyTitle.toUpperCase()} · TURN {PT.turn} · 唯讀 · 只有你睇到 · FORK 多一次係空白
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" icon="play">繼續扮演</Btn>
      </header>

      {/* Body: left nav + content */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 0 }}>
        <nav style={{
          background: 'var(--bg-elev)', borderRight: '1px solid var(--border)',
          padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div className="mono" style={{
            fontSize: 10, padding: '0 10px 10px', color: 'var(--accent)',
            letterSpacing: '0.16em',
          }}>記憶層 · 4-LAYER BACKEND</div>
          {tabs.map(t => (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 14px', borderRadius: 9,
                background: tab === t.id ? 'var(--surface)' : 'transparent',
                border: `1px solid ${tab === t.id ? 'var(--border)' : 'transparent'}`,
                boxShadow: tab === t.id ? 'var(--shadow-card)' : 'none',
                display: 'flex', flexDirection: 'column', gap: 5,
                textAlign: 'left',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: tab === t.id ? 'var(--accent)' : 'var(--border-strong)',
                  flex: 'none',
                  boxShadow: tab === t.id ? '0 0 0 3px var(--accent-bg)' : 'none',
                }} />
                <span style={{
                  fontSize: 13.5,
                  fontWeight: tab === t.id ? 600 : 400,
                  color: tab === t.id ? 'var(--fg)' : 'var(--fg-2)',
                  fontFamily: 'var(--font-cjk)',
                }}>{t.label}</span>
                <span className="mono" style={{
                  marginLeft: 'auto', fontSize: 10, color: tab === t.id ? 'var(--accent)' : 'var(--fg-dim)',
                  letterSpacing: '0.08em', fontWeight: tab === t.id ? 600 : 400,
                }}>{t.sub}</span>
              </div>
              <div style={{
                fontSize: 11, color: 'var(--fg-dim)', paddingLeft: 17,
                lineHeight: 1.5, fontFamily: 'var(--font-cjk)',
              }}>{t.hint}</div>
            </button>
          ))}

          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 9,
            opacity: 0.7, borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-strong)' }} />
              <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-cjk)' }}>近 20 turn 全文</span>
              <span className="mono" style={{
                marginLeft: 'auto', fontSize: 9.5, color: 'var(--fg-dim)',
                letterSpacing: '0.08em',
              }}>自動 · IN-PROMPT</span>
            </div>
            <div style={{
              fontSize: 10.5, color: 'var(--fg-dim)', paddingLeft: 17, marginTop: 4,
              lineHeight: 1.5, fontFamily: 'var(--font-cjk)',
            }}>敘事 stream 已 show 緊 · 唔需要另一個入口</div>
          </div>
        </nav>

        <main style={{ overflowY: 'auto' }}>
          {tab === 'active'    && <TabActive empty={activeEmpty} />}
          {tab === 'summaries' && <TabSummaries />}
          {tab === 'lorebook'  && <TabLorebook empty={empty} />}
        </main>
      </div>

      <CSAMStrip adultMode={adultMode} />
    </ScreenFrame>
  );
};

// Empty (turn < 10)
const MemoryJournalEarly = () => {
  const saved = MEM_SUMMARIES.splice(0, MEM_SUMMARIES.length);
  const node = (
    <ScreenFrame style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '0 28px', height: 64,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      }}>
        <button style={{
          height: 32, padding: '0 12px', borderRadius: 7,
          background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg-2)', fontSize: 12.5,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="arrow_l" size={11} /> 返扮演
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>你呢次扮演 {PT.protagonist} 嘅記憶</h1>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
            TURN 4 · 唯讀 · 只有你睇到
          </div>
        </div>
      </header>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr' }}>
        <nav style={{ background: 'var(--bg-elev)', borderRight: '1px solid var(--border)', padding: 20 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.16em', marginBottom: 10 }}>
            記憶層 · 4-LAYER BACKEND
          </div>
          {[
            { label: '當前活躍記憶', sub: 'LIVE', active: false },
            { label: '回憶錄',     sub: '0 章', active: true },
            { label: '角色記事',    sub: '2 條', active: false },
          ].map(t => (
            <div key={t.label} style={{
              padding: '12px 14px', borderRadius: 9, marginBottom: 4,
              background: t.active ? 'var(--surface)' : 'transparent',
              border: t.active ? '1px solid var(--border)' : '1px solid transparent',
              boxShadow: t.active ? 'var(--shadow-card)' : 'none',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: t.active ? 'var(--accent)' : 'var(--border-strong)',
                boxShadow: t.active ? '0 0 0 3px var(--accent-bg)' : 'none',
              }} />
              <span style={{
                fontSize: 13.5, fontFamily: 'var(--font-cjk)',
                color: t.active ? 'var(--fg)' : 'var(--fg-muted)',
                fontWeight: t.active ? 600 : 400,
              }}>{t.label}</span>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: t.active ? 'var(--accent)' : 'var(--fg-dim)' }}>{t.sub}</span>
            </div>
          ))}
        </nav>
        <main style={{ overflowY: 'auto' }}>
          <TabSummaries turnCount={4} />
        </main>
      </div>
    </ScreenFrame>
  );
  MEM_SUMMARIES.push(...saved);
  return node;
};

// Mobile
const MemoryJournalMobile = () => {
  const [tab, setTab] = React.useState('active');
  return (
    <ScreenFrame style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{
        height: 56, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
      }}>
        <button style={{ width: 32, height: 32, color: 'var(--fg-muted)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
          <Icon name="close" size={14} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-cjk)' }}>
            你呢次扮演 {PT.protagonist} 嘅記憶
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-dim)', letterSpacing: '0.06em' }}>
            TURN {PT.turn} · 唯讀 · 只有你睇到
          </div>
        </div>
      </header>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        {[
          { id: 'active',    label: '當前',    sub: 'LIVE' },
          { id: 'summaries', label: '回憶錄', sub: '1' },
          { id: 'lorebook',  label: '記事',    sub: '12' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '12px 6px',
            color: tab === t.id ? 'var(--fg)' : 'var(--fg-muted)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--font-cjk)', fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{t.sub}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'active'    && <TabActive />}
        {tab === 'summaries' && <TabSummaries />}
        {tab === 'lorebook'  && <TabLorebook />}
      </div>
    </ScreenFrame>
  );
};

Object.assign(window, {
  MEM_SUMMARIES, LOREBOOK, ACTIVE_MEMORIES, ENTITY_LABEL, ENTITY_HUE,
  LoreCard, TabActive, TabSummaries, TabLorebook, CSAMStrip,
  MemoryJournalDesktop, MemoryJournalEarly, MemoryJournalMobile,
});
