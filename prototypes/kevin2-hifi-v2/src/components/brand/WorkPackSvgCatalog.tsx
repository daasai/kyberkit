/**
 * 工作包 / Logo / 装饰 的 SVG 候选集，供 SvgGallery 展示与人工筛选。
 * 选定后可将对应 path 迁入正式组件（如 SetupWorkspace 卡片、KevinBrand）。
 */

import type { ReactElement, SVGProps } from 'react'

type Svg = (props: SVGProps<SVGSVGElement>) => ReactElement

const S = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 48 48',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

/* ---------- Logo 备选（品牌区除现有调色盘外） ---------- */

/** 当前线上：调色盘 + 四色点 */
export const Logo_palette: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 28c0-8 6.5-14.5 14.5-15 1-4 4.5-7 9-7 4 0 7.5 2.8 8.5 7 6 .8 10 6 10 12.5 0 7-5.5 12.5-12.5 12.5H14C10.5 38 8 35.5 8 32v-4Z" />
    <circle cx="17" cy="24" r="2.2" />
    <circle cx="24" cy="19" r="2.2" />
    <circle cx="31" cy="24" r="2.2" />
    <circle cx="24" cy="30" r="2.2" />
  </svg>
)

/** K 字母 + 圆角框 */
export const Logo_kFrame: Svg = (p) => (
  <svg {...S(p)}>
    <rect x="8" y="8" width="32" height="32" rx="8" />
    <path d="M16 16v16M16 24h8l8 8M16 24l8-8" strokeWidth="2" />
  </svg>
)

/** 脉冲环 · 暗示 Always-on */
export const Logo_pulseRing: Svg = (p) => (
  <svg {...S(p)}>
    <circle cx="24" cy="24" r="10" />
    <circle cx="24" cy="24" r="6" opacity="0.5" />
    <circle cx="24" cy="24" r="14" opacity="0.35" />
    <circle cx="24" cy="24" r="3.5" fill="currentColor" strokeWidth={0} />
  </svg>
)

/** 轨道节点 · 持续在场 */
export const Logo_orbitMark: Svg = (p) => (
  <svg {...S(p)}>
    <ellipse cx="24" cy="24" rx="16" ry="9" opacity="0.55" transform="rotate(-12 24 24)" />
    <circle cx="24" cy="15" r="2.8" fill="currentColor" stroke="none" />
    <circle cx="33" cy="28" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
    <circle cx="15" cy="27" r="2.2" fill="currentColor" stroke="none" opacity="0.85" />
    <circle cx="24" cy="24" r="4" />
  </svg>
)

/** 切面六边形 · 工具感 */
export const Logo_facetedHex: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M24 6 40 15v18L24 42 8 33V15L24 6Z" />
    <path d="M24 12 34 18v12L24 36 14 30V18L24 12Z" opacity="0.4" />
    <path d="M24 18v12M18 21l12 6M30 21l-12 6" opacity="0.55" />
  </svg>
)

/** 双环相扣 · 连接与闭环 */
export const Logo_interlockRings: Svg = (p) => (
  <svg {...S(p)}>
    <circle cx="19" cy="22" r="9" />
    <circle cx="29" cy="26" r="9" />
    <path d="M14 28c2 4 5 6 10 6" opacity="0.35" />
  </svg>
)

/** 等距立方 · 空间 / Workspace */
export const Logo_isoCube: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M24 8l14 8v16l-14 8-14-8V16l14-8Z" />
    <path d="M24 8v16l14 8M24 24 10 32" opacity="0.45" />
  </svg>
)

/** 上升折线切入圆 · 增长与判断 */
export const Logo_riseArc: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 36c10-18 22-22 32-26" opacity="0.35" />
    <path d="M10 34 L18 26 26 28 34 16 42 20" strokeWidth="2" />
    <circle cx="24" cy="24" r="15" opacity="0.25" />
  </svg>
)

/** 透镜交汇 · 聚焦与上下文 */
export const Logo_lensNexus: Svg = (p) => (
  <svg {...S(p)}>
    <circle cx="18" cy="24" r="11" />
    <circle cx="30" cy="24" r="11" />
    <path d="M21 24h6" strokeWidth="2.2" />
    <circle cx="24" cy="24" r="3" fill="currentColor" stroke="none" />
  </svg>
)

/** 连续一笔 · 抽象 K */
export const Logo_singleStrokeK: Svg = (p) => (
  <svg {...S(p)}>
    <path
      d="M14 10v28M14 24h10c6 0 10-4 10-10 0-4-2.5-6-6-6H14M14 24l12 14"
      strokeWidth="2.2"
      strokeLinejoin="miter"
    />
  </svg>
)

