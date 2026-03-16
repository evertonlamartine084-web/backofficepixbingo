import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Zap, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha email e senha');
      return;
    }
    setSubmitting(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      );
      const loginPromise = supabase.auth.signInWithPassword({ email, password });
      const result = await Promise.race([loginPromise, timeoutPromise]) as any;
      if (result?.error) {
        toast.error(result.error.message === 'Invalid login credentials'
          ? 'Email ou senha inválidos'
          : result.error.message);
        logAudit({ action: 'LOGIN_FALHA', resource_type: 'auth', details: { email } });
      } else {
        logAudit({ action: 'LOGIN', resource_type: 'auth', details: { email } });
      }
    } catch (err: any) {
      toast.error(err?.message === 'timeout'
        ? 'Servidor não respondeu. Tente novamente.'
        : 'Erro de conexão. Verifique sua internet.');
    } finally {
      setSubmitting(false);
    }
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
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-foreground">Senha</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <Button type="submit" className="w-full gradient-primary border-0" disabled={submitting}>
            <LogIn className="w-4 h-4 mr-2" />
            {submitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
