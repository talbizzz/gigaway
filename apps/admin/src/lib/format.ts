const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '—'
}

export function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—'
}