/** 叠弧光晕 · 柔和 Always-on */
export const Logo_softAurora: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M4 32c8-14 16-18 24-18s16 4 24 18" opacity="0.28" />
    <path d="M8 30c7-10 14-13 22-13s15 3 22 13" opacity="0.45" />
    <path d="M12 28c6-6 12-8 18-8s12 2 18 8" />
    <circle cx="24" cy="26" r="3.5" fill="currentColor" stroke="none" />
  </svg>
)

/** 门扉微启 · 进入工作区 */
export const Logo_threshold: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M12 10h20a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H12V10Z" />
    <path d="M28 14v22" opacity="0.5" />
    <circle cx="30" cy="25" r="1.8" fill="currentColor" stroke="none" />
  </svg>
)

/* ---------- 装饰简笔画 备选（资料库 / 工作区） ---------- */

/** 当前：文件夹轮廓 */
export const Decor_folder: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M4 14h12l4 4h28v26H4V14Z" />
    <path d="M4 22h48" strokeDasharray="3 3" opacity="0.45" strokeWidth="1" />
  </svg>
)

/** 当前：四宫格 + 放置手势线 */
export const Decor_tiles: Svg = (p) => (
  <svg {...S(p)}>
    <rect x="6" y="8" width="14" height="14" rx="1" />
    <rect x="24" y="8" width="14" height="14" rx="1" />
    <rect x="6" y="26" width="14" height="14" rx="1" />
    <rect x="24" y="26" width="14" height="14" rx="1" />
    <path d="M42 12c2 2 4 6 4 10M40 28h8" />
  </svg>
)

/** 云 + 下箭头 · 资料同步感 */
export const Decor_cloudDown: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M12 30c-4 0-6-3.5-6-7 0-4 3-7 7-7h1.5c1-5 5.5-8 11-8 6 0 10.5 4 11 9h1c4 0 7.5 3 7.5 7.5S40 38 36 38H12" />
    <path d="M24 22v12M20 34l4 4 4-4" />
  </svg>
)

/** 书本翻开 */
export const Decor_openBook: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 12h14v28H8c-2 0-4-2-4-4V16c0-2 2-4 4-4Z" />
    <path d="M40 12H26v28h14c2 0 4-2 4-4V16c0-2-2-4-4-4Z" />
    <path d="M24 12v28" opacity="0.4" />
  </svg>
)

/* ---------- 通用包 ---------- */

export const Pack_general_nodes: Svg = (p) => (
  <svg {...S(p)}>
    <circle cx="14" cy="16" r="3" />
    <circle cx="34" cy="14" r="3" />
    <circle cx="22" cy="32" r="3" />
    <circle cx="36" cy="30" r="3" />
    <path d="M16.5 17.5l4 10M31 16l-6 14M25 32l8-2" />
  </svg>
)

export const Pack_general_layers: Svg = (p) => (
  <svg {...S(p)}>
    <rect x="10" y="28" width="28" height="8" rx="1" />
    <rect x="12" y="20" width="24" height="8" rx="1" />
    <rect x="14" y="12" width="20" height="8" rx="1" />
  </svg>
)

export const Pack_general_sliders: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M10 14h28M10 24h28M10 34h28" />
    <circle cx="18" cy="14" r="3" fill="currentColor" strokeWidth={0} />
    <circle cx="28" cy="24" r="3" fill="currentColor" strokeWidth={0} />
    <circle cx="22" cy="34" r="3" fill="currentColor" strokeWidth={0} />
  </svg>
)

/* ---------- 产品设计包 ---------- */

export const Pack_product_docFold: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M14 8h14l8 8v26H14V8Z" />
    <path d="M28 8v8h8" />
    <path d="M18 26h16M18 32h12" opacity="0.6" />
  </svg>
)

export const Pack_product_roadmap: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 36h32" />
    <circle cx="12" cy="36" r="3" />
    <circle cx="24" cy="28" r="3" />
    <circle cx="36" cy="18" r="3" />
    <path d="M14.5 34.5l8-6M26.5 27.5l8-8" />
  </svg>
)

export const Pack_product_lightbulb: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M18 30c-4-3-6-7-6-12 0-8 6.5-14 14-14s14 6 14 14c0 5-2 9-6 12" />
    <path d="M18 32h12v4H18v-4ZM20 38h8" />
  </svg>
)

/* ---------- 数据分析包 ---------- */

export const Pack_data_bars: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M10 38V22M22 38V14M34 38V26" strokeWidth="2.2" />
  </svg>
)

export const Pack_data_lineChart: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 32 L16 28 24 30 32 18 40 22" />
    <path d="M8 38h32" opacity="0.35" />
  </svg>
)

