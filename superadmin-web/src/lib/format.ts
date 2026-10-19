const dateFmt = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export const formatDate = (d: Date | null): string => (d ? dateFmt.format(d) : '—');
export const formatDateTime = (d: Date | null): string => (d ? dateTimeFmt.format(d) : 'just now');

export const relativeTime = (d: Date | null, now: Date = new Date()): string => {
  if (!d) return 'just now';
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(d);
};

export const initials = (first: string, last: string, email: string): string =>
  (`${first[0] ?? ''}${last[0] ?? ''}` || email[0] || '?').toUpperCase();
