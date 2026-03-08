import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export interface WidgetCard {
  image_url: string;
  title: string;
  description: string;
  button_text: string;
  button_url: string;
  badge: string;
}

export interface WidgetConfig {
  fab_emoji: string;
  fab_bg: string;
  fab_size: string;
  fab_position: string;
  panel_title: string;
  panel_subtitle: string;
  bg_color: string;
  card_bg: string;
  text_color: string;
  accent_color: string;
  button_color: string;
  button_text_color: string;
  cards: WidgetCard[];
}

export const defaultWidgetConfig: WidgetConfig = {
  fab_emoji: '🎁',
  fab_bg: '#e53e3e',
  fab_size: '60',
  fab_position: 'bottom-right',
  panel_title: '🔥 Ofertas Exclusivas',
  panel_subtitle: 'Promoções selecionadas pra você!',
  bg_color: '#1a1a2e',
  card_bg: '#16213e',
  text_color: '#ffffff',
  accent_color: '#e53e3e',
  button_color: '#e53e3e',
  button_text_color: '#ffffff',
  cards: [
    {
      image_url: '',
      title: '50x Rodadas Grátis',
      description: 'No Tigre Sortudo',
      button_text: 'Resgatar',
      button_url: '',
      badge: '🎰 50x',
    },
    {
      image_url: '',
      title: 'Quiz Brasileirão',
      description: 'Lucre com seu conhecimento!',
      button_text: 'Jogar Grátis',
      button_url: '',
      badge: '⚽ Grátis',
    },
  ],
};

export function generateWidgetHtml(c: WidgetConfig): string {
  const pos = c.fab_position === 'bottom-left' ? 'left:20px' : 'right:20px';
  const panelPos = c.fab_position === 'bottom-left' ? 'left:20px' : 'right:20px';

  const cardsHtml = c.cards.map((card, i) => `
    <div class="__pb_wcard">
      ${card.image_url ? `<div class="__pb_wcard_img"><img src="${card.image_url}" alt=""></div>` : `<div class="__pb_wcard_placeholder">${card.badge || '🎁'}</div>`}
      <div class="__pb_wcard_body">
        <div class="__pb_wcard_title">${card.title}</div>
        <div class="__pb_wcard_desc">${card.description}</div>
      </div>
      <button class="__pb_wcard_btn" onclick="${card.button_url ? `window.location.href='${card.button_url}'` : ''}">${card.button_text}</button>
    </div>`).join('\n');

  return `<style>
.__pb_fab{position:fixed;bottom:20px;${pos};z-index:999998;width:${c.fab_size}px;height:${c.fab_size}px;border-radius:50%;background:${c.fab_bg};border:3px solid rgba(255,255,255,.2);cursor:pointer;font-size:${Math.round(parseInt(c.fab_size)*0.45)}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 20px ${c.fab_bg}44;transition:transform .2s,box-shadow .2s;animation:__pb_pulse 2s infinite;}
.__pb_fab:hover{transform:scale(1.12);box-shadow:0 6px 32px rgba(0,0,0,.6),0 0 30px ${c.fab_bg}66;}
@keyframes __pb_pulse{0%,100%{box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 20px ${c.fab_bg}44;}50%{box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 35px ${c.fab_bg}88;}}
.__pb_wpanel{position:fixed;bottom:90px;${panelPos};z-index:999999;width:360px;max-height:80vh;background:${c.bg_color};border-radius:16px;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.6);transform:translateY(20px) scale(.95);opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.4,0,.2,1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
.__pb_wpanel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}
.__pb_wpanel_hdr{padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(180deg,rgba(255,255,255,.04) 0%,transparent 100%);}
.__pb_wpanel_title{font-size:18px;font-weight:700;color:${c.text_color};margin:0 0 4px;}
.__pb_wpanel_sub{font-size:12px;color:${c.text_color};opacity:.55;margin:0;}
.__pb_wpanel_close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.08);border:none;color:${c.text_color};width:28px;height:28px;border-radius:8px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;}
.__pb_wpanel_close:hover{background:rgba(255,255,255,.15);}
.__pb_wpanel_body{padding:12px;overflow-y:auto;max-height:calc(80vh - 80px);display:flex;flex-direction:column;gap:10px;}
.__pb_wcard{background:${c.card_bg};border-radius:12px;border:1px solid rgba(255,255,255,.06);overflow:hidden;display:flex;align-items:center;gap:12px;padding:12px;transition:border-color .2s,transform .15s;}
.__pb_wcard:hover{border-color:${c.accent_color}44;transform:translateX(2px);}
.__pb_wcard_img{width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;}
.__pb_wcard_img img{width:100%;height:100%;object-fit:cover;}
.__pb_wcard_placeholder{width:64px;height:64px;border-radius:10px;background:linear-gradient(135deg,${c.accent_color}22,${c.accent_color}44);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;}
.__pb_wcard_body{flex:1;min-width:0;}
.__pb_wcard_title{font-size:13px;font-weight:600;color:${c.text_color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.__pb_wcard_desc{font-size:11px;color:${c.text_color};opacity:.5;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.__pb_wcard_btn{background:${c.button_color};color:${c.button_text_color};border:none;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity .2s;flex-shrink:0;}
.__pb_wcard_btn:hover{opacity:.85;}
</style>
<button class="__pb_fab" onclick="var p=document.getElementById('__pb_wpanel');p.classList.toggle('open')">${c.fab_emoji}</button>
<div id="__pb_wpanel" class="__pb_wpanel">
<div class="__pb_wpanel_hdr" style="position:relative;">
<div class="__pb_wpanel_title">${c.panel_title}</div>
<div class="__pb_wpanel_sub">${c.panel_subtitle}</div>
<button class="__pb_wpanel_close" onclick="document.getElementById('__pb_wpanel').classList.remove('open')">&times;</button>
</div>
<div class="__pb_wpanel_body">
${cardsHtml}
</div>
</div>`;
}

