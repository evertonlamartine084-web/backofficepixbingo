import { useState } from 'react';
import { Plus, Search, CheckCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { mockBonusRules } from '@/lib/mock-data';

const sampleJson = `[
  {"tipo": "bonus", "descricao": "Bônus campanha março", "valor": 10, "created_at": "2026-03-01T14:30:00"},
  {"tipo": "deposito", "descricao": "PIX recebido", "valor": 50, "created_at": "2026-03-01T10:00:00"},
  {"tipo": "bonus", "descricao": "Crédito promocional", "valor": 10, "created_at": "2026-02-28T09:15:00"}
]`;

export default function BonusRules() {
  const [testJson, setTestJson] = useState(sampleJson);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const runTest = () => {
    try {
      const data = JSON.parse(testJson);
      const rule = mockBonusRules[0];
      const matches = (Array.isArray(data) ? data : [data]).filter((item: Record<string, unknown>) => {
        const fieldMatch = rule.field_candidates.some((f) => {
          const val = String(item[f] || '').toLowerCase();
          return rule.keywords.some((kw) => val.includes(kw.toLowerCase()));
        });
        const valorMatch = rule.valor_fixo ? item.valor === rule.valor_fixo || item.amount === rule.valor_fixo : true;
        return fieldMatch && valorMatch;
      });

      const datas = matches.map((m: Record<string, unknown>) => {
        for (const df of rule.date_fields) {
          if (m[df]) {
            return new Date(m[df] as string).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
          }
        }
        return 'Data não encontrada';
      });

      setTestResult(JSON.stringify({
        qtd_bonus: matches.length,
        datas_bonus: datas,
        ultima_data_bonus: datas[0] || null,
        status: matches.length === 0 ? 'SEM_BONUS' : matches.length === 1 ? 'BONUS_1X' : 'BONUS_2X+',
      }, null, 2));
    } catch (e) {
      setTestResult(`Erro: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Regras de Detecção de Bônus</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure como identificar bônus no JSON de transações</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary border-0">
              <Plus className="w-4 h-4 mr-2" /> Nova Regra
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Nova Regra de Detecção</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-foreground">Nome</Label>
                <Input placeholder="Regra Padrão" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Campos candidatos (separados por vírgula)</Label>
                <Input placeholder="tipo, type, descricao, description" className="mt-1 bg-secondary border-border font-mono text-xs" />
              </div>
              <div>
                <Label className="text-foreground">Palavras-chave (separadas por vírgula)</Label>
                <Input placeholder="bonus, bônus, credito, crédito" className="mt-1 bg-secondary border-border font-mono text-xs" />
              </div>
              <div>
                <Label className="text-foreground">Valor fixo (opcional)</Label>
                <Input type="number" placeholder="10" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label className="text-foreground">Campos de data (separados por vírgula)</Label>
                <Input placeholder="created_at, data_criacao, timestamp" className="mt-1 bg-secondary border-border font-mono text-xs" />
              </div>
              <Button className="w-full gradient-primary border-0" onClick={() => setOpen(false)}>
                Salvar Regra
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active rules */}
      <div className="space-y-3">
        {mockBonusRules.map((rule) => (
          <div key={rule.id} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{rule.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {rule.active ? 'Ativa' : 'Inativa'}
                  </p>
                </div>
              </div>
              <Switch checked={rule.active} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Campos</p>
                <p className="text-foreground font-mono">{rule.field_candidates.join(', ')}</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Keywords</p>
                <p className="text-foreground font-mono">{rule.keywords.join(', ')}</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Valor fixo</p>
                <p className="text-foreground font-mono">{rule.valor_fixo ?? 'Qualquer'}</p>
              </div>
              <div className="bg-secondary/50 rounded p-2">
                <p className="text-muted-foreground">Campos de data</p>
                <p className="text-foreground font-mono">{rule.date_fields.join(', ')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Test section */}
      <div className="glass-card p-5 border-primary/20">
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          Testar Regra de Detecção
        </h2>
        <p className="text-xs text-muted-foreground mb-4">Cole um JSON de transações para testar a regra ativa</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground text-xs">JSON de Entrada</Label>
            <Textarea
              value={testJson}
              onChange={(e) => setTestJson(e.target.value)}
              className="mt-1 bg-secondary border-border font-mono text-xs min-h-[250px]"
            />
          </div>
          <div>
            <Label className="text-foreground text-xs">Resultado</Label>
            <Textarea
              readOnly
              value={testResult || 'Clique em "Testar" para ver o resultado...'}
              className="mt-1 bg-secondary border-border font-mono text-xs min-h-[250px]"
            />
          </div>
        </div>
        <Button className="mt-4 gradient-primary border-0" onClick={runTest}>
          <Play className="w-4 h-4 mr-2" /> Testar Regra
        </Button>
      </div>
    </div>
  );
}
