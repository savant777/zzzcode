# BLOCK upgrade: phases 1–3

Implemented foundations, the Editor workflow, and mixed creator form layout
(global field groups interleaved with BLOCK/GBLOCK).

## Creator settings

- `block_default_count`: non-negative integer, no former cap of 10.
- `block_min_count`: defaults to 0.
- `block_max_count`: null/absent means unlimited; otherwise at least minimum.
- `block_sortable`: controls ordering; absent means enabled. Locked entries keep
  their existing positions in the ordering modal.
- Initial count is normalized into the configured range. Per-entry initial
  values still override shared defaults for new drafts only.
- Settings remain in `fields_config`; no database migration is required.

Editor Add/Duplicate/Remove enforce the limits, including nested blocks.
Restoring a saved draft never truncates or pads its existing arrays to meet new
limits. A draft above maximum can remove entries but cannot add more; a draft
below minimum can add entries but cannot remove more.

## Group syntax

```html
[BLOCK:header]<h1>{{title}}</h1>[/BLOCK:header]
<section>
[GBLOCK:conversation]
[BLOCK:chat]<p>{{message}}</p>[/BLOCK:chat]
[BLOCK:noti]<aside>{{notice}}</aside>[/BLOCK:noti]
[/GBLOCK:conversation]
</section>
```

GBLOCKs are root-level groups of uniquely named sibling BLOCKs, with only
whitespace between members. HTML wrappers remain outside the group. Nested
BLOCKs inside a member remain children of that member. Nested GBLOCKs are not
supported. Invalid group syntax is rejected during creator sync/save.

`block_group_name` and `block_group_member_order` are derived from the blueprint,
independently of creator form order. GBLOCK markers are absent from generated
output. The existing field-driven block discovery still applies: blocks need
their own editable fields to appear in the creator/editor forms.

## Draft compatibility

Existing block arrays retain their names and contents. Entries gain a JSON-safe
`__zzzcode_entry_id`; the root gains `__zzzcode_groups`, mapping group names to
ordered entry IDs. These metadata names are reserved for editor state.

IDs survive restoration and edits. Duplicate assigns new IDs recursively.
Group reconciliation removes stale references, preserves existing order and
appends new entries. Duplicate inserts its ID immediately after its source.
Initial order follows blueprint member order and then each member's array order.
The renderer resolves group order while rendering each entry in its own field
scope. Existing local autosave, backup and history serialize this state.

## Verification

- `node tests/block-defaults.cjs`: initial counts, typed defaults, limits,
  actual root/nested mutation guards, identity, migration, group order/rendering,
  malformed groups and config inheritance.
- `node tests/parser-newlines.cjs`: existing parser regressions.
- `node tests/editor-local-copy.cjs`
- `node tests/editor-backup-client.cjs`
- `node tests/editor-backup-api.cjs`
- `npx tsc --noEmit --pretty false`

## Phase 2 Editor workflow

- `EditorBlocks` shows GBLOCK members as one mixed list in output order, with
  separate Add buttons and limits for each member type. Standalone and nested
  blocks keep their own lists.
- `BlockOrderModal` shows only headers/summaries. Mouse, touch-handle and keyboard
  sensors are enabled; apply commits the order, cancel leaves values unchanged.
  The dialog has native focus containment and Escape handling. Locked entries
  retain their slots. Children cannot move between parents.
- Per-entry collapse and collapse/expand-all store `__zzzcode_collapsed` with
  each entry. Parent collapse preserves child state. Add and Duplicate open the
  new entry; duplicate resets collapse state recursively.
- Copy renders only the selected entry using the existing non-export clipboard
  output format, retaining BBCode and current parent/global variable context.
  Copying a parent includes its children, in their current order.
- Ordering, collapse and values share Draft/backup state. Confirmed reorder has
  a separate undo step from recently typed text. History transitions use a
  synchronous state reference so updater callbacks run once per action.

Additional checks: `node tests/block-editor.cjs` and
`node tests/editor-history.cjs`, plus collapse restoration cases in block-defaults.
The real components were exercised in a temporary local fixture: mouse drag,
mixed order and generated output, apply/cancel, parent/child collapse, Copy success
feedback, keyboard nested reordering, and Undo/Redo. Layout was inspected at desktop
size and 390×844. Actual phone touch gestures and the system clipboard paste path
were not verified; scoped copied strings are covered by automated tests.
The temporary fixture was removed. No live templates or remote database data
were modified, and these changes have not been deployed.

## Phase 3 Form layout

- Creator form ordering uses one compact draggable list of global field groups,
  standalone BLOCKs and whole GBLOCKs. Blocks are not inserted inside field groups.
- `form_section_order` is stored with root field configuration. Nested blocks stay
  inside their parent. Form ordering does not change blueprint or generated output.
- Existing templates without layout metadata retain groups-first order. New
  templates initialize from first occurrence in the blueprint. Saved section order
  survives field synchronization; new sections append and deleted sections disappear.
- Creator settings and Editor inputs both follow the configured section order.
- Drag handles support mouse, touch sensors and keyboard; stable drag context IDs
  avoid server/client hydration mismatches.

`node tests/form-layout.cjs` covers legacy/new ordering, manual changes, JSON
roundtrip, blueprint resync, grouped/nested blocks, scope identity and unchanged
output. A temporary local fixture verified keyboard movement of `sub_class`
after `info`, save/restore, and desktop/390×844 layouts. Physical phone touch
gestures were not tested. The fixture was removed after verification.
