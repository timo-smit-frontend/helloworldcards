export function serializeDraft(value: unknown): string {
  return JSON.stringify(value)
}

export function hasUnsavedChanges(baseline: string | null, current: unknown): boolean {
  return baseline !== null && serializeDraft(current) !== baseline
}

export function unsavedChangesCopy(subject: string) {
  return {
    title: 'Unsaved changes',
    description: `Your edits to ${subject} have not been saved. Leave without saving, or stay and finish them.`,
    stay: 'Keep editing',
    leave: 'Leave without saving'
  }
}
