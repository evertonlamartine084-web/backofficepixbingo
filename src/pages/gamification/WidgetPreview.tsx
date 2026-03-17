import { useState } from 'react';
import { Copy, Check, ExternalLink, Code2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nehmmvtpagncmldivnxn.supabase.co';
const WIDGET_SCRIPT_URL = `${SUPABASE_URL}/functions/v1/gamification-widget`;

export default function WidgetPreview() {
  const [copied, setCopied] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const embedCodeGTM = `<!-- PixBingoBR Gamification Widget -->
<script src="${window.location.origin}/widget/gamification.js"></script>`;

  const embedCodeDirect = `<!-- PixBingoBR Gamification Widget (Direct) -->
<script>
(function(){
  var s = document.createElement('script');
  s.src = '${window.location.origin}/widget/gamification.js';
  s.async = true;
  document.body.appendChild(s);
})();
</script>`;

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

      {/* Embed codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Via GTM (Tag HTML)</h3>
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
            <p className="text-[10px] text-muted-foreground">
              Cole no GTM como Tag HTML personalizada. Trigger: All Pages.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Direto no HTML</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(embedCodeDirect, 'direct')}
                className="text-xs"
              >
                {copied === 'direct' ? <Check className="w-3.5 h-3.5 mr-1 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                Copiar
              </Button>
            </div>
            <pre className="bg-secondary/50 rounded-lg p-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {embedCodeDirect}
            </pre>
            <p className="text-[10px] text-muted-foreground">
              Cole antes do {'</body>'} no HTML do site.
            </p>
          </CardContent>
        </Card>
      </div>

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
              <p className="font-semibold text-foreground mb-1">2. Incorpore o Widget</p>
              <p className="text-xs text-muted-foreground">Cole o código no GTM ou diretamente no HTML do site do PixBingoBR.</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="font-semibold text-foreground mb-1">3. Jogadores Interagem</p>
              <p className="text-xs text-muted-foreground">O botão flutuante aparece no canto inferior direito. Ao clicar, abre o painel com todas as recompensas.</p>
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
              <code className="font-mono text-muted-foreground flex-1">{WIDGET_SCRIPT_URL}?action=data</code>
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
                src={`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0c0a1a;font-family:sans-serif;color:white;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.mock{opacity:0.3}.mock h1{font-size:28px}.mock p{font-size:14px;color:#71717a}</style></head><body><div class="mock"><h1>PixBingoBR</h1><p>Simulação do site do jogador</p><p style="margin-top:20px;font-size:12px">👉 Clique no botão roxo no canto inferior direito</p></div><script src="${window.location.origin}/widget/gamification.js"><\/script></body></html>`)}`}
                className="w-full h-full border-0 rounded-lg"
                title="Widget Preview"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
