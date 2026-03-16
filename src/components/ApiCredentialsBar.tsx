import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, Unlock } from 'lucide-react';
import { getSavedCredentials, saveCredentials, clearCredentials } from '@/hooks/use-proxy';

interface Props {
  onCredentials: (creds: { username: string; password: string }) => void;
}

export function ApiCredentialsBar({ onCredentials }: Props) {
  const saved = getSavedCredentials();
  const [username, setUsername] = useState(saved.username);
  const [password, setPassword] = useState(saved.password);
  const [connected, setConnected] = useState(!!saved.username && !!saved.password);

  useEffect(() => {
    if (saved.username && saved.password) {
      onCredentials(saved);
    }
  }, []);

  const handleConnect = () => {
    if (!username || !password) return;
    saveCredentials(username, password);
    setConnected(true);
    onCredentials({ username, password });
  };

  if (connected) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-success/10 border border-success/20">
        <Unlock className="w-4 h-4 text-success" />
        <span className="text-sm text-success font-medium">Conectado como {username}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs text-muted-foreground"
          onClick={() => { clearCredentials(); setConnected(false); }}
        >
          Alterar
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Usuário Admin</Label>
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" className="mt-1 bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Senha</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="mt-1 bg-secondary border-border" />
        </div>
        <Button onClick={handleConnect} className="gradient-primary border-0">
          <Lock className="w-4 h-4 mr-2" /> Conectar
        </Button>
      </div>
    </div>
  );
}
