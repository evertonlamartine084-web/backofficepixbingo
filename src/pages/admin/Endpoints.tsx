import { useState } from 'react';
import { Plus, Globe, Trash2, Edit, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { mockEndpoints, mockCredentials } from '@/lib/mock-data';
import type { EndpointConfig, HttpMethod, AuthType } from '@/types';

const methodColors: Record<HttpMethod, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-primary/20 text-primary',
  PUT: 'bg-warning/20 text-warning',
  DELETE: 'bg-destructive/20 text-destructive',
};

export default function Endpoints() {
  const [endpoints, setEndpoints] = useState(mockEndpoints);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Endpoints</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure endpoints da API PixBingoBR</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Novo Endpoint
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">Configurar Endpoint</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Nome</Label>
                  <Input placeholder="Ex: Consultar Transações" className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Método</Label>
                  <Select defaultValue="GET">
                    <SelectTrigger className="mt-1 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {(['GET', 'POST', 'PUT', 'DELETE'] as HttpMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-foreground">URL (com placeholders)</Label>
                <Input placeholder="https://pixbingobr.com/usuarios/transacoes?id={{uuid}}" className="mt-1 bg-secondary border-border font-mono text-xs" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Placeholders: {'{{uuid}}'}, {'{{cpf}}'}, {'{{bonus_valor}}'}, {'{{batch_id}}'}, {'{{token}}'}
                </p>
              </div>
              <div>
                <Label className="text-foreground">Descrição</Label>
                <Input placeholder="Finalidade deste endpoint" className="mt-1 bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Autenticação</Label>
                  <Select defaultValue="bearer">
                    <SelectTrigger className="mt-1 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="apikey">API Key</SelectItem>
                      <SelectItem value="cookie">Cookie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Credencial</Label>
                  <Select>
                    <SelectTrigger className="mt-1 bg-secondary border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {mockCredentials.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-foreground">Headers (JSON)</Label>
                <Textarea placeholder='{"Accept": "application/json"}' className="mt-1 bg-secondary border-border font-mono text-xs min-h-[60px]" />
              </div>
              <div>
                <Label className="text-foreground">Body Template (JSON)</Label>
                <Textarea placeholder='{"uuid":"{{uuid}}","valor":{{bonus_valor}}}' className="mt-1 bg-secondary border-border font-mono text-xs min-h-[80px]" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-foreground">Timeout (ms)</Label>
                  <Input type="number" defaultValue={10000} className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Max Retries</Label>
                  <Input type="number" defaultValue={3} className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Backoff (ms)</Label>
                  <Input type="number" defaultValue={1000} className="mt-1 bg-secondary border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Rate Limit (RPS)</Label>
                  <Input type="number" defaultValue={5} className="mt-1 bg-secondary border-border" />
                </div>
                <div>
                  <Label className="text-foreground">Concorrência máx.</Label>
                  <Input type="number" defaultValue={3} className="mt-1 bg-secondary border-border" />
                </div>
              </div>
              <div>
                <Label className="text-foreground">Retry em códigos HTTP</Label>
                <Input placeholder="429, 500, 502, 503" className="mt-1 bg-secondary border-border font-mono" />
              </div>
              <div>
                <Label className="text-foreground">Mapeamento de resposta (JSON)</Label>
                <Textarea placeholder='{"transactions": "$.data.transactions"}' className="mt-1 bg-secondary border-border font-mono text-xs min-h-[60px]" />
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => setOpen(false)}>
                Salvar Endpoint
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {endpoints.map((ep) => (
          <div key={ep.id} className="glass-card overflow-hidden">
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-secondary/20 transition-colors"
              onClick={() => setExpanded(expanded === ep.id ? null : ep.id)}
            >
              <span className={`status-badge ${methodColors[ep.method]}`}>{ep.method}</span>
              <div className="flex-1">
                <p className="font-medium text-foreground">{ep.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{ep.url}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{ep.rate_limit_rps} rps</span>
                <span className="text-xs text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground">{ep.retry_max} retries</span>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Edit className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                {expanded === ep.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {expanded === ep.id && (
              <div className="px-4 pb-4 pt-0 border-t border-border/30 space-y-3 animate-fade-in">
                <p className="text-sm text-muted-foreground">{ep.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="bg-secondary/50 rounded p-2">
                    <p className="text-muted-foreground">Auth</p>
                    <p className="text-foreground font-medium">{ep.auth_type}</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2">
                    <p className="text-muted-foreground">Timeout</p>
                    <p className="text-foreground font-medium">{ep.timeout_ms}ms</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2">
                    <p className="text-muted-foreground">Retry codes</p>
                    <p className="text-foreground font-mono">{ep.retry_codes.join(', ')}</p>
                  </div>
                  <div className="bg-secondary/50 rounded p-2">
                    <p className="text-muted-foreground">Concorrência</p>
                    <p className="text-foreground font-medium">{ep.rate_limit_concurrency}</p>
                  </div>
                </div>
                {ep.body_template && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Body template:</p>
                    <pre className="bg-secondary/50 rounded p-2 text-xs font-mono text-foreground overflow-x-auto">{ep.body_template}</pre>
                  </div>
                )}
                {ep.response_mapping && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Response mapping:</p>
                    <pre className="bg-secondary/50 rounded p-2 text-xs font-mono text-foreground overflow-x-auto">{JSON.stringify(ep.response_mapping, null, 2)}</pre>
                  </div>
                )}
                <Button variant="outline" size="sm" className="border-border">
                  <Play className="w-3 h-3 mr-1" /> Testar Endpoint
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
