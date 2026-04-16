import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LocaleSwitch() {
  const { i18n } = useTranslation();
  const toggle = () => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1 text-xs font-semibold border-2 border-border bg-card rounded-full px-2.5 py-1 hover:border-foreground transition-colors"
      aria-label="Switch language"
    >
      <Globe className="size-3.5" />
      {i18n.language === 'zh' ? 'EN' : '中文'}
    </button>
  );
}
