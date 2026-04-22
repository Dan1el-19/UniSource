export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
