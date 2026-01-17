# Frontend Design System - Complete Reference

This is the full design system specification for the Orient frontend.

## Design Philosophy

- **Aesthetic**: "Developer-grade", technical, clean, high-contrast. Think Vercel, Linear, or shadcn/ui.
- **Palette**: Strict Black & White dominant. Color is used _only_ for semantic status (success/error/warning) and branding (rarely).
- **Typography**: Crisp sans-serif for UI, monospaced for all data, IDs, dates, and logs.
- **Density**: High information density without clutter.

## Tech Stack & Configuration

- **Framework**: React + Vite
- **Styling**: Tailwind CSS v3.4+
- **Theme Strategy**: CSS Variables with Tailwind semantic classes (`bg-background` not `bg-white`).
- **Dark Mode**: Class-based (`.dark` on `<html>`), fully supported via CSS variables.

## Semantic Color Tokens

Do NOT use hardcoded colors (e.g., `bg-white`, `text-black`, `bg-gray-100`). Use semantic tokens:

| Token                     | Description       | Light Mode | Dark Mode            |
| ------------------------- | ----------------- | ---------- | -------------------- |
| `bg-background`           | Page background   | White      | Zinc 950 (`#09090b`) |
| `text-foreground`         | Primary text      | Zinc 950   | Zinc 50              |
| `bg-card`                 | Cards/Panels      | White      | Zinc 950             |
| `border-border`           | Borders           | Zinc 200   | Zinc 800             |
| `bg-muted`                | Secondary bg      | Zinc 100   | Zinc 900             |
| `text-muted-foreground`   | Secondary text    | Zinc 500   | Zinc 400             |
| `bg-primary`              | Primary actions   | Zinc 900   | Zinc 50              |
| `text-primary-foreground` | Text on primary   | Zinc 50    | Zinc 900             |
| `bg-secondary`            | Secondary actions | Zinc 100   | Zinc 800             |

## CSS Variable Definitions

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}
```

## Typography

- **UI Font**: `font-sans` (Inter). Use for labels, headings, body text.
- **Data Font**: `font-mono` (JetBrains Mono). MANDATORY for:
  - IDs (UUIDs, hashes)
  - Dates and timestamps
  - Status codes
  - Logs / Console output
  - Metric values

### Font Sizes

| Use Case        | Class                     | Size |
| --------------- | ------------------------- | ---- |
| Body text       | `text-sm`                 | 14px |
| Labels/captions | `text-xs`                 | 12px |
| Page titles     | `text-2xl`                | 24px |
| Section titles  | `text-lg`                 | 18px |
| Card titles     | `text-base font-semibold` | 16px |

## Spacing

| Size        | Value | Use Case              |
| ----------- | ----- | --------------------- |
| `p-4`       | 16px  | Card content          |
| `p-6`       | 24px  | Card padding          |
| `gap-2`     | 8px   | Between form elements |
| `gap-4`     | 16px  | Between cards         |
| `space-y-4` | 16px  | Vertical stacking     |

## Border Radius

| Class          | Value  | Use Case                        |
| -------------- | ------ | ------------------------------- |
| `rounded-md`   | 6px    | Buttons, inputs, small elements |
| `rounded-lg`   | 8px    | Cards, modals                   |
| `rounded-xl`   | 12px   | Large cards, panels             |
| `rounded-full` | 9999px | Avatar, icon buttons only       |

## Shadows

Prefer border-based hierarchy. When shadows are needed:

| Class       | Use Case                    |
| ----------- | --------------------------- |
| `shadow-sm` | Subtle card elevation       |
| `shadow-md` | Dropdowns, popovers         |
| No shadow   | Most elements (use borders) |

## Icons

- Use **SVG icons** directly (Lucide style)
- **Stroke Width**: 1.5px or 2px
- **Size**: `w-4 h-4` (16px) or `w-5 h-5` (20px)

```tsx
import { ChevronRight, Check, X } from 'lucide-react';

<ChevronRight className="w-4 h-4" />;
```

## Status Colors

Only use color for semantic meaning:

| Status  | Background         | Text              |
| ------- | ------------------ | ----------------- |
| Success | `bg-green-500/10`  | `text-green-500`  |
| Error   | `bg-red-500/10`    | `text-red-500`    |
| Warning | `bg-yellow-500/10` | `text-yellow-500` |
| Info    | `bg-blue-500/10`   | `text-blue-500`   |

```tsx
<span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
  Success
</span>
```
