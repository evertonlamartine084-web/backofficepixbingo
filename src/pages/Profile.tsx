/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';
import { User, Mail, Calendar, Shield, KeyRound, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';

export default function Profile() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const email = user?.email ?? '';
  const name = email.split('@')[0] ?? '';
  const initials = name.substring(0, 2).toUpperCase();
  const createdAt = user?.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy HH:mm') : '—';
  const lastSignIn = user?.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'dd/MM/yyyy HH:mm') : '—';
  const role = (user as any)?.user_metadata?.role || (user as any)?.app_metadata?.role || 'operador';

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso');
      logAudit({ action: 'SENHA', resource_type: 'auth', details: { email } });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Informações da sua conta</p>
      </div>

      {/* Profile Card */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-5 mb-6">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/15 text-primary text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{name}</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
            <Mail className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground truncate">{email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Role</p>
              <p className="text-sm font-medium text-foreground capitalize">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Conta criada em</p>
              <p className="text-sm font-medium text-foreground">{createdAt}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
            <User className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Último login</p>
              <p className="text-sm font-medium text-foreground">{lastSignIn}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Alterar Senha</h3>
        </div>
        <div className="space-y-3 max-w-sm">
          <div>
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Confirmar senha</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              className="mt-1"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={saving || !newPassword}
            className="gradient-primary border-0"
            size="sm"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Salvar Senha
          </Button>
        </div>
      </div>
    </div>
  );
}
