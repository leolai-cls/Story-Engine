/**
 * A5 audit fix · Library loading skeleton (hero-shaped per designer mock).
 * Next.js Suspense boundary shows this during SSR / data fetch.
 * 3-row layout matches default library page · all 3 carousels skeletoned.
 */

export default function LibraryLoading() {
  return (
    <>
      <main className="flex-1" style={{ background: "var(--se-bg)" }}>
        {/* Hero skeleton */}
        <Skel
          h={520}
          style={{
            borderRadius: 0,
            borderBottom: "1px solid var(--se-border)",
          }}
        />
        {/* Genre rail skeleton */}
        <div
          className="flex items-center gap-2.5 px-14"
          style={{
            padding: "14px 56px",
            background: "rgba(251,250,246,0.92)",
            borderBottom: "1px solid var(--se-border)",
          }}
        >
          {[60, 50, 50, 60, 55, 50, 50, 60].map((w, i) => (
            <Skel key={i} w={w} h={32} r={999} />
          ))}
        </div>
        {/* 3 carousel rows */}
        {[0, 1, 2].map((row) => (
          <section
            key={row}
            className="mt-7"
            style={{ paddingLeft: 56 }}
          >
            <div className="flex items-baseline gap-3 mb-3 px-0" style={{ paddingRight: 56 }}>
              <Skel w={22} h={22} r={5} />
              <Skel w={120} h={16} />
              <Skel w={80} h={11} />
            </div>
            <div className="flex gap-3.5 overflow-hidden" style={{ paddingRight: 56 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  style={{ width: 224, flex: "none" }}
                  className="flex flex-col"
                >
                  <Skel
                    w={224}
                    h={298}
                    r={8}
                  />
                  <div className="mt-2.5 pl-0.5 flex items-center gap-1.5">
                    <Skel w={16} h={16} r={999} />
                    <Skel w={70} h={11} />
                    <Skel w={30} h={11} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <div style={{ height: 80 }} />
      </main>
      <style>{`
        @keyframes se-shimmer {
          0% { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
    </>
  );
}

function Skel({
  w,
  h,
  r = 6,
  style,
}: {
  w?: number;
  h: number;
  r?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background:
          "linear-gradient(90deg, var(--se-surface) 0%, var(--se-surface-2) 50%, var(--se-surface) 100%)",
        backgroundSize: "200% 100%",
        animation: "se-shimmer 1.4s var(--se-ease) infinite",
        flex: w ? "none" : undefined,
        ...style,
      }}
    />
  );
}
