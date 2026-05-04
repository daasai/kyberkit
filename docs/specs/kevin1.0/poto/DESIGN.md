---
name: Enterprise AI Workspace
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd9e0'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2fa'
  surface-container: '#f0ecf4'
  surface-container-high: '#eae7ef'
  surface-container-highest: '#e5e1e9'
  on-surface: '#1b1b21'
  on-surface-variant: '#474651'
  inverse-surface: '#303036'
  inverse-on-surface: '#f3eff7'
  outline: '#777682'
  outline-variant: '#c8c5d3'
  surface-tint: '#5654a8'
  primary: '#1a146b'
  on-primary: '#ffffff'
  primary-container: '#312e81'
  on-primary-container: '#9c9af4'
  inverse-primary: '#c3c0ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#3e1a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#5f2b00'
  on-tertiary-container: '#de915e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#100563'
  on-primary-fixed-variant: '#3e3c8f'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdbc7'
  tertiary-fixed-dim: '#ffb688'
  on-tertiary-fixed: '#311300'
  on-tertiary-fixed-variant: '#70380b'
  background: '#fcf8ff'
  on-background: '#1b1b21'
  surface-variant: '#e5e1e9'
typography:
  h1:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  h2:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h3:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  code:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin: 24px
---

## Brand & Style

This design system is engineered for high-performance enterprise AI environments where clarity and cognitive load management are paramount. The brand personality is authoritative yet unobtrusive, functioning as a sophisticated tool rather than a distraction. It evokes an emotional response of focus, reliability, and precision.

The visual style is a synthesis of **Minimalism** and **Corporate Modern**. It leverages generous whitespace to separate complex data streams and adopts a "Native Mac-app" aesthetic—utilizing subtle borders and a restricted color palette to create a familiar, high-utility environment for power users.

## Colors

The palette is anchored in a neutral Zinc scale to maintain a clinical, professional atmosphere. The primary background uses Zinc-50 to reduce eye strain compared to pure white, while structural elements are defined by Zinc-200 borders.

Primary actions and focus states utilize a Deep Indigo (Indigo-900/Slate mix) to provide high-contrast touchpoints. Tertiary accents for success, warning, or AI-specific features should remain desaturated to preserve the system's minimalist integrity.

- **Surface:** Zinc-50 (Off-white)
- **Border:** Zinc-200 (Subtle Grey)
- **Primary:** Indigo-900 (Deep Indigo)
- **Secondary:** Slate-600 (Muted Text)
- **Text:** Zinc-950 (High-contrast Black)

## Typography

The typography system follows a dual-font strategy to balance character with utility. **Manrope** is reserved for headlines and UI landmarks, providing a modern, geometric warmth that feels premium. **Inter** is used for all functional body text, data displays, and input fields due to its exceptional legibility and systematic "native app" feel.

Strict adherence to a 4px baseline grid ensures vertical rhythm. High contrast is maintained by using Zinc-950 for headings and Zinc-700 for long-form body copy.

## Layout & Spacing

The layout philosophy utilizes a **Fluid Grid with Fixed Sidebars**. Navigation and utility panels are fixed-width (typically 240px or 280px) to mimic desktop IDEs, while the central AI workspace expands to fill the viewport.

Spacing follows an 8pt linear scale for layout (16, 24, 32) and a 4pt scale for component internals (4, 8, 12). This ensures that even the most information-dense screens remain organized and scannable.

## Elevation & Depth

Hierarchy in this design system is primarily achieved through **Tonal Layers** and **Low-contrast Outlines** rather than heavy shadows. 

1.  **Level 0 (Base):** Zinc-50 background.
2.  **Level 1 (Cards/Panels):** Pure White (#FFFFFF) surfaces with a 1px Zinc-200 border.
3.  **Level 2 (Popovers/Modals):** Pure White with a 1px Zinc-200 border and a very soft, diffused ambient shadow (0px 10px 15px -3px rgba(0, 0, 0, 0.05)).

Avoid using drop shadows on standard UI buttons or cards to maintain the minimalist, flat aesthetic of an enterprise tool.

## Shapes

The shape language is consistently **Rounded** (Level 2). This radius is large enough to feel modern and approachable but tight enough to remain professional and space-efficient for dense data grids.

- Standard Components (Buttons, Inputs): 8px (0.5rem)
- Large Components (Cards, Modals): 16px (1rem)
- Extra Large (Workspace Containers): 24px (1.5rem)

## Components

### Buttons
- **Primary:** Solid Deep Indigo (Indigo-900) with white text. 8px radius.
- **Secondary:** White background, 1px Zinc-200 border, Zinc-900 text.
- **Ghost:** Transparent background, Indigo-900 text, Zinc-100 hover state.

### Input Fields
- **Default:** White background, 1px Zinc-200 border. 14px Inter text.
- **Focus:** 1px Indigo-900 border with a 2px Indigo-100 outer glow.

### Cards & Containers
- Containers should use white backgrounds against the Zinc-50 page background to create a subtle "lift." Borders are mandatory for structure.

### AI-Specific Components
- **Message Bubbles:** User messages feature a light Zinc-100 background. AI responses use a pure white background with a subtle Indigo-50 tint or border to denote origin.
- **Code Blocks:** Zinc-950 background with syntax highlighting in high-contrast pastels; 8px radius; monospaced font.
- **Action Chips:** Small, 12px Inter Semibold text, Zinc-100 background, 100px pill radius for interactive suggestions.