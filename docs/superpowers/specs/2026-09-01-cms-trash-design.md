# CMS trash

Date: 2026-09-01

## Problem

Pages can be deleted from the editor, but it is a hard delete with no confirm and no way back. Products have no delete on the editor. Events and FAQs only have an unconfirmed Delete on the list. Accidental deletes are permanent.

## Goal

Pages, products, events, and FAQs share one flow: delete from the **detail** editor, confirm, move to that category’s trash, recover or hard-delete from trash.

Out of scope: media, nav links, settings, auto-purge, emptying all trash at once.

## Data

Add nullable `deleted_at TEXT` to `pages`, `products`, `events`, and `faqs` (ISO timestamp when trashed).

| Action | Effect |
| --- | --- |
| Delete from detail | Set `deleted_at` |
| Restore | Clear `deleted_at` |
| Delete forever | `DELETE` the row |

Slugs and page paths stay unique while the row is in trash, so restore always works. Hard delete frees them. `nextProductSlug` and page-path checks must treat trashed slugs/paths as taken.

## Visibility

| Surface | Rows |
| --- | --- |
| Public site, sitemap, admin lists, admin GET-by-id | `deleted_at` empty |
| Category trash | `deleted_at` set |
| Dashboard ledger | Active rows, plus **sold** products still in trash |

Trashing an unsold product removes it from the ledger. Trashing a sold product does not wipe revenue until hard delete. A trashed product slug or page path 404s on the public site.

FAQ/event IDs on page blocks that point at trashed rows simply do not resolve (lists already exclude them).

## API

`DELETE /api/admin/{pages\|products\|events\|faqs}/{id}` becomes soft delete. Already-trashed is a no-op 200.

New, same four collections:

- `GET /api/admin/{collection}/trash`
- `POST /api/admin/{collection}/{id}/restore` — 404 if missing or not trashed
- `DELETE /api/admin/{collection}/{id}/permanent` — 404 if missing or not trashed (cannot skip trash)

Admin GET of a trashed id returns 404. Edit happens on live rows; recover happens in trash.

## Admin UI

Detail editors (page, product, event, FAQ) get **Delete {singular}** next to Save, only when the item already exists. `cursor-pointer` on that control (including today’s Delete page button). Confirm copy: “Move this {singular} to trash?” On confirm, soft-delete and return to the category list.

Remove the Events/FAQs list-row Delete. Every category deletes from detail only.

Each list header has a **Trash** link beside New (not a new sidebar item). Routes: `/{pages\|products\|events\|faqs}/trash`, registered **before** `/:id`.

Trash is a table for that category: **Restore** (no confirm) and **Delete forever** (confirm, then hard delete). Empty trash is an empty table, not an error.

Confirmations are a small in-app dialog (same family as the media modal), not `window.confirm()`.

## Tests

- Soft delete hides the row from public payload and admin list; it appears in that collection’s trash.
- Restore brings it back to the list and public payload.
- Permanent delete removes it; GET trash no longer includes it.
- Permanent or restore on a live (not trashed) id is 404.
- Product slug / page path stays reserved while trashed; a new item cannot reuse it until hard delete.
- Dashboard ledger still includes a trashed **sold** product and excludes a trashed unsold one.
- Public product-by-slug and page-by-path 404 for trashed rows.

## Non-goals

- Do not trash media.
- Do not add trash to the sidebar.
- Do not auto-empty trash after a delay.
- Do not confirm Restore.
