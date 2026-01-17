# Component Patterns Reference

Detailed component examples following the design system.

## Buttons

### Primary Button

```tsx
<button className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
  Primary Action
</button>
```

### Secondary Button

```tsx
<button className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-medium transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
  Secondary
</button>
```

### Outline Button

```tsx
<button className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-input bg-transparent text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
  Outline
</button>
```

### Ghost Button

```tsx
<button className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
  Ghost
</button>
```

### Icon Button

```tsx
<button className="inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
  <PlusIcon className="w-4 h-4" />
</button>
```

## Cards

### Basic Card

```tsx
<div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
  <div className="flex flex-col space-y-1.5 p-6">
    <h3 className="font-semibold leading-none tracking-tight">Card Title</h3>
    <p className="text-sm text-muted-foreground">Card description goes here.</p>
  </div>
  <div className="p-6 pt-0">{/* Card content */}</div>
</div>
```

### Card with Header

```tsx
<div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
  <div className="flex items-center justify-between p-6 border-b border-border">
    <div>
      <h3 className="font-semibold text-foreground">Deployment Status</h3>
      <span className="font-mono text-xs text-muted-foreground">ID: 8f92a1</span>
    </div>
    <button className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium">
      Deploy
    </button>
  </div>
  <div className="p-6">
    <p className="text-sm text-muted-foreground">Content here</p>
  </div>
</div>
```

## Inputs

### Text Input

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    Label
  </label>
  <input
    type="text"
    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    placeholder="Enter value..."
  />
</div>
```

### Textarea

```tsx
<textarea
  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  placeholder="Enter description..."
  rows={3}
/>
```

### Select

```tsx
<select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
  <option value="">Select option...</option>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</select>
```

## Tables

### Data Table

```tsx
<div className="rounded-md border border-border">
  <table className="w-full">
    <thead>
      <tr className="border-b border-border bg-muted/50">
        <th className="h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Issue
        </th>
        <th className="h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Status
        </th>
        <th className="h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Updated
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-border transition-colors hover:bg-muted/50">
        <td className="p-4 align-middle">
          <span className="font-mono text-sm">PROJ-12345</span>
        </td>
        <td className="p-4 align-middle">
          <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
            Done
          </span>
        </td>
        <td className="p-4 align-middle">
          <span className="font-mono text-xs text-muted-foreground">2026-01-12</span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

## Badges & Status

### Status Badge

```tsx
// Success
<span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
  Active
</span>

// Warning
<span className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-500">
  Pending
</span>

// Error
<span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
  Failed
</span>

// Neutral
<span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
  Draft
</span>
```

## Layout Patterns

### Page Layout

```tsx
<div className="min-h-screen bg-background">
  {/* Navbar */}
  <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
    <div className="container flex h-14 items-center">{/* Nav content */}</div>
  </nav>

  {/* Main content */}
  <main className="container py-6">{/* Page content */}</main>
</div>
```

### Sidebar Layout

```tsx
<div className="flex min-h-screen">
  {/* Sidebar */}
  <aside className="w-64 border-r border-border bg-card">
    <div className="p-4">{/* Sidebar content */}</div>
  </aside>

  {/* Main */}
  <main className="flex-1 p-6">{/* Content */}</main>
</div>
```

### Card Grid

```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {items.map((item) => (
    <div key={item.id} className="rounded-xl border border-border bg-card p-6">
      {/* Card content */}
    </div>
  ))}
</div>
```

## Modals / Dialogs

### Modal Container

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop */}
  <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />

  {/* Modal */}
  <div className="relative z-50 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold">Modal Title</h2>
      <button className="rounded-full p-1 hover:bg-muted">
        <XIcon className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-4">{/* Modal content */}</div>
    <div className="flex justify-end gap-2 mt-6">
      <button className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-medium">
        Cancel
      </button>
      <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
        Confirm
      </button>
    </div>
  </div>
</div>
```

## Empty States

```tsx
<div className="flex flex-col items-center justify-center p-8 text-center">
  <div className="rounded-full bg-muted p-3 mb-4">
    <InboxIcon className="w-6 h-6 text-muted-foreground" />
  </div>
  <h3 className="font-semibold text-foreground mb-1">No items found</h3>
  <p className="text-sm text-muted-foreground mb-4">Get started by creating your first item.</p>
  <button className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
    Create Item
  </button>
</div>
```

## Loading States

### Spinner

```tsx
<div className="flex items-center justify-center p-4">
  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
</div>
```

### Skeleton

```tsx
<div className="space-y-3">
  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
</div>
```
