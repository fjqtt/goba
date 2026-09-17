import { useRegisterSW } from 'virtual:pwa-register/react';
import { translate, type Language } from '../i18n';

type Props = { safeToUpdate: boolean; language: Language };

export function UpdateNotice({ safeToUpdate, language }: Props) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh && safeToUpdate) {
    return (
      <aside className="update-notice" role="status">
        <p><strong>{translate(language, 'updateReady')}</strong><span>{translate(language, 'attemptSaved')}</span></p>
        <button type="button" onClick={() => void updateServiceWorker(true)}>{translate(language, 'update')}</button>
        <button className="notice-close" type="button" aria-label={translate(language, 'postponeUpdate')} onClick={() => setNeedRefresh(false)}>×</button>
      </aside>
    );
  }
  return null;
}
