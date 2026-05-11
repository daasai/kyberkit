/**
 * First-run guide after onboarding (PRD §8.5) — dismissible card in CenterPanel.
 */

export function WelcomeGuideCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '28px 32px',
        borderRadius: '16px',
        border: '1px solid var(--color-outline-variant)',
        background: 'var(--color-surface-container)',
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 700, color: 'var(--color-on-surface)' }}>
        欢迎使用 Kevin
      </h2>
      <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--color-on-surface)' }}>Kevin 是什么：</strong>
        一款跑在你电脑上的<strong>本地文档库助手</strong>——不替代你的编辑器，而是帮你在库内找材料、执行指令、把结果写回成文件。
      </p>
      <p style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--color-on-surface)' }}>整体能做什么：</strong>
        <strong>左侧</strong>浏览与选中库内文件夹；<strong>右侧</strong>用自然语言下任务（含 @ 文件、/ Skill）；<strong>中栏</strong>查看与编辑 Kevin 输出的 Markdown 等主产物。已安装的 <strong>Skill</strong> 把常用流程收成一键能力。
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--color-on-surface)' }}>建议从这里开始：</strong>
        在右侧随便问一句 → 看中栏是否出现回复或产物；需要固定写法时，再用下面三种方式补全上下文。
      </p>
      <ul style={{ margin: '0 0 24px', paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--color-primary)', flexShrink: 0 }}>
            alternate_email
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>用 @ 引用文档库</div>
            <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
              在右侧输入框点击 @ 或输入 <code style={{ fontSize: '12px' }}>@路径</code>，把左侧文档库中的文件作为上下文发给 Kevin。
            </div>
          </div>
        </li>
        <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/*
            Avoid Material symbol name "slash" — it renders as a wide "SLASH" logotype (UAT-002).
            Use a compact / badge aligned with the @ row icon size.
          */}
          <span
            aria-hidden
            style={{
              width: '22px',
              height: '22px',
              flexShrink: 0,
              borderRadius: '50%',
              border: '1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-outline-variant))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--color-primary)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
            }}
          >
            /
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>用 / 唤起 Skill</div>
            <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
              输入 <code style={{ fontSize: '12px' }}>/</code> 开头可浏览当前 Space 已安装的 Skill，选择后会把 Skill 说明注入对话。
            </div>
          </div>
        </li>
        <li style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--color-primary)', flexShrink: 0 }}>
            auto_awesome
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Skill Forge 蒸馏</div>
            <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
              多次相似任务后，Kevin 可能提示将流程保存为 Skill；也可使用 <code style={{ fontSize: '12px' }}>/save-as-skill</code> 主动保存。
            </div>
          </div>
        </li>
      </ul>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '15px',
          fontWeight: 600,
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer',
          background: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
        }}
      >
        开始使用
      </button>
    </div>
  )
}