export const Pack_data_table: Svg = (p) => (
  <svg {...S(p)}>
    <rect x="10" y="12" width="28" height="26" rx="1" />
    <path d="M10 20h28M18 12v26M28 12v26" />
  </svg>
)

/* ---------- 内容运营包 ---------- */

export const Pack_content_quote: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M14 18c-4 4-6 8-6 14h10c0-5 2-9 6-12v-2h-10Z" />
    <path d="M30 18c-4 4-6 8-6 14h10c0-5 2-9 6-12v-2H30Z" />
  </svg>
)

export const Pack_content_pen: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M32 10l6 6-18 18-8 2 2-8 18-18Z" />
    <path d="M34 12l2 2" />
    <path d="M14 36h6" opacity="0.5" />
  </svg>
)

export const Pack_content_waves: Svg = (p) => (
  <svg {...S(p)}>
    <path d="M8 28c4-6 8-6 12 0s8 6 12 0 8-6 12 0" />
    <circle cx="24" cy="16" r="3" />
    <path d="M18 38h12" opacity="0.45" />
  </svg>
)

/* ---------- 图库用元数据 ---------- */

export const LOGO_OPTIONS: { id: string; label: string; Svg: Svg }[] = [
  { id: 'logo_palette', label: '调色盘（图标实验）', Svg: Logo_palette },
  { id: 'logo_orbitMark', label: '轨道节点', Svg: Logo_orbitMark },
  { id: 'logo_facetedHex', label: '切面六边形', Svg: Logo_facetedHex },
  { id: 'logo_interlockRings', label: '双环相扣', Svg: Logo_interlockRings },
  { id: 'logo_isoCube', label: '等距立方', Svg: Logo_isoCube },
  { id: 'logo_riseArc', label: '上升折线', Svg: Logo_riseArc },
  { id: 'logo_lensNexus', label: '透镜交汇', Svg: Logo_lensNexus },
  { id: 'logo_singleStrokeK', label: '一笔 K', Svg: Logo_singleStrokeK },
  { id: 'logo_softAurora', label: '叠弧光晕', Svg: Logo_softAurora },
  { id: 'logo_threshold', label: '门扉微启', Svg: Logo_threshold },
  { id: 'logo_kFrame', label: 'K 字框', Svg: Logo_kFrame },
  { id: 'logo_pulseRing', label: '脉冲环', Svg: Logo_pulseRing },
]

/** 创建工作区 · 工作包卡片主图标（已定稿） */
export const WORK_PACK_CARD_ICON = {
  general: Pack_general_nodes,
  product: Pack_product_lightbulb,
  data: Pack_data_lineChart,
  content: Pack_content_quote,
} as const satisfies Record<string, Svg>

export const DECOR_OPTIONS: { id: string; label: string; Svg: Svg }[] = [
  { id: 'decor_folder', label: '文件夹（当前·资料库旁）', Svg: Decor_folder },
  { id: 'decor_tiles', label: '四宫格（当前·工作包旁）', Svg: Decor_tiles },
  { id: 'decor_cloudDown', label: '云下载', Svg: Decor_cloudDown },
  { id: 'decor_openBook', label: '翻开书', Svg: Decor_openBook },
]

export const WORK_PACK_OPTIONS: {
  packId: string
  packLabel: string
  items: { id: string; label: string; Svg: Svg }[]
}[] = [
  {
    packId: 'general',
    packLabel: '通用包',
    items: [
      { id: 'general_nodes', label: '节点网络', Svg: Pack_general_nodes },
      { id: 'general_layers', label: '三层叠', Svg: Pack_general_layers },
      { id: 'general_sliders', label: '三轨滑杆', Svg: Pack_general_sliders },
    ],
  },
  {
    packId: 'product',
    packLabel: '产品设计包',
    items: [
      { id: 'product_docFold', label: '折角文档', Svg: Pack_product_docFold },
      { id: 'product_roadmap', label: '路线图节点', Svg: Pack_product_roadmap },
      { id: 'product_lightbulb', label: '灯泡', Svg: Pack_product_lightbulb },
    ],
  },
  {
    packId: 'data',
    packLabel: '数据分析包',
    items: [
      { id: 'data_bars', label: '柱状', Svg: Pack_data_bars },
      { id: 'data_lineChart', label: '折线', Svg: Pack_data_lineChart },
      { id: 'data_table', label: '表格', Svg: Pack_data_table },
    ],
  },
  {
    packId: 'content',
    packLabel: '内容运营包',
    items: [
      { id: 'content_quote', label: '双引号', Svg: Pack_content_quote },
      { id: 'content_pen', label: '钢笔', Svg: Pack_content_pen },
      { id: 'content_waves', label: '声波', Svg: Pack_content_waves },
    ],
  },
]
