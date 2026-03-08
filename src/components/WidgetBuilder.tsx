import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface WidgetConfig {
  fab_emoji: string;
  fab_bg: string;
  fab_size: string;
  fab_position: string;
  modal_title: string;
  modal_message: string;
  modal_image_url: string;
  modal_button_text: string;
  modal_button_url: string;
  modal_bg: string;
  modal_text_color: string;
  modal_accent_color: string;
}

export const defaultWidgetConfig: WidgetConfig = {
  fab_emoji: '🎁',
  fab_bg: '#6366f1',
  fab_size: '60',
  fab_position: 'bottom-right',
  modal_title: '🎉 Oferta Especial!',
  modal_message: 'Você foi selecionado para uma promoção exclusiva!',
  modal_image_url: '',
  modal_button_text: 'Aproveitar',
  modal_button_url: '',
  modal_bg: '#1a1a2e',
  modal_text_color: '#ffffff',
  modal_accent_color: '#6366f1',
};

export function generateWidgetHtml(c: WidgetConfig): string {
  const pos = c.fab_position === 'bottom-left' ? 'left:20px' : 'right:20px';
  return `<style>
.__pb_fab{position:fixed;bottom:20px;${pos};z-index:999998;width:${c.fab_size}px;height:${c.fab_size}px;border-radius:50%;background:${c.fab_bg};border:none;cursor:pointer;font-size:${Math.round(parseInt(c.fab_size)*0.45)}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.4);transition:transform .2s;}
.__pb_fab:hover{transform:scale(1.1);}
.__pb_overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999999;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s;}
.__pb_overlay.open{opacity:1;pointer-events:auto;}
.__pb_modal{background:${c.modal_bg};color:${c.modal_text_color};border-radius:16px;padding:28px;max-width:400px;width:90%;text-align:center;transform:scale(.9);transition:transform .25s;box-shadow:0 20px 60px rgba(0,0,0,.5);}
.__pb_overlay.open .__pb_modal{transform:scale(1);}
.__pb_modal img{width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:16px;}
.__pb_modal h2{margin:0 0 10px;font-size:22px;font-weight:700;}
.__pb_modal p{margin:0 0 20px;font-size:14px;opacity:.85;line-height:1.5;}
.__pb_modal button.__pb_cta{background:${c.modal_accent_color};color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s;width:100%;}
.__pb_modal button.__pb_cta:hover{opacity:.85;}
.__pb_modal button.__pb_close{position:absolute;top:12px;right:14px;background:none;border:none;color:${c.modal_text_color};font-size:22px;cursor:pointer;opacity:.6;}
.__pb_modal button.__pb_close:hover{opacity:1;}
</style>
<button class="__pb_fab" onclick="document.getElementById('__pb_woverlay').classList.add('open')">${c.fab_emoji}</button>
<div id="__pb_woverlay" class="__pb_overlay" onclick="if(event.target===this)this.classList.remove('open')">
<div class="__pb_modal" style="position:relative;">
<button class="__pb_close" onclick="document.getElementById('__pb_woverlay').classList.remove('open')">&times;</button>
${c.modal_image_url ? `<img src="${c.modal_image_url}" alt="">` : ''}
<h2>${c.modal_title}</h2>
<p>${c.modal_message}</p>
${c.modal_button_text ? `<button class="__pb_cta" onclick="${c.modal_button_url ? `window.location.href='${c.modal_button_url}'` : `document.getElementById('__pb_woverlay').classList.remove('open')`}">${c.modal_button_text}</button>` : ''}
</div>
</div>`;
}

interface WidgetBuilderProps {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

export function WidgetBuilder({ config, onChange }: WidgetBuilderProps) {
  const update = (key: keyof WidgetConfig, value: string) => onChange({ ...config, [key]: value });

  const previewHtml = useMemo(() => {
    const html = generateWidgetHtml(config);
    return `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;padding:0;min-height:100%;background:#222;}</style></head><body>${html}<script>document.querySelector('.__pb_fab')?.click();</script></body></html>`;
  }, [config]);

  return (
    <div className="space-y-4">
      {/* FAB Config */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Botão Flutuante (FAB)</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div>
            <Label className="text-xs">Emoji / Ícone</Label>
            <Input value={config.fab_emoji} onChange={e => update('fab_emoji', e.target.value)} className="mt-1 text-center text-lg" maxLength={4} />
          </div>
          <div>
            <Label className="text-xs">Cor de fundo</Label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={config.fab_bg} onChange={e => update('fab_bg', e.target.value)} className="w-10 h-9 rounded border border-border cursor-pointer" />
              <Input value={config.fab_bg} onChange={e => update('fab_bg', e.target.value)} className="flex-1 font-mono text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Posição</Label>
            <Select value={config.fab_position} onValueChange={v => update('fab_position', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Inferior direito</SelectItem>
                <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Modal Config */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conteúdo do Modal</Label>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={config.modal_title} onChange={e => update('modal_title', e.target.value)} className="mt-1" placeholder="🎉 Oferta Especial!" />
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea value={config.modal_message} onChange={e => update('modal_message', e.target.value)} className="mt-1" rows={3} />
          </div>
          <div>
            <Label className="text-xs">URL da imagem (opcional)</Label>
            <Input value={config.modal_image_url} onChange={e => update('modal_image_url', e.target.value)} className="mt-1" placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Texto do botão</Label>
              <Input value={config.modal_button_text} onChange={e => update('modal_button_text', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">URL do botão (opcional)</Label>
              <Input value={config.modal_button_url} onChange={e => update('modal_button_url', e.target.value)} className="mt-1" placeholder="https://..." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Fundo modal</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={config.modal_bg} onChange={e => update('modal_bg', e.target.value)} className="w-10 h-9 rounded border border-border cursor-pointer" />
                <Input value={config.modal_bg} onChange={e => update('modal_bg', e.target.value)} className="flex-1 font-mono text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor texto</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={config.modal_text_color} onChange={e => update('modal_text_color', e.target.value)} className="w-10 h-9 rounded border border-border cursor-pointer" />
                <Input value={config.modal_text_color} onChange={e => update('modal_text_color', e.target.value)} className="flex-1 font-mono text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor destaque</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={config.modal_accent_color} onChange={e => update('modal_accent_color', e.target.value)} className="w-10 h-9 rounded border border-border cursor-pointer" />
                <Input value={config.modal_accent_color} onChange={e => update('modal_accent_color', e.target.value)} className="flex-1 font-mono text-xs" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview ao vivo</Label>
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[320px] rounded-lg border border-border mt-2"
          sandbox="allow-scripts"
          title="Widget Preview"
        />
      </div>
    </div>
  );
}
