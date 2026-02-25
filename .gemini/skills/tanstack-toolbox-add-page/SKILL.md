---
name: tanstack-toolbox-add-page
description: A skill to add a new page or tool to the TanStack Toolbox project. It automates route creation and registers the new tool in the navigation and home page features.
---

# TanStack Toolbox Add Page

This skill automates the process of adding a new tool to the project, ensuring it is correctly integrated into the navigation and home page.

## Workflow

### 1. Create the Route File
Create `src/routes/path-name.tsx` (using kebab-case). Use the TanStack Router `createFileRoute` pattern.

**Template:**
```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/path-name')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6">Tool Title</h1>
      {/* Tool Content */}
    </div>
  )
}
```

### 2. Register in Navigation (`src/components/Header.tsx`)
Add a new link to the sidebar navigation.

**Action:** Find the `<nav>` section and append a new `<Link>`.
**Code:**
```tsx
          <Link
            to="/path-name"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground transition-colors mb-2 font-bold',
            }}
          >
            <IconName size={20} />
            <span className="font-medium">工具名称</span>
          </Link>
```
*Note: Ensure `IconName` is imported from `lucide-react`.*

### 3. Add to Home Page Features (`src/routes/index.tsx`)
Add a feature card to the `features` array.

**Action:** Locate the `features` array and add a new entry.
**Code:**
```tsx
    {
      icon: <IconName className="w-12 h-12" />,
      title: '工具名称',
      description: '工具的简短描述。',
      link: '/path-name'
    },
```

## Guidelines
- **Icons:** Use `lucide-react`. Check existing imports first.
- **Language:** Use **Chinese** for UI text (`title`, `description`, navigation labels) to match the project's primary language.
- **Consistency:** Maintain Tailwind CSS v4 styling and TanStack Router conventions.
- **Auto-import:** When adding icons or components, always ensure the corresponding import statement is added or updated.