interface WidgetBuilderProps {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

export function WidgetBuilder({ config, onChange }: WidgetBuilderProps) {
  const update = (key: keyof WidgetConfig, value: any) => onChange({ ...config, [key]: value });

  const updateCard = (index: number, key: keyof WidgetCard, value: string) => {
    const cards = [...config.cards];
    cards[index] = { ...cards[index], [key]: value };
    onChange({ ...config, cards });
  };

  const addCard = () => {
    onChange({ ...config, cards: [...config.cards, { image_url: '', title: 'Novo Item', description: 'Descrição', button_text: 'Ver', button_url: '', badge: '🎁' }] });
  };

  const removeCard = (index: number) => {
    onChange({ ...config, cards: config.cards.filter((_, i) => i !== index) });
  };

  const previewHtml = useMemo(() => {
    const html = generateWidgetHtml(config);
    return `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;padding:0;min-height:100%;background:#0f0f1a;}</style></head><body>${html}<script>document.getElementById('__pb_wpanel')?.classList.add('open');</script></body></html>`;
  }, [config]);

  return (
    <div className="space-y-5">
      {/* FAB */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Botão Flutuante</Label>
        <div className="grid grid-cols-4 gap-3 mt-2">
          <div>
            <Label className="text-xs">Emoji</Label>
            <Input value={config.fab_emoji} onChange={e => update('fab_emoji', e.target.value)} className="mt-1 text-center text-lg" maxLength={4} />
          </div>
          <div>
            <Label className="text-xs">Cor</Label>
            <div className="flex gap-1.5 mt-1">
              <input type="color" value={config.fab_bg} onChange={e => update('fab_bg', e.target.value)} className="w-9 h-9 rounded border border-border cursor-pointer" />
              <Input value={config.fab_bg} onChange={e => update('fab_bg', e.target.value)} className="flex-1 font-mono text-[10px]" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tamanho</Label>
            <Input type="number" value={config.fab_size} onChange={e => update('fab_size', e.target.value)} className="mt-1" min={40} max={80} />
          </div>
          <div>
            <Label className="text-xs">Posição</Label>
            <Select value={config.fab_position} onValueChange={v => update('fab_position', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Direito</SelectItem>
                <SelectItem value="bottom-left">Esquerdo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Panel Header */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Painel</Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={config.panel_title} onChange={e => update('panel_title', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Subtítulo</Label>
            <Input value={config.panel_subtitle} onChange={e => update('panel_subtitle', e.target.value)} className="mt-1" />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cores</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {([
            ['bg_color', 'Fundo painel'],
            ['card_bg', 'Fundo cards'],
            ['text_color', 'Texto'],
            ['accent_color', 'Destaque'],
            ['button_color', 'Botão'],
            ['button_text_color', 'Texto botão'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <div className="flex gap-1.5 mt-1">
                <input type="color" value={config[key]} onChange={e => update(key, e.target.value)} className="w-9 h-9 rounded border border-border cursor-pointer" />
                <Input value={config[key]} onChange={e => update(key, e.target.value)} className="flex-1 font-mono text-[10px]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Itens / Cards</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addCard}>
            <Plus className="w-3 h-3" /> Adicionar
          </Button>
        </div>
        <div className="space-y-3">
          {config.cards.map((card, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCard(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Título</Label>
                  <Input value={card.title} onChange={e => updateCard(i, 'title', e.target.value)} className="mt-0.5 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Descrição</Label>
                  <Input value={card.description} onChange={e => updateCard(i, 'description', e.target.value)} className="mt-0.5 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Texto botão</Label>
                  <Input value={card.button_text} onChange={e => updateCard(i, 'button_text', e.target.value)} className="mt-0.5 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Badge / Emoji</Label>
                  <Input value={card.badge} onChange={e => updateCard(i, 'badge', e.target.value)} className="mt-0.5 h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">URL imagem (opcional)</Label>
                  <Input value={card.image_url} onChange={e => updateCard(i, 'image_url', e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="https://..." />
                </div>
                <div>
                  <Label className="text-[10px]">URL do botão (opcional)</Label>
                  <Input value={card.button_url} onChange={e => updateCard(i, 'button_url', e.target.value)} className="mt-0.5 h-8 text-xs" placeholder="https://..." />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview ao vivo</Label>
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[400px] rounded-lg border border-border mt-2"
          sandbox="allow-scripts"
          title="Widget Preview"
        />
      </div>
    </div>
  );
}
