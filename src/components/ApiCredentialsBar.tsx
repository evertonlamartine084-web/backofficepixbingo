import { useEffect } from 'react';
import { Unlock } from 'lucide-react';

interface Props {
  onCredentials: (creds: { username: string; password: string }) => void;
}

export function ApiCredentialsBar({ onCredentials }: Props) {
  useEffect(() => {
    // Credentials are now auto-loaded from platform_config on the server
    onCredentials({ username: 'auto', password: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-success/10 border border-success/20">
      <Unlock className="w-4 h-4 text-success" />
      <span className="text-sm text-success font-medium">Conectado automaticamente</span>
    </div>
  );
}
