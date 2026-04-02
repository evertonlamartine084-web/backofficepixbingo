import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/use-audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { UserPlus, Trash2, KeyRound, Shield, Loader2, RefreshCw, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { ALL_PAGES, PageKey } from '@/contexts/AuthContext';

interface ManagedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  role: string;
  allowed_pages: string[] | null;
}

const roleBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  admin: { label: 'Admin', variant: 'default' },
  operador: { label: 'Operador', variant: 'secondary' },
  visualizador: { label: 'Visualizador', variant: 'outline' },
  sem_role: { label: 'Sem role', variant: 'outline' },
};

export default function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operador');
  const [creating, setCreating] = useState(false);

  // Reset password
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Permissions dialog
  const [permOpen, setPermOpen] = useState(false);
  const [permUser, setPermUser] = useState<ManagedUser | null>(null);
  const [permPages, setPermPages] = useState<Set<string>>(new Set());
  const [permAllAccess, setPermAllAccess] = useState(true);
  const [savingPerm, setSavingPerm] = useState(false);

  const callManageUsers = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Sessão expirada — faça login novamente');

    const res = await fetch('/api/manage-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (payload?.error) throw new Error(payload.error);
    return payload;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callManageUsers({ action: 'list' });
      setUsers(data.users || []);
    } catch (err: unknown) {
      toast.error('Erro ao carregar usuários: ' + (err instanceof Error ? err.message : 'Erro'));
    } finally {
      setLoading(false);
    }
  }, [callManageUsers]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async () => {
    if (!newEmail || !newPassword) { toast.error('Preencha todos os campos'); return; }
    setCreating(true);
    try {
      await callManageUsers({ action: 'create', email: newEmail, password: newPassword, role: newRole });
      toast.success('Usuário criado com sucesso');
      logAudit({ action: 'CRIAR', resource_type: 'usuario', resource_name: newEmail, details: { role: newRole } });
      setCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewRole('operador');
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (user: ManagedUser) => {
    if (!confirm(`Tem certeza que deseja excluir ${user.email}?`)) return;
    try {
      await callManageUsers({ action: 'delete', user_id: user.id });
      toast.success('Usuário excluído');
      logAudit({ action: 'EXCLUIR', resource_type: 'usuario', resource_id: user.id, resource_name: user.email });
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await callManageUsers({ action: 'update_role', user_id: userId, role });
      toast.success('Role atualizada');
      const u = users.find(u => u.id === userId);
      logAudit({ action: 'EDITAR', resource_type: 'usuario', resource_id: userId, resource_name: u?.email, details: { field: 'role', value: role } });
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword) { toast.error('Informe a nova senha'); return; }
    setResetting(true);
    try {
      await callManageUsers({ action: 'reset_password', user_id: resetUserId, new_password: resetPassword });
      toast.success('Senha resetada com sucesso');
      logAudit({ action: 'SENHA', resource_type: 'usuario', resource_id: resetUserId, resource_name: resetEmail });
      setResetOpen(false);
      setResetPassword('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setResetting(false);
    }
  };

  const openPermissions = (user: ManagedUser) => {
    setPermUser(user);
    if (user.role === 'admin' || !user.allowed_pages) {
      setPermAllAccess(true);
      setPermPages(new Set(ALL_PAGES.map(p => p.key)));
    } else {
      setPermAllAccess(false);
      setPermPages(new Set(user.allowed_pages));
    }
    setPermOpen(true);
  };

  const togglePage = (key: string) => {
    setPermPages(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllAccess = (checked: boolean) => {
    setPermAllAccess(checked);
    if (checked) {
      setPermPages(new Set(ALL_PAGES.map(p => p.key)));
    }
  };

  const handleSavePermissions = async () => {
    if (!permUser) return;
    setSavingPerm(true);
    try {
      const allowed_pages = permAllAccess ? null : Array.from(permPages);
      await callManageUsers({ action: 'update_permissions', user_id: permUser.id, allowed_pages });
      toast.success('Permissões atualizadas');
      logAudit({ action: 'EDITAR', resource_type: 'usuario', resource_id: permUser.id, resource_name: permUser.email, details: { field: 'permissions', allowed_pages: permAllAccess ? 'all' : Array.from(permPages) } });
      setPermOpen(false);
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSavingPerm(false);
    }
  };

  const getPermissionSummary = (user: ManagedUser) => {
    if (user.role === 'admin') return 'Acesso total';
    if (!user.allowed_pages) return 'Todas as páginas';
    if (user.allowed_pages.length === 0) return 'Nenhum acesso';
    return `${user.allowed_pages.length} de ${ALL_PAGES.length} páginas`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie, edite e gerencie usuários e permissões do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0" size="sm">
                <UserPlus className="w-4 h-4 mr-2" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Email</Label>
                  <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="usuario@email.com" className="mt-1" />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="mt-1" />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="operador">Operador</SelectItem>
                      <SelectItem value="visualizador">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={handleCreate} disabled={creating} className="gradient-primary border-0">
                  {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : users.map(user => {
              const rb = roleBadge[user.role] || roleBadge.sem_role;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Select defaultValue={user.role} onValueChange={val => handleRoleChange(user.id, val)}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <Badge variant={rb.variant} className="text-xs">{rb.label}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="operador">Operador</SelectItem>
                        <SelectItem value="visualizador">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => openPermissions(user)}
                    >
                      <Lock className="w-3 h-3" />
                      {getPermissionSummary(user)}
                    </Button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(user.created_at), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'dd/MM/yyyy HH:mm') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Resetar senha"
                        onClick={() => {
                          setResetUserId(user.id);
                          setResetEmail(user.email);
                          setResetPassword('');
                          setResetOpen(true);
                        }}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Excluir usuário"
                        onClick={() => handleDelete(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetar Senha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Definir nova senha para <strong>{resetEmail}</strong></p>
          <div>
            <Label>Nova Senha</Label>
            <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="mt-1" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleResetPassword} disabled={resetting} className="gradient-primary border-0">
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Resetar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permOpen} onOpenChange={setPermOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Permissões de Acesso
            </DialogTitle>
          </DialogHeader>
          {permUser && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configurar páginas acessíveis para <strong>{permUser.email}</strong>
              </p>

              {permUser.role === 'admin' ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                  <Shield className="w-8 h-8 mx-auto text-primary mb-2" />
                  <p className="text-sm font-medium">Administradores têm acesso total</p>
                  <p className="text-xs text-muted-foreground mt-1">Mude a role para restringir o acesso</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                    <Checkbox
                      id="all-access"
                      checked={permAllAccess}
                      onCheckedChange={(checked) => toggleAllAccess(!!checked)}
                    />
                    <Label htmlFor="all-access" className="font-medium cursor-pointer">
                      Acesso total (todas as páginas)
                    </Label>
                  </div>

                  {!permAllAccess && (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 pb-1">
                        Selecione as páginas
                      </p>
                      {ALL_PAGES.map(page => (
                        <div
                          key={page.key}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <Checkbox
                            id={`perm-${page.key}`}
                            checked={permPages.has(page.key)}
                            onCheckedChange={() => togglePage(page.key)}
                          />
                          <Label htmlFor={`perm-${page.key}`} className="cursor-pointer flex-1 text-sm">
                            {page.label}
                          </Label>
                          <span className="text-[10px] text-muted-foreground font-mono">{page.path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            {permUser?.role !== 'admin' && (
              <Button onClick={handleSavePermissions} disabled={savingPerm} className="gradient-primary border-0">
                {savingPerm ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                Salvar Permissões
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
