import { useRegisterSW } from 'virtual:pwa-register/react';

type Props = { safeToUpdate: boolean };

export function UpdateNotice({ safeToUpdate }: Props) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh && safeToUpdate) {
    return (
      <aside className="update-notice" role="status">
        <p><strong>Обновление готово</strong><span>Попытка сохранена.</span></p>
        <button type="button" onClick={() => void updateServiceWorker(true)}>Обновить</button>
        <button className="notice-close" type="button" aria-label="Отложить обновление" onClick={() => setNeedRefresh(false)}>×</button>
      </aside>
    );
  }
  return null;
}
