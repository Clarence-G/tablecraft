import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LocaleSwitch() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const toggle = () => i18n.changeLanguage(isZh ? 'en' : 'zh');

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 text-xs font-semibold border-2 border-border bg-card rounded-full px-2.5 py-1 hover:border-foreground hover:-translate-y-0.5 transition-all"
      aria-label="Switch language"
    >
      <Languages className="size-3.5" />
      <span>{isZh ? 'EN' : '中文'}</span>
    </button>
  );
}
