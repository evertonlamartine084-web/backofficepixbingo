import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Search, User, Coins, Diamond, Star, Target, Award, Swords, TrendingUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(digits[i]) * (t + 1 - i);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== parseInt(digits[t])) return false;
  }
  return true;
}

function formatCPF(cpf: string) {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

interface PlayerWalletRow {
  id: string;
  cpf: string;
  coins: number;
  diamonds: number;
  xp: number;
  total_xp_earned: number;
  level: number;
  created_at: string;
  updated_at: string;
}

interface MissionRef {
  title: string;
  goal: number | null;
  reward_type: string | null;
  reward_amount: number | null;
}

interface MissionProgressRow {
  id: string;
  cpf: string;
  mission_id: string;
  current_value: number;
  completed: boolean;
  created_at: string;
  missions: MissionRef | null;
}

interface AchievementRef {
  title: string;
  goal: number | null;
  reward_type: string | null;
  reward_amount: number | null;
}

interface AchievementProgressRow {
  id: string;
  cpf: string;
  achievement_id: string;
  current_value: number;
  unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
  achievements: AchievementRef | null;
}

interface TournamentRef {
  title: string;
  status: string | null;
  prize_pool: string | number | null;
}

interface TournamentEntryRow {
  id: string;
  cpf: string;
  tournament_id: string;
  score: number;
  rank: number | null;
  created_at: string;
  tournaments: TournamentRef | null;
}

interface ActivityLogRow {
  id: string;
  cpf: string;
  event_type: string | null;
  action: string | null;
  description: string | null;
  details: string | null;
  created_at: string;
}

interface XpHistoryRow {
  id: string;
  cpf: string;
  action: string;
  xp_earned: number;
  description: string | null;
  created_at: string;
}

interface LevelRow {
  id: string;
  level_number: number;
  name: string | null;
  xp_required: number;
  created_at: string;
}

export default function PlayerAnalytics() {
  const [cpfInput, setCpfInput] = useState('');
  const [searchCpf, setSearchCpf] = useState('');

  const handleSearch = () => {
    const clean = cpfInput.replace(/\D/g, '');
    if (!clean || !isValidCPF(clean)) {
      toast.error('CPF inválido');
      return;
    }
    setSearchCpf(clean);
  };

  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['player-wallet', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_wallets')
        .select('*')
        .eq('cpf', searchCpf)
        .maybeSingle();
      if (error) throw error;
      return data as PlayerWalletRow | null;
    },
    enabled: !!searchCpf,
  });

  const { data: missions = [] } = useQuery({
    queryKey: ['player-missions', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_mission_progress')
        .select('*, missions(title, goal, reward_type, reward_amount)')
        .eq('cpf', searchCpf);
      if (error) throw error;
      return (data || []) as MissionProgressRow[];
    },
    enabled: !!searchCpf,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ['player-achievements', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_achievement_progress')
        .select('*, achievements(title, goal, reward_type, reward_amount)')
        .eq('cpf', searchCpf);
      if (error) throw error;
      return (data || []) as AchievementProgressRow[];
    },
    enabled: !!searchCpf,
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ['player-tournaments', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_tournament_entries')
        .select('*, tournaments(title, status, prize_pool)')
        .eq('cpf', searchCpf)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TournamentEntryRow[];
    },
    enabled: !!searchCpf,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['player-activity', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_activity_log')
        .select('*')
        .eq('cpf', searchCpf)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ActivityLogRow[];
    },
    enabled: !!searchCpf,
  });

  const { data: xpHistory = [] } = useQuery({
    queryKey: ['player-xp-history', searchCpf],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('xp_history')
        .select('*')
        .eq('cpf', searchCpf)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as XpHistoryRow[];
    },
    enabled: !!searchCpf,
  });

  const { data: levels = [] } = useQuery({
    queryKey: ['levels-table'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('levels')
        .select('*')
        .order('level_number', { ascending: true });
      if (error) throw error;
      return (data || []) as LevelRow[];
    },
    enabled: !!searchCpf,
  });

  const currentLevel = levels.find(l => l.level_number === (wallet?.level || 1));
  const nextLevel = levels.find(l => l.level_number === (wallet?.level || 1) + 1);
  const xpForNext = nextLevel ? nextLevel.xp_required - (wallet?.total_xp_earned || 0) : 0;
  const xpProgress = nextLevel
    ? Math.min(100, Math.round(((wallet?.total_xp_earned || 0) - (currentLevel?.xp_required || 0)) / ((nextLevel?.xp_required || 1) - (currentLevel?.xp_required || 0)) * 100))
    : 100;

  const completedMissions = missions.filter((m) => m.completed).length;
  const unlockedAchievements = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" /> Analytics de Jogador
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Visualize o progresso completo de gamificação de um jogador</p>
      </div>

      {/* Search */}
      <Card className="glass-card border-border">
        <CardContent className="p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">CPF do Jogador</label>
              <Input
                placeholder="000.000.000-00"
                value={cpfInput}
                onChange={e => setCpfInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="bg-secondary border-border"
              />
            </div>
            <Button onClick={handleSearch} className="gradient-primary border-0">
              <Search className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loadingWallet && searchCpf && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {searchCpf && !loadingWallet && !wallet && (
        <Card className="glass-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Nenhum dado encontrado</p>
            <p className="text-xs mt-1">O jogador com CPF {formatCPF(searchCpf)} ainda não possui carteira de gamificação.</p>
          </CardContent>
        </Card>
      )}

      {wallet && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard icon={Star} label="Nível" value={wallet.level || 1} color="text-yellow-400" />
            <StatCard icon={TrendingUp} label="XP Total" value={(wallet.total_xp_earned || 0).toLocaleString()} color="text-blue-400" />
            <StatCard icon={Coins} label="Moedas" value={(wallet.coins || 0).toLocaleString()} color="text-amber-400" />
            <StatCard icon={Diamond} label="Diamantes" value={(wallet.diamonds || 0).toLocaleString()} color="text-cyan-400" />
            <StatCard icon={Target} label="Missões" value={`${completedMissions}/${missions.length}`} color="text-green-400" />
            <StatCard icon={Award} label="Conquistas" value={`${unlockedAchievements}/${achievements.length}`} color="text-purple-400" />
          </div>

          {/* Level Progress */}
          <Card className="glass-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-semibold">Nível {wallet.level || 1}</span>
                  {currentLevel?.name && <Badge variant="outline" className="text-[10px]">{currentLevel.name}</Badge>}
                </div>
                {nextLevel && (
                  <span className="text-xs text-muted-foreground">
                    {xpForNext > 0 ? `${xpForNext.toLocaleString()} XP para Nível ${nextLevel.level_number}` : 'Máximo atingido'}
                  </span>
                )}
              </div>
              <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, xpProgress)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>{(wallet.total_xp_earned || 0).toLocaleString()} XP</span>
                {nextLevel && <span>{nextLevel.xp_required.toLocaleString()} XP</span>}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="missions" className="space-y-4">
            <TabsList className="bg-secondary">
              <TabsTrigger value="missions">Missões ({missions.length})</TabsTrigger>
              <TabsTrigger value="achievements">Conquistas ({achievements.length})</TabsTrigger>
              <TabsTrigger value="tournaments">Torneios ({tournaments.length})</TabsTrigger>
              <TabsTrigger value="xp">Histórico XP ({xpHistory.length})</TabsTrigger>
              <TabsTrigger value="activity">Atividade ({activity.length})</TabsTrigger>
            </TabsList>

            {/* Missions Tab */}
            <TabsContent value="missions">
              <Card className="glass-card border-border">
                <CardContent className="p-0">
                  {missions.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma missão registrada</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Missão</TableHead>
                          <TableHead className="text-center">Progresso</TableHead>
                          <TableHead className="text-center">Meta</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Recompensa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {missions.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.missions?.title || m.mission_id}</TableCell>
                            <TableCell className="text-center">{m.current_value || 0}</TableCell>
                            <TableCell className="text-center">{m.missions?.goal || '—'}</TableCell>
                            <TableCell className="text-center">
                              {m.completed ? (
                                <Badge className="bg-green-500/15 text-green-400 border-0">Completa</Badge>
                              ) : (
                                <Badge variant="outline">Em progresso</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              {m.missions?.reward_amount ? `${m.missions.reward_amount} ${m.missions.reward_type}` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Achievements Tab */}
            <TabsContent value="achievements">
              <Card className="glass-card border-border">
                <CardContent className="p-0">
                  {achievements.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conquista registrada</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Conquista</TableHead>
                          <TableHead className="text-center">Progresso</TableHead>
                          <TableHead className="text-center">Meta</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Desbloqueado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {achievements.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.achievements?.title || a.achievement_id}</TableCell>
                            <TableCell className="text-center">{a.current_value || 0}</TableCell>
                            <TableCell className="text-center">{a.achievements?.goal || '—'}</TableCell>
                            <TableCell className="text-center">
                              {a.unlocked ? (
                                <Badge className="bg-purple-500/15 text-purple-400 border-0">Desbloqueada</Badge>
                              ) : (
                                <Badge variant="outline">Bloqueada</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              {a.unlocked_at ? new Date(a.unlocked_at).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tournaments Tab */}
            <TabsContent value="tournaments">
              <Card className="glass-card border-border">
                <CardContent className="p-0">
                  {tournaments.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma participação em torneios</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Torneio</TableHead>
                          <TableHead className="text-center">Pontuação</TableHead>
                          <TableHead className="text-center">Posição</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Prêmio Pool</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tournaments.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">{t.tournaments?.title || t.tournament_id}</TableCell>
                            <TableCell className="text-center font-mono">{(t.score || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-center">
                              {t.rank ? (
                                <Badge className={t.rank <= 3 ? 'bg-yellow-500/15 text-yellow-400 border-0' : 'bg-secondary'}>
                                  #{t.rank}
                                </Badge>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{t.tournaments?.status || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-center text-xs">
                              {t.tournaments?.prize_pool ? `R$${Number(t.tournaments.prize_pool).toLocaleString('pt-BR')}` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* XP History Tab */}
            <TabsContent value="xp">
              <Card className="glass-card border-border">
                <CardContent className="p-0">
                  {xpHistory.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhum registro de XP</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ação</TableHead>
                          <TableHead className="text-center">XP Ganho</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {xpHistory.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{h.action}</Badge>
                            </TableCell>
                            <TableCell className="text-center font-mono text-green-400">+{h.xp_earned}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{h.description || '—'}</TableCell>
                            <TableCell className="text-right text-xs">
                              {new Date(h.created_at).toLocaleString('pt-BR')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity">
              <Card className="glass-card border-border">
                <CardContent className="p-0">
                  {activity.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma atividade registrada</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activity.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{a.event_type || a.action}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{a.description || a.details || '—'}</TableCell>
                            <TableCell className="text-right text-xs">
                              {new Date(a.created_at).toLocaleString('pt-BR')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Star; label: string; value: string | number; color: string }) {
  return (
    <Card className="glass-card border-border">
      <CardContent className="p-3 text-center">
        <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
