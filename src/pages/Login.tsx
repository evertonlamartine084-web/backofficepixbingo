import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      navigate('/');
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PixBingoBR</h1>
          <p className="text-sm text-muted-foreground mt-1">Bonus Manager</p>
        </div>

        <form onSubmit={handleLogin} className="glass-card p-6 space-y-4">
          <div>
            <Label className="text-foreground">Email</Label>
            <Input
              type="email"
              placeholder="admin@pixbingobr.com"
              defaultValue="admin@pixbingobr.com"
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-foreground">Senha</Label>
            <Input
              type="password"
              placeholder="••••••••"
              defaultValue="admin123"
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <Button type="submit" className="w-full gradient-primary border-0" disabled={loading}>
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Roles: ADMIN · OPERADOR · VISUALIZADOR
          </p>
        </form>
      </div>
    </div>
  );
}
