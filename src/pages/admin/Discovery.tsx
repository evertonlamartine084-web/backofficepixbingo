import { useState } from 'react';
import { Radar, Globe, KeyRound, Play, Check, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DiscoveredEndpoint {
  method: string;
  url: string;
  description: string;
  status: number | null;
  content_type: string | null;
  auth_type: string;
  sample_response?: string;
}

interface DiscoveryResult {
  success: boolean;
  error?: string;
  base_url: string;
  auth_type: string;
  session_cookies: boolean;
  bearer_token: boolean;
  endpoints: DiscoveredEndpoint[];
}

const methodColors: Record<string, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-primary/20 text-primary',
  PUT: 'bg-warning/20 text-warning',
  DELETE: 'bg-destructive/20 text-destructive',
};

const statusColor = (status: number | null) => {
  if (!status) return 'text-muted-foreground';
  if (status >= 200 && status < 300) return 'text-success';
  if (status === 401 || status === 403) return 'text-warning';
  return 'text-destructive';
};

export default function Discovery() {
  const [siteUrl, setSiteUrl] = useState('https://pixbingobr.com');
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameField, setUsernameField] = useState('email');
  const [passwordField, setPasswordField] = useState('password');
  const [extraPaths, setExtraPaths] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleDiscover = async () => {
    if (!siteUrl || !username || !password) {
      toast.error('Preencha URL, usuário e senha');
      return;
    }

    setLoading(true);
    setResult(null);
    setSelected(new Set());

    try {
      const probePaths = extraPaths
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke('discover-endpoints', {
        body: {
          site_url: siteUrl,
          login_url: loginUrl || undefined,
          username,
          password,
          login_method: 'api',
          username_field: usernameField,
          password_field: passwordField,
          probe_paths: probePaths.length > 0 ? probePaths : undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setResult(data as DiscoveryResult);
        toast.success(`${data.endpoints.length} endpoints descobertos`);
      } else {
        toast.error(data?.error || 'Falha na descoberta');
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (!result) return;
    if (selected.size === result.endpoints.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.endpoints.map((_, i) => i)));
    }
  };

  const importSelected = async () => {
    if (!result || selected.size === 0) return;

    const toImport = result.endpoints.filter((_, i) => selected.has(i));

    for (const ep of toImport) {
      const { error } = await supabase.from('endpoints').insert({
        name: ep.description || ep.url.split('/').pop() || 'Endpoint',
        description: `Auto-descoberto de ${result.base_url}`,
        method: ep.method,
        url: ep.url,
        headers: { Accept: 'application/json' },
        auth_type: ep.auth_type || 'none',
        timeout_ms: 10000,
        retry_max: 3,
        retry_codes: [429, 500, 502, 503],
        retry_backoff_ms: 1000,
        rate_limit_rps: 5,
        rate_limit_concurrency: 3,
      });

      if (error) {
        toast.error(`Erro ao importar ${ep.url}: ${error.message}`);
      }
    }

    toast.success(`${toImport.length} endpoints importados!`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Radar className="w-6 h-6 text-primary" />
          Auto-Discovery de Endpoints
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Insira as credenciais do site para descobrir automaticamente os endpoints disponíveis
        </p>
      </div>

      {/* Login form */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Credenciais do Site</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground">URL do Site</Label>
            <Input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://pixbingobr.com"
              className="mt-1 bg-secondary border-border font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-foreground">URL de Login (opcional)</Label>
            <Input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://pixbingobr.com/api/auth/login"
              className="mt-1 bg-secondary border-border font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Deixe vazio para usar /api/auth/login</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground">Usuário / Email</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin@pixbingobr.com"
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-foreground">Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 bg-secondary border-border"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground">Campo do usuário no form</Label>
            <Input
              value={usernameField}
              onChange={(e) => setUsernameField(e.target.value)}
              placeholder="email"
              className="mt-1 bg-secondary border-border font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-foreground">Campo da senha no form</Label>
            <Input
              value={passwordField}
              onChange={(e) => setPasswordField(e.target.value)}
              placeholder="password"
              className="mt-1 bg-secondary border-border font-mono text-xs"
            />
          </div>
        </div>

        <div>
          <Label className="text-foreground">Paths extras para probing (um por linha)</Label>
          <Textarea
            value={extraPaths}
            onChange={(e) => setExtraPaths(e.target.value)}
            placeholder={"/api/custom/endpoint\n/api/another/route\n/bonus/check"}
            className="mt-1 bg-secondary border-border font-mono text-xs min-h-[80px]"
          />
        </div>

        <Button
          className="gradient-primary border-0 w-full md:w-auto"
          onClick={handleDiscover}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Descobrindo endpoints...
            </>
          ) : (
            <>
              <Radar className="w-4 h-4 mr-2" />
              Iniciar Discovery
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Auth info */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Base:</span>
                <span className="font-mono text-foreground">{result.base_url}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Auth:</span>
                <span className={`status-badge ${result.auth_type === 'bearer' ? 'bg-success/20 text-success' : result.auth_type === 'cookie' ? 'bg-warning/20 text-warning' : 'bg-muted text-muted-foreground'}`}>
                  {result.auth_type}
                </span>
              </div>
              {result.session_cookies && (
                <span className="status-badge bg-warning/20 text-warning">🍪 Cookies capturados</span>
              )}
              {result.bearer_token && (
                <span className="status-badge bg-success/20 text-success">🔑 Token obtido</span>
              )}
            </div>
          </div>

          {/* Endpoints list */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {result.endpoints.length} Endpoints Descobertos
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-border" onClick={selectAll}>
                  <Check className="w-3 h-3 mr-1" />
                  {selected.size === result.endpoints.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </Button>
                <Button
                  size="sm"
                  className="gradient-primary border-0"
                  disabled={selected.size === 0}
                  onClick={importSelected}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Importar {selected.size > 0 ? `(${selected.size})` : ''}
                </Button>
              </div>
            </div>

            {result.endpoints.length === 0 ? (
              <div className="p-8 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Nenhum endpoint encontrado. Tente adicionar paths extras.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="p-3 w-10"></th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Método</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content-Type</th>
                    <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auth</th>
                  </tr>
                </thead>
                <tbody>
                  {result.endpoints.map((ep, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-border/20 hover:bg-secondary/20 transition-colors cursor-pointer ${selected.has(idx) ? 'bg-primary/5' : ''}`}
                      onClick={() => toggleSelect(idx)}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(idx)}
                          onChange={() => toggleSelect(idx)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="p-3">
                        <span className={`status-badge ${methodColors[ep.method] || 'bg-muted text-muted-foreground'}`}>{ep.method}</span>
                      </td>
                      <td className="p-3 font-mono text-xs text-foreground max-w-[400px] truncate">{ep.url}</td>
                      <td className={`p-3 font-mono text-xs font-bold ${statusColor(ep.status)}`}>
                        {ep.status || '—'}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{ep.content_type?.split(';')[0] || '—'}</td>
                      <td className="p-3">
                        <span className="status-badge bg-secondary text-secondary-foreground text-[10px]">{ep.auth_type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Sample responses */}
          {result.endpoints.some((ep) => ep.sample_response) && (
            <div className="glass-card p-5">
              <h3 className="font-semibold text-foreground mb-3">Amostras de Resposta</h3>
              <div className="space-y-3">
                {result.endpoints
                  .filter((ep) => ep.sample_response)
                  .map((ep, idx) => (
                    <div key={idx}>
                      <p className="text-xs text-muted-foreground mb-1">{ep.method} {ep.url}</p>
                      <pre className="bg-secondary/50 rounded p-3 text-xs font-mono text-foreground overflow-x-auto max-h-40">
                        {ep.sample_response}
                      </pre>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
