import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, Code2, Eye, Target, Award, Swords, RotateCw, Gamepad2, ShoppingBag, Star, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nehmmvtpagncmldivnxn.supabase.co';
const WIDGET_SCRIPT_URL = `${SUPABASE_URL}/functions/v1/gamification-widget`;

interface WidgetSections {
  missions: boolean;
  achievements: boolean;
  tournaments: boolean;
  wheel: boolean;
  mini_games: boolean;
  store: boolean;
  levels: boolean;
  referrals: boolean;
}

const DEFAULT_SECTIONS: WidgetSections = {
  missions: true,
  achievements: true,
  tournaments: true,
  wheel: true,
  mini_games: true,
  store: true,
  levels: true,
  referrals: true,
};

const SECTION_META: { key: keyof WidgetSections; label: string; icon: typeof Target; description: string }[] = [
  { key: 'missions', label: 'Missões', icon: Target, description: 'Missões diárias e semanais' },
  { key: 'achievements', label: 'Conquistas', icon: Award, description: 'Badges e conquistas desbloqueáveis' },
  { key: 'tournaments', label: 'Torneios', icon: Swords, description: 'Rankings e competições' },
  { key: 'wheel', label: 'Roleta Diária', icon: RotateCw, description: 'Giros gratuitos e prêmios' },
  { key: 'mini_games', label: 'Mini Games', icon: Gamepad2, description: 'Raspadinha, baús e jogos extras' },
  { key: 'store', label: 'Loja', icon: ShoppingBag, description: 'Itens compráveis com moedas' },
  { key: 'levels', label: 'Níveis', icon: Star, description: 'Sistema de progressão e XP' },
  { key: 'referrals', label: 'Indique e Ganhe', icon: UserPlus, description: 'Programa de indicação' },
];

