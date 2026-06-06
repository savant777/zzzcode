# ZZZCODE EDITOR

ZZZCODE EDITOR is a template editing tool built to make RoleplayTH roleplay templates easier to use. Instead of manually digging through HTML or BBCode, users can fill in structured fields, preview the result in real time, and copy the finished code for use on the RoleplayTH website.

Live site: [https://zzzcode.vercel.app/?group=category&tag=all](https://zzzcode.vercel.app/?group=category&tag=all)

## Project Goal

Roleplay templates can be difficult to edit when users need to search through raw code, identify the right values, and avoid accidentally breaking the layout. This project turns those templates into guided forms.

The main goal is to help users:

- edit RoleplayTH templates without touching raw code
- fill in template values field by field
- preview the final layout while editing
- copy the generated code, then paste it into RoleplayTH manually

## User Roles

### General Users

General users only need access to the editor flow. They do not need to log in because their goal is simply to use an existing template, fill in the content, preview it, and copy the result.

This keeps the public experience simple and avoids exposing template setup tools to users who only want to generate code.

### Template Creators

Template creators use the create and edit pages to build, configure, and maintain templates.

Creators sign in with Discord. Access is limited to Discord accounts that are linked to an active creator profile, and new creators must pass an invite-code onboarding flow before a creator profile can be created.

The project owner can manage all templates, tags, and creator-owned content. Other creators can manage their own templates and creator-owned tags.

## Features

- Public template dashboard with search, category filters, tags, and grid/list views
- Template editor with generated input fields
- Live preview while editing
- One-click copy for generated HTML/BBCode output
- Private templates with password access
- Draft autosave in local storage
- Undo/redo support in the editor
- Template creation page for setting up new templates
- Template edit page for updating existing templates and field configuration
- Creator profile page with Discord account linking
- Creator tag management page with search, filters, sorting, and soft-delete/deactivation
- Invite-code creator onboarding with Discord authentication
- Automatic field detection from template blueprint syntax
- Support for text, BBCode, color, select, slider, checkbox, and gradient fields
- Repeatable blocks for templates with multiple similar sections
- Drag-and-drop ordering for blocks, groups, and fields
- Supabase-backed template and tag storage

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- dnd-kit
- react-colorful
- Sonner
- Vercel

## User Guide

### 1. Open the Template List

Go to the default public page:

[https://zzzcode.vercel.app/?group=category&tag=all](https://zzzcode.vercel.app/?group=category&tag=all)

Users can browse available templates, search by title, filter by tags, and switch between grid and list views.

### 2. Choose a Template

Click `use_this` on a template card.

If the template is public, the editor will open immediately. If the template is private, the user must enter the template password first.

### 3. Fill In the Fields

The editor displays structured fields based on the template configuration. Depending on the template, fields may include text inputs, BBCode editors, colors, dropdowns, sliders, checkboxes, gradients, or repeatable blocks.

Users only need to edit the fields shown on screen. They do not need to modify the template code manually.

### 4. Check the Live Preview

The preview updates as the user edits the fields. This helps users confirm spacing, colors, images, and text before copying the final code.

### 5. Copy the Output

Click `Copy` to copy the generated code. After that, users manually paste the copied output into the RoleplayTH website.

## Template Creator Guide

### 1. Create a Template

Template creators can use the create page to add a new template.

The creator provides:

- template title
- description
- preview image URL
- tags
- private/password setting if needed
- HTML blueprint

When a blueprint is entered, ZZZCODE EDITOR scans it and detects editable fields automatically.

### 2. Configure Fields

Detected fields can be configured into different input types:

- `text`
- `bbcode`
- `color`
- `select`
- `slider`
- `checkbox`
- `gradient`

Creators can also group fields, organize blocks, and adjust field order so the editor is easier for general users to understand.

### 3. Use Template Syntax

Templates are built from an HTML blueprint with special markers.

#### Variable

```html
<div>{{character_name}}</div>
```

This creates an editable field named `character_name`.

#### Variable With Default Value

```html
<div>{{character_name:Unknown}}</div>
```

If the user does not enter a value, the default value can be used as the starting field value.

#### Field Group

```html
{{character_name:Unknown[GROUP:Basic Info]}}
{{age:18[GROUP:Basic Info]}}
```

Groups help organize related fields in the editor.

#### Repeatable Block

```html
[BLOCK:relationships]
  <div>{{name}}</div>
  <div>{{description}}</div>
[/BLOCK:relationships]
```

Blocks allow users to add multiple entries for the same section, such as relationships, inventory items, gallery images, or timeline entries.

#### Repeat Marker

```html
[REPEAT:stars]
  *
[/REPEAT]
```

Repeats a piece of content based on a user-controlled number.

### 4. Edit Existing Templates

The edit page lets creators update template details, tags, blueprint code, field configuration, and private access settings.

Existing field settings are preserved when possible, even when the blueprint changes.

### 5. Manage Tags

Creators can use the manage tags page to view, search, filter, sort, add, edit, and deactivate tags.

Tag management rules:

- global tags are owner-managed
- creator-owned tags can only be managed by their creator
- the `creators` tag group is managed by the system and is not editable from the tag manager
- the `the-plastics` tag group is locked to the project owner
- deactivating a tag uses `is_active = false` instead of deleting the row

### 6. Creator Sign-In and Onboarding

The creator sign-in page is intentionally not exposed as a main navigation item. It can be accessed directly when onboarding a new creator.

The onboarding flow is:

1. Enter the creator invite code.
2. Continue with Discord login.
3. Enter a display name.
4. The system creates the creator profile and matching creator tag.

The regular login button is only for existing authorized creators. If a Discord account is not linked to an active creator profile, the user is signed out and returned to the public dashboard.

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CREATOR_INVITE_CODE=your_bcrypt_hashed_invite_code
```

`CREATOR_INVITE_CODE` should be a bcrypt hash. If the hash contains `$`, escape each `$` in `.env.local`.

Example:

```env
CREATOR_INVITE_CODE=\$2a\$12\$...
```

The service role key is only used by server-side API routes. It must not be exposed with a `NEXT_PUBLIC_` prefix.

Run the development server:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Available Scripts

```bash
npm run dev
```

Starts the development server.

```bash
npm run build
```

Builds the production app.

```bash
npm run start
```

Runs the production build.

```bash
npm run lint
```

Runs ESLint.

## Project Structure

```txt
app/
  page.tsx              # Public dashboard
  create/page.tsx       # Template creation page
  creator/profile/      # Creator profile management
  creator/signin/       # Invite-code and Discord onboarding flow
  creator/tags/         # Creator tag management
  api/creator/          # Server-side creator invite and onboarding APIs
  edit/[id]/page.tsx    # Template configuration page
  editor/[id]/page.tsx  # Public template editor

components/
  TemplateCard.tsx
  FieldRenderer.tsx
  FieldConfigurator.tsx
  LivePreview.tsx
  BBCodeEditor.tsx
  ColorPicker.tsx

lib/
  creator.ts
  routes.ts
  supabase.ts
  template-parser.ts

supabase/
  schema.sql              # Table definitions and core database structure
  migration-creators.sql  # Non-destructive migration for creator support
  policies.sql            # Row-Level Security policies
  functions.sql           # Slug generation, tag indexing, triggers, and helpers
```

## Database Overview

The app uses Supabase to store template data, tags, creator profiles, and creator-managed configuration.

Main tables:

- `creators` stores creator profiles, roles, Discord identity data, active status, and Supabase auth ownership.
- `templates` stores template metadata, blueprint code, field configuration, privacy settings, status, timestamps, and creator ownership.
- `tag_groups` stores groups for organizing tags.
- `tags` stores individual tags, slugs, ownership, and active status.
- `template_tags` connects templates and tags through a many-to-many relationship.

SQL setup files are stored in the `supabase/` folder. For an existing database with real data, use non-destructive migration files instead of running `schema.sql`, because `schema.sql` is intended for fresh database setup.

## Portfolio Notes

ZZZCODE EDITOR is designed as a practical content tool rather than a static showcase page. The main engineering challenge is converting flexible template code into a safe, user-friendly editing interface.

Key implementation highlights:

- custom template parser for variables, groups, blocks, repeats, and BBCode
- dynamic form rendering from stored JSON field configuration
- live preview isolation through an iframe
- Supabase data model for templates, tags, and template-tag relationships
- Discord-based creator authentication with invite-code onboarding
- draft persistence with local storage
- creator-focused configuration flow separate from the public user editor

The project demonstrates frontend state management, dynamic UI generation, database-backed content management, and a real workflow built around RoleplayTH template editing.
