import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ComingSoonProps {
  onBack: () => void;
}

/**
 * Placeholder page for the /games and /rooms view-all routes.
 * Replaced in Stage 6 by real listing pages.
 */
export function ComingSoon({ onBack }: ComingSoonProps) {
  const { t } = useTranslation('common');
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-card border-thick border-foreground rounded-[16px] shadow-card p-6 max-w-sm w-full text-center">
        <h2 className="text-xl font-bold mb-2">{t('lobby.comingSoon')}</h2>
        <p className="text-sm text-muted-foreground mb-4">Stage 6</p>
        <Button
          onClick={onBack}
          className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[8px] px-3 font-semibold text-sm h-9 gap-1"
          size="sm"
        >
          <ArrowLeft className="size-3.5" />
          {t('lobby.backToLobby')}
        </Button>
      </div>
    </div>
  );
}