export default function WidgetPreview() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState('_all');

  const { data: segments = [] } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('id, name').order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  const { data: platformConfig } = useQuery({
    queryKey: ['platform_config_widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_config')
        .select('id, widget_sections')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; widget_sections: WidgetSections | null } | null;
    },
  });

  const [sections, setSections] = useState<WidgetSections>(DEFAULT_SECTIONS);

  useEffect(() => {
    if (platformConfig?.widget_sections) {
      setSections({ ...DEFAULT_SECTIONS, ...platformConfig.widget_sections });
    }
  }, [platformConfig]);

  const saveSectionsMutation = useMutation({
    mutationFn: async (newSections: WidgetSections) => {
      if (!platformConfig?.id) {
        toast.error('Configure a plataforma primeiro em Config Plataforma');
        throw new Error('No platform config');
      }
      const { error } = await supabase
        .from('platform_config')
        .update({ widget_sections: newSections } as Record<string, unknown>)
        .eq('id', platformConfig.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Seções do widget atualizadas!');
      queryClient.invalidateQueries({ queryKey: ['platform_config_widget'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSection = (key: keyof WidgetSections) => {
    const updated = { ...sections, [key]: !sections[key] };
    setSections(updated);
    saveSectionsMutation.mutate(updated);
  };

  const segmentParam = selectedSegment !== '_all' ? ` data-segment="${selectedSegment}"` : '';
  const segmentName = selectedSegment !== '_all' ? segments.find(s => s.id === selectedSegment)?.name : null;

  const embedCodeGTM = `<!-- PixBingoBR Gamification Widget${segmentName ? ` — Segmento: ${segmentName}` : ''} -->
<script src="${window.location.origin}/widget/gamification.js"${segmentParam} data-require-login="false"></script>`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Code2 className="w-6 h-6 text-primary" /> Widget Embedável
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Código para incorporar o painel de gamificação no site</p>
        </div>
        <Button
          onClick={() => setPreviewOpen(!previewOpen)}
          variant={previewOpen ? 'default' : 'outline'}
          className={previewOpen ? 'gradient-primary border-0' : 'border-border'}
        >
          <Eye className="w-4 h-4 mr-2" /> {previewOpen ? 'Fechar Preview' : 'Ver Preview'}
        </Button>
      </div>

      {/* Segment selector */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold">Segmento alvo do widget</Label>
          <Select value={selectedSegment} onValueChange={setSelectedSegment}>
            <SelectTrigger className="bg-secondary border-border w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os jogadores (sem filtro)</SelectItem>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {selectedSegment === '_all'
              ? 'O widget mostrará todas as missões, conquistas, torneios e prêmios ativos.'
              : `O widget filtrará apenas conteúdo direcionado ao segmento "${segmentName}" ou sem segmento definido.`}
          </p>
        </CardContent>
      </Card>

      {/* Section toggles */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-sm font-semibold">Seções do Widget</Label>
            <p className="text-[10px] text-muted-foreground mt-1">
              Ative ou desative cada seção do painel de gamificação. As seções desativadas não aparecerão para os jogadores.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SECTION_META.map(({ key, label, icon: Icon, description }) => (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  sections[key]
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-secondary/30 border-border opacity-60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${sections[key] ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{description}</p>
                </div>
                <Switch
                  checked={sections[key]}
                  onCheckedChange={() => toggleSection(key)}
                  disabled={saveSectionsMutation.isPending}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {Object.values(sections).filter(Boolean).length} de {SECTION_META.length} seções ativas
          </p>
        </CardContent>
      </Card>

      {/* Embed code - GTM only */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Código GTM — Tag HTML Personalizada</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(embedCodeGTM, 'gtm')}
              className="text-xs"
            >
              {copied === 'gtm' ? <Check className="w-3.5 h-3.5 mr-1 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              Copiar
            </Button>
          </div>
          <pre className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
            {embedCodeGTM}
          </pre>
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground">Como configurar no GTM:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Acesse o <span className="text-foreground font-medium">Google Tag Manager</span></li>
              <li>Crie uma nova <span className="text-foreground font-medium">Tag</span> → tipo <span className="text-foreground font-medium">HTML Personalizado</span></li>
              <li>Cole o código acima</li>
              <li>Em Acionamento (Trigger), selecione <span className="text-foreground font-medium">All Pages</span></li>
              <li>Salve e <span className="text-foreground font-medium">Publique</span> o contêiner</li>
            </ol>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5 mt-2">
            <p className="font-semibold text-foreground">Atributos disponíveis:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="text-foreground bg-secondary px-1 rounded">data-require-login="true"</code> — Widget só aparece se <code>data-player</code> ou <code>data-auth-selector</code> detectar login. Sem este atributo, o widget aparece para todos</li>
              <li><code className="text-foreground bg-secondary px-1 rounded">data-auth-selector=".user-menu"</code> — Seletor CSS customizado para detectar login (ex: elemento que só existe quando logado)</li>
              <li><code className="text-foreground bg-secondary px-1 rounded">data-segment="UUID"</code> — Filtra conteúdo por segmento</li>
              <li><code className="text-foreground bg-secondary px-1 rounded">data-player="CPF"</code> — CPF do jogador logado (mostra saldo de moedas, XP e nível). Use variável do GTM para preencher dinamicamente</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Como funciona</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">1. Configure no Back Office</p>
              <p className="text-xs text-muted-foreground">Crie missões, conquistas, torneios e prêmios da roleta nas páginas de Gamificação.</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">2. Escolha o Segmento</p>
              <p className="text-xs text-muted-foreground">Selecione o segmento acima para filtrar o conteúdo. Sem segmento = mostra tudo.</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">3. Incorpore via GTM</p>
              <p className="text-xs text-muted-foreground">Cole o código no GTM como Tag HTML Personalizada com trigger All Pages.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API endpoint info */}
      <Card className="glass-card border-border">
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Endpoints da API</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-3 bg-secondary/30 rounded-lg p-2.5">
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold text-[10px]">GET</span>
              <code className="font-mono text-muted-foreground flex-1">{WIDGET_SCRIPT_URL}?action=data{selectedSegment !== '_all' ? `&segment=${selectedSegment}` : ''}</code>
              <span className="text-muted-foreground">Dados de gamificação</span>
            </div>
            <div className="flex items-center gap-3 bg-secondary/30 rounded-lg p-2.5">
              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold text-[10px]">GET</span>
              <code className="font-mono text-muted-foreground flex-1">{WIDGET_SCRIPT_URL}?action=spin</code>
              <span className="text-muted-foreground">Girar a roleta</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      {previewOpen && (
        <Card className="glass-card border-border">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Preview ao Vivo</h3>
            <div className="relative bg-[#0c0a1a] rounded-xl overflow-hidden" style={{ height: '600px' }}>
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0c0a1a;font-family:sans-serif;color:white;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.mock{opacity:0.3}.mock h1{font-size:28px}.mock p{font-size:14px;color:#71717a}</style></head><body><div class="mock"><h1>PixBingoBR</h1><p>Simulação do site do jogador</p><p style="margin-top:20px;font-size:12px">👉 Clique no botão roxo no canto inferior direito</p></div><script src="${window.location.origin}/widget/gamification.js"${segmentParam} data-require-login="false"></script></body></html>`}
                className="w-full h-full border-0 rounded-lg"
                title="Widget Preview"
                sandbox="allow-scripts allow-popups"
                key={selectedSegment}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
