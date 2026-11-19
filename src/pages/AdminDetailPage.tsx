import { RegistrationFullscreenModal } from '../components/RegistrationFullscreenModal.tsx';
import type { PanelUserProfile } from '../shared/schema.ts';

interface AdminDetailPageProps {
  registrationId: string;
  user: PanelUserProfile;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}

export function AdminDetailPage({
  registrationId,
  user,
  onNavigate,
}: AdminDetailPageProps) {
  return (
    <RegistrationFullscreenModal
      registrationId={registrationId}
      orderedIds={[registrationId]}
      currentUser={user}
      onClose={() => onNavigate('/admin')}
      onSelectId={(nextId) => onNavigate(`/admin/cadastros/${encodeURIComponent(nextId)}`)}
    />
  );
}
