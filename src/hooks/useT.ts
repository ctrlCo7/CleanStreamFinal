import { useCallback } from 'react';
import { useAppSelector } from '../store/hooks';
import { StringKey, translate, translateAiText } from '../i18n/strings';

/** Translation for the resident screens: t('key', { vars }) and ai(englishSentence). */
export function useT() {
  const lang = useAppSelector((s) => s.language.lang);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  const ai = useCallback((english: string) => translateAiText(lang, english), [lang]);
  return { t, ai, lang };
}
