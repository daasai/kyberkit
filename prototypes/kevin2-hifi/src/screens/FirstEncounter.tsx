/** 11 §2 — 第一次见面：扫描工作台 + 结构化认知（静态） */

export function FirstEncounter() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="shrink-0 border-b border-j-muted/15 bg-j-bg px-8 py-5 text-j-cream">
        <p className="font-display text-2xl text-j-accent">正在认识你的工作目录</p>
        <p className="mt-1 text-sm text-j-cream/65">T+2s → T+10s 扫描工作台（示意，无真实流式）</p>
      </header>

      <div className="proto-scroll grid flex-1 gap-6 overflow-auto p-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-j-muted/15 bg-white p-5 font-mono text-xs text-j-muted shadow-sm">
            <p className="text-j-brand">{'>'} 看到 142 个文件 · 抽样 README · 读取 docs/specs …</p>
            <p className="mt-2">{'>'} 索引队列：后台继续</p>
          </div>

          <div className="rounded-xl border border-j-muted/15 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase text-j-muted">首屏认知</p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed">
              <p>
                <span className="font-medium text-j-brand">[识别]</span> 这是一个产品规范项目，主要关于 Kevin 2.0 的 PRD 与 UX 对齐。
              </p>
              <p>
                <span className="font-medium text-j-brand">[规模]</span> 核心文件 11 个，最近一次更新是今天上午。
              </p>
              <p>
                <span className="font-medium text-j-brand">[发现]</span> 06 文档引用了 02 中尚未展开的字段——可能需要对齐。
              </p>
              <p>
                <span className="font-medium text-j-brand">[确认]</span> hermes/ 下两份草稿尚未被规范引用，后台会继续读。
              </p>
              <p>
                <span className="font-medium text-j-brand">[问题]</span> 你想先推进 02 的字段补全，还是先看 hermes 草稿？
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-j-accent/30 bg-j-cream p-5">
            <p className="text-xs font-semibold text-j-brand">Suggested Next Step（进入 Home 后承接 · 05）</p>
            <p className="mt-2 text-sm font-medium">对齐 02 与 06 的 object 字段，并更新证据链占位。</p>
            <button type="button" className="mt-3 rounded-lg bg-j-brand px-4 py-2 text-sm font-semibold text-j-cream">
              继续
            </button>
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-j-muted/15 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-j-muted">读取进度（示意）</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-j-muted/15">
            <div className="h-full w-[72%] rounded-full bg-j-accent" />
          </div>
          <p className="mt-2 text-xs text-j-muted">72%</p>
          <ul className="mt-4 space-y-2 text-xs text-j-muted">
            <li className="flex gap-2">
              <span className="text-j-accent">✓</span> README
            </li>
            <li className="flex gap-2">
              <span className="text-j-accent">✓</span> docs/specs/kevin2.0
            </li>
            <li className="flex gap-2">
              <span className="text-j-muted">…</span> hermes/
            </li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
