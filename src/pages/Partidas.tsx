import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSavedCredentials } from '@/hooks/use-proxy';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Clock, Trophy, Ticket, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

interface Partida {
  id_partida: string;
  data_partida: string;
  hora_partida: string;
  premio_quadra: string;
  premio_quina: string;
  premio_cartela: string;
  valor_dia: string;
  tipo_partida: string;
  ativo: string;
  processado: string;
  resultado: string;
  resultado_sem_premio: string;
  doacoes: string;
  data_partida_f: string;
  hora_partida_f: string;
  acumulado: string;
  status: string;
  premio_quadra_pago: string | number;
  premio_quina_pago: string | number;
  premio_cartela_pago: string | number;
}

function parseValor(v: string | number): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatusInfo(p: Partida) {
  const now = new Date();
  // Parse date "dd/mm/yyyy" and time "HH:mm:ss"
  const [d, m, y] = p.data_partida.split('/');
  const partidaDate = new Date(`${y}-${m}-${d}T${p.hora_partida}`);

  if (p.processado === '1') return { label: 'Finalizada', variant: 'secondary' as const, color: 'text-muted-foreground' };
  if (partidaDate <= now) return { label: 'Em andamento', variant: 'default' as const, color: 'text-warning' };
  return { label: 'Agendada', variant: 'outline' as const, color: 'text-success' };
}

export default function Partidas() {
  const creds = getSavedCredentials();

  const { data: partidas, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['partidas'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pixbingo-proxy', {
        body: {
          action: 'list_partidas',
          site_url: 'https://pixbingobr.concurso.club',
          login_url: 'https://pixbingobr.concurso.club/login',
          username: creds.username,
          password: creds.password,
        },
      });
      if (error) throw error;
      const items: Partida[] = data?.data?.aaData || data?.data?.data || [];
      // Sort by date+time desc
      return items.sort((a, b) => {
        const [ad, am, ay] = a.data_partida.split('/');
        const [bd, bm, by] = b.data_partida.split('/');
        const dateA = new Date(`${ay}-${am}-${ad}T${a.hora_partida}`);
        const dateB = new Date(`${by}-${bm}-${bd}T${b.hora_partida}`);
        return dateB.getTime() - dateA.getTime();
      });
    },
    refetchInterval: 60000,
  });

  // Summary stats
  const total = partidas?.length || 0;
  const ativas = partidas?.filter(p => p.ativo === '1').length || 0;
  const totalDoacoes = partidas?.reduce((sum, p) => sum + parseValor(p.doacoes), 0) || 0;
  const uniqueTypes = new Set(partidas?.map(p => p.tipo_partida) || []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Partidas</h1>
          <p className="text-sm text-muted-foreground">Rodadas ativas e agendadas da plataforma</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Partidas</p>
              <p className="text-xl font-bold text-foreground">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ativas</p>
              <p className="text-xl font-bold text-foreground">{ativas}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tipos</p>
              <p className="text-xl font-bold text-foreground">{uniqueTypes.size}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Arrecadação Total</p>
              <p className="text-xl font-bold text-foreground">{formatBRL(totalDoacoes)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rodadas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !partidas?.length ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma partida encontrada</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-3 px-3 font-medium">ID</th>
                    <th className="text-left py-3 px-3 font-medium">Data/Hora</th>
                    <th className="text-left py-3 px-3 font-medium min-w-[170px]">Tipo</th>
                    <th className="text-right py-3 px-3 font-medium">Cartela</th>
                    <th className="text-right py-3 px-3 font-medium">Quadra</th>
                    <th className="text-right py-3 px-3 font-medium">Quina</th>
                    <th className="text-right py-3 px-3 font-medium">Cheia</th>
                    <th className="text-right py-3 px-3 font-medium">Arrecadação</th>
                    <th className="text-right py-3 px-3 font-medium">Resultado</th>
                    <th className="text-center py-3 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map((p) => {
                    const statusInfo = getStatusInfo(p);
                    const resultado = parseValor(p.resultado);

                    return (
                      <tr key={p.id_partida} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3 font-mono text-xs text-muted-foreground">
                          #{p.id_partida}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-medium text-foreground text-xs">{p.data_partida_f}</div>
                          <div className="text-muted-foreground text-xs">{p.hora_partida_f}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap min-w-[170px]">
                          <Badge variant="outline" className="text-xs font-normal whitespace-nowrap px-3">
                            {String(p.tipo_partida || '').replace(/\s+/g, ' ').trim()}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          {formatBRL(parseValor(p.valor_dia))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          {formatBRL(parseValor(p.premio_quadra))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          {formatBRL(parseValor(p.premio_quina))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          {formatBRL(parseValor(p.premio_cartela))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          {formatBRL(parseValor(p.doacoes))}
                        </td>
                        <td className={`py-3 px-3 text-right font-mono text-xs font-medium ${resultado < 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatBRL(resultado)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant={statusInfo.variant} className="text-xs">
                            {statusInfo.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
