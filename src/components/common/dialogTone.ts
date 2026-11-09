/**
 * What kind of message a pop-up is, from its title (and message), so it gets the right icon
 * and colour: errors red, success green, warnings and confirmations amber, the rest blue.
 * No React Native imports, so it is unit-tested directly.
 */
export type DialogTone = 'error' | 'success' | 'warning' | 'info';

const ERROR = /\b(fail(ed|ure)?|error|not (sent|saved|created|shared|cancelled|available|allowed|found)|couldn'?t|could not|can'?t|cannot|invalid|wrong|denied|refused|unable|blocked|deactivated|disabled|expired|too many|no internet|offline)\b/i;
const SUCCESS = /\b(sent|created|saved|success(ful(ly)?)?|approved|done|confirmed|copied|submitted|updated|verified|added|completed|cleaned up|arrived|thank you|welcome)\b/i;
const WARNING = /(\?$|\b(warning|careful|caution|check|confirm|are you sure|delete|remove|discard|stop|leave|sign out|log ?out|reject|decline|cancel this|missing|required|weak|needed|pin the|keep cleanstream open|permission)\b)/i;

export function dialogTone(title: string, message?: string): DialogTone {
  const t = (title ?? '').trim();
  if (ERROR.test(t)) return 'error';
  if (WARNING.test(t)) return 'warning';
  if (SUCCESS.test(t)) return 'success';
  const m = (message ?? '').trim();
  if (ERROR.test(m)) return 'error';
  return 'info';
}
