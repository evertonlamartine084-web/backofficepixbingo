import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Target, Gift, Play, Square, BarChart3, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { logAudit } from '@/hooks/use-audit';

interface MiniGame {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
}

interface PlayerResult {
  id: string;
  cpf: string;
  prizes_caught: number;
  time_taken_ms: number;
  reward_type: string | null;
  reward_value: number;
  played_at: string;
}

interface PrizeDropConfig {
  duration_seconds: number;
  drop_interval_ms: number;
  speed: 'slow' | 'normal' | 'fast';
  catch_zone_width: number;
  max_catches_per_session: number;
}

const DEFAULT_CONFIG: PrizeDropConfig = {
  duration_seconds: 30,
  drop_interval_ms: 800,
  speed: 'normal',
  catch_zone_width: 120,
  max_catches_per_session: 10,
};

const SPEED_OPTIONS = [
  { value: 'slow', label: 'Lento' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Rápido' },
];

export default function PrizeDropManager() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gameId = searchParams.get('gameId') || '';

  const [previewRunning, setPreviewRunning] = useState(false);

  // Fetch game info
  const { data: game } = useQuery({
    queryKey: ['mini_game', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mini_games' as 'segments')
        .select('id, name, type, config')
        .eq('id', gameId)
        .single();
      if (error) throw error;
      return data as unknown as MiniGame;
    },
  });

  const config: PrizeDropConfig = {
    ...DEFAULT_CONFIG,
    ...(game?.config as Record<string, unknown> || {}),
  } as PrizeDropConfig;

  // Fetch results
  const { data: results = [] } = useQuery({
    queryKey: ['prize_drop_results', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_mini_game_results' as 'segments')
        .select('*')
        .eq('game_id', gameId)
        .eq('game_type', 'prize_drop_live')
        .order('played_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as PlayerResult[];
    },
  });

  // Stats
  const avgCaught = results.length > 0
    ? (results.reduce((s, r) => s + (r.prizes_caught || 0), 0) / results.length).toFixed(1)
    : '0';
  const avgTime = results.length > 0
    ? ((results.reduce((s, r) => s + (r.time_taken_ms || 0), 0) / results.length) / 1000).toFixed(1)
    : '0';

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<PrizeDropConfig>) => {
      const existingConfig = (game?.config || {}) as Record<string, unknown>;
      const merged = { ...existingConfig, ...newConfig };
      const { error } = await supabase
        .from('mini_games' as 'segments')
        .update({ config: merged } as Record<string, unknown>)
        .eq('id', gameId);
      if (error) throw error;
      await logAudit({
        action: 'EDITAR',
        resource_type: 'mini_game',
        resource_name: game?.name || '',
        details: newConfig as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success('Configuração salva!');
      qc.invalidateQueries({ queryKey: ['mini_game', gameId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro'),
  });

  if (!gameId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <p>Nenhum gameId fornecido. Volte para Mini Games.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/gamification/mini-games')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" /> Gerenciar Prize Drop Live
            </h1>
            {game && <p className="text-sm text-muted-foreground mt-0.5">{game.name}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Section */}
        <div className="space-y-4">
          <Card className="glass-card border-border">
            <CardContent className="p-4 space-y-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Configurações do Jogo
              </h3>

              <div>
                <Label className="text-xs">Duração (segundos)</Label>
                <Input
                  type="number" min="10" max="120"
                  className="bg-secondary border-border"
                  value={config.duration_seconds}
                  onChange={e => updateConfigMutation.mutate({ duration_seconds: parseInt(e.target.value) || 30 })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Quanto tempo o jogo dura</p>
              </div>

              <div>
                <Label className="text-xs">Intervalo de queda (ms)</Label>
                <Input
                  type="number" min="200" max="3000" step="100"
                  className="bg-secondary border-border"
                  value={config.drop_interval_ms}
                  onChange={e => updateConfigMutation.mutate({ drop_interval_ms: parseInt(e.target.value) || 800 })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Intervalo entre cada prêmio caindo</p>
              </div>

              <div>
                <Label className="text-xs">Velocidade</Label>
                <Select
                  value={config.speed}
                  onValueChange={v => updateConfigMutation.mutate({ speed: v as PrizeDropConfig['speed'] })}
                >
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPEED_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Largura da zona de captura: {config.catch_zone_width}px</Label>
                <Slider
                  min={50}
                  max={200}
                  step={10}
                  value={[config.catch_zone_width]}
                  onValueChange={([v]) => updateConfigMutation.mutate({ catch_zone_width: v })}
                  className="mt-2"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Tamanho da zona onde o jogador captura prêmios</p>
              </div>

              <div>
                <Label className="text-xs">Máximo de capturas por sessão</Label>
                <Input
                  type="number" min="1" max="50"
                  className="bg-secondary border-border"
                  value={config.max_catches_per_session}
                  onChange={e => updateConfigMutation.mutate({ max_catches_per_session: parseInt(e.target.value) || 10 })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Prize Pool Link */}
          <Card className="glass-card border-border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Pool de Prêmios
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Os prêmios deste jogo são gerenciados na aba de Prêmios do Mini Games.
                Selecione este jogo na lista e configure os prêmios que cairão.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/gamification/mini-games">
                  <Gift className="w-3.5 h-3.5 mr-1" /> Gerenciar Prêmios <ExternalLink className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Preview Section */}
        <div className="space-y-4">
          <Card className="glass-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Preview
                </h3>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPreviewRunning(!previewRunning)}
                >
                  {previewRunning
                    ? <><Square className="w-3.5 h-3.5 mr-1" /> Parar</>
                    : <><Play className="w-3.5 h-3.5 mr-1" /> Iniciar</>
                  }
                </Button>
              </div>
              <PrizeDropPreview
                running={previewRunning}
                config={config}
                onStop={() => setPreviewRunning(false)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{results.length}</div>
            <div className="text-xs text-muted-foreground">Total de Jogadas</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{avgCaught}</div>
            <div className="text-xs text-muted-foreground">Média de Capturas</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-border">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{avgTime}s</div>
            <div className="text-xs text-muted-foreground">Tempo Médio</div>
          </CardContent>
        </Card>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Resultados Recentes
          </h3>
          <Card className="glass-card border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs text-right">Capturas</TableHead>
                  <TableHead className="text-xs text-right">Tempo</TableHead>
                  <TableHead className="text-xs">Recompensa</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="text-sm font-mono">{r.cpf}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{r.prizes_caught}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {r.time_taken_ms > 0 ? `${(r.time_taken_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.reward_type ? `${r.reward_type}: ${r.reward_value}` : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.played_at).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

// --- Preview Component ---

function PrizeDropPreview({
  running,
  config,
  onStop,
}: {
  running: boolean;
  config: PrizeDropConfig;
  onStop: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drops, setDrops] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  const [catchX, setCatchX] = useState(50);
  const [caught, setCaught] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.duration_seconds);
  const nextIdRef = useRef(0);

  const speedMultiplier = config.speed === 'slow' ? 0.5 : config.speed === 'fast' ? 2 : 1;

  useEffect(() => {
    if (!running) {
      setDrops([]);
      setCaught(0);
      setTimeLeft(config.duration_seconds);
      return;
    }

    // Timer
    const timerInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onStop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Drop interval
    const dropInterval = setInterval(() => {
      const id = nextIdRef.current++;
      const x = Math.random() * 90 + 5; // 5-95%
      const colors = ['#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      setDrops(prev => [...prev, { id, x, y: 0, color }]);
    }, config.drop_interval_ms);

    // Animation
    const animFrame = setInterval(() => {
      setDrops(prev => {
        return prev
          .map(d => ({ ...d, y: d.y + (1.5 * speedMultiplier) }))
          .filter(d => d.y < 100);
      });
    }, 30);

    return () => {
      clearInterval(timerInterval);
      clearInterval(dropInterval);
      clearInterval(animFrame);
    };
  }, [running, config.drop_interval_ms, config.duration_seconds, speedMultiplier, onStop]);

  // Check catches
  useEffect(() => {
    if (!running) return;
    const catchZoneWidth = (config.catch_zone_width / 400) * 100; // scale to container %
    setDrops(prev => {
      let newCaught = 0;
      const remaining = prev.filter(d => {
        if (d.y >= 85 && d.y <= 95) {
          const inZone = Math.abs(d.x - catchX) < catchZoneWidth / 2;
          if (inZone) {
            newCaught++;
            return false;
          }
        }
        return true;
      });
      if (newCaught > 0) {
        setCaught(c => Math.min(c + newCaught, config.max_catches_per_session));
      }
      return remaining;
    });
  }, [drops, catchX, running, config.catch_zone_width, config.max_catches_per_session]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setCatchX(Math.max(5, Math.min(95, x)));
  };

  const catchZoneWidthPercent = (config.catch_zone_width / 400) * 100;

  return (
    <div
      ref={containerRef}
      className="relative bg-secondary/50 rounded-lg overflow-hidden cursor-crosshair"
      style={{ height: 300 }}
      onMouseMove={handleMouseMove}
    >
      {/* Timer & Score */}
      <div className="absolute top-2 left-2 right-2 flex justify-between z-10">
        <Badge variant="outline" className="text-xs">{timeLeft}s</Badge>
        <Badge variant="outline" className="text-xs">Capturas: {caught}/{config.max_catches_per_session}</Badge>
      </div>

      {/* Falling drops */}
      {drops.map(d => (
        <div
          key={d.id}
          className="absolute w-4 h-4 rounded-full transition-none"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            backgroundColor: d.color,
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 8px ${d.color}60`,
          }}
        />
      ))}

      {/* Catch zone */}
      <div
        className="absolute bottom-2 rounded-lg border-2 border-primary bg-primary/20"
        style={{
          left: `${catchX - catchZoneWidthPercent / 2}%`,
          width: `${catchZoneWidthPercent}%`,
          height: 24,
          transition: 'left 0.05s',
        }}
      />

      {/* Not running overlay */}
      {!running && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/70">
          <p className="text-sm text-muted-foreground">Clique em "Iniciar" para ver o preview</p>
        </div>
      )}
    </div>
  );
}
