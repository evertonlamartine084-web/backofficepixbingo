import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface WidgetCard {
  image_url: string;
  title: string;
  description: string;
  button_text: string;
  button_url: string;
  badge: string;
}

export interface WidgetSection {
  title: string;
  layout: 'featured' | 'list' | 'grid';
  cards: WidgetCard[];
}

export interface WidgetConfig {
  fab_emoji: string;
  fab_bg: string;
  fab_size: string;
  fab_position: string;
  page_title: string;
  bg_color: string;
  card_bg: string;
  text_color: string;
  accent_color: string;
  button_color: string;
  button_text_color: string;
  sections: WidgetSection[];
}

const emptyCard: WidgetCard = { image_url: '', title: 'Novo Item', description: 'Descrição aqui', button_text: 'Ver', button_url: '', badge: '🎁' };

export const defaultWidgetConfig: WidgetConfig = {
  fab_emoji: '🎁',
  fab_bg: '#e53e3e',
  fab_size: '60',
  fab_position: 'bottom-right',
  page_title: '🔥 Promoções Exclusivas',
  bg_color: '#111118',
  card_bg: '#1c1c2e',
  text_color: '#ffffff',
  accent_color: '#e53e3e',
  button_color: '#e53e3e',
  button_text_color: '#ffffff',
  sections: [
    {
      title: 'Próximo torneio',
      layout: 'featured',
      cards: [
        { image_url: '', title: 'TORNEIO GANHEI +', description: 'R$ 40.000,00 em Premiação', button_text: 'Junte-se ao torneio', button_url: '', badge: '🏆' },
      ],
    },
    {
      title: 'Quiz',
      layout: 'featured',
      cards: [
        { image_url: '', title: 'Quiz Brasileirão', description: 'Lucre com seu conhecimento!', button_text: 'Grátis para jogar', button_url: '', badge: '⚽' },
      ],
    },
    {
      title: 'Em destaque na loja',
      layout: 'list',
      cards: [
        { image_url: '', title: '50x Rodadas Grátis no Tigre Sortudo', description: '', button_text: 'Comprar por 45 💎', button_url: '', badge: '🎰 50x' },
      ],
    },
    {
      title: 'Mais na loja',
      layout: 'list',
      cards: [
        { image_url: '', title: '50x Rodadas Grátis no Touro Sortudo', description: '', button_text: 'Comprar por 45 💎', button_url: '', badge: '🐂 50x' },
        { image_url: '', title: '50x Rodadas Grátis no Touro Sortudo', description: '', button_text: 'Comprar por 45 💎', button_url: '', badge: '🐂 50x' },
      ],
    },
  ],
};

function renderFeaturedCard(card: WidgetCard, c: WidgetConfig): string {
  return `<div style="background:${c.card_bg};border-radius:14px;border:1px solid rgba(255,255,255,.06);overflow:hidden;flex:1;min-width:250px;">
  ${card.image_url
    ? `<div style="height:160px;overflow:hidden;"><img src="${card.image_url}" style="width:100%;height:100%;object-fit:cover;" alt=""></div>`
    : `<div style="height:160px;background:linear-gradient(135deg,${c.accent_color}22,${c.accent_color}55);display:flex;align-items:center;justify-content:center;font-size:56px;">${card.badge}</div>`}
  <div style="padding:16px;">
    <div style="font-size:11px;color:${c.text_color};opacity:.5;margin-bottom:4px;">${card.description}</div>
    <div style="font-size:15px;font-weight:700;color:${c.text_color};margin-bottom:12px;">${card.title}</div>
    <button onclick="${card.button_url ? `window.location.href='${card.button_url}'` : ''}" style="background:${c.button_color};color:${c.button_text_color};border:none;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;width:100%;transition:opacity .2s;">${card.button_text}</button>
  </div>
</div>`;
}

function renderListCard(card: WidgetCard, c: WidgetConfig): string {
  return `<div style="background:${c.card_bg};border-radius:12px;border:1px solid rgba(255,255,255,.06);padding:14px;display:flex;align-items:center;gap:14px;transition:border-color .2s;">
  ${card.image_url
    ? `<div style="width:72px;height:72px;border-radius:10px;overflow:hidden;flex-shrink:0;"><img src="${card.image_url}" style="width:100%;height:100%;object-fit:cover;" alt=""></div>`
    : `<div style="width:72px;height:72px;border-radius:10px;background:linear-gradient(135deg,${c.accent_color}22,${c.accent_color}44);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${card.badge}</div>`}
  <div style="flex:1;min-width:0;">
    <div style="font-size:13px;font-weight:600;color:${c.text_color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${card.title}</div>
    ${card.description ? `<div style="font-size:11px;color:${c.text_color};opacity:.5;margin-top:3px;">${card.description}</div>` : ''}
  </div>
  <button onclick="${card.button_url ? `window.location.href='${card.button_url}'` : ''}" style="background:${c.card_bg};color:${c.text_color};border:1px solid rgba(255,255,255,.12);padding:8px 16px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .2s;">${card.button_text}</button>
</div>`;
}

function renderSection(section: WidgetSection, c: WidgetConfig): string {
  const cardsHtml = section.cards.map(card => {
    if (section.layout === 'featured') return renderFeaturedCard(card, c);
    return renderListCard(card, c);
  }).join('\n');

  const isFeatured = section.layout === 'featured';
  const wrapStyle = isFeatured
    ? 'display:flex;gap:16px;flex-wrap:wrap;'
    : 'display:flex;flex-direction:column;gap:10px;';

  return `<div style="margin-bottom:28px;">
  <h2 style="font-size:18px;font-weight:700;color:${c.text_color};margin:0 0 14px;">${section.title}</h2>
  <div style="${wrapStyle}">
    ${cardsHtml}
  </div>
</div>`;
}

export function generateWidgetHtml(c: WidgetConfig): string {
  const pos = c.fab_position === 'bottom-left' ? 'left:20px' : 'right:20px';

  const sectionsHtml = c.sections.map(s => renderSection(s, c)).join('\n');

  // Split sections: first half goes left, second half goes right (like the screenshot)
  const midpoint = Math.ceil(c.sections.length / 2);
  const leftSections = c.sections.slice(0, midpoint).map(s => renderSection(s, c)).join('\n');
  const rightSections = c.sections.slice(midpoint).map(s => renderSection(s, c)).join('\n');

  return `<style>
.__pb_fab{position:fixed;bottom:20px;${pos};z-index:999998;width:${c.fab_size}px;height:${c.fab_size}px;border-radius:50%;background:${c.fab_bg};border:3px solid rgba(255,255,255,.2);cursor:pointer;font-size:${Math.round(parseInt(c.fab_size)*0.45)}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 20px ${c.fab_bg}44;transition:transform .2s;animation:__pb_pulse 2s infinite;}
.__pb_fab:hover{transform:scale(1.12);}
@keyframes __pb_pulse{0%,100%{box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 20px ${c.fab_bg}44;}50%{box-shadow:0 4px 24px rgba(0,0,0,.5),0 0 35px ${c.fab_bg}88;}}
.__pb_fs{position:fixed;inset:0;z-index:999999;background:${c.bg_color};overflow-y:auto;transform:translateY(100%);opacity:0;transition:transform .4s cubic-bezier(.4,0,.2,1),opacity .3s;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
.__pb_fs.open{transform:translateY(0);opacity:1;}
.__pb_fs_hdr{position:sticky;top:0;z-index:10;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;background:${c.bg_color};border-bottom:1px solid rgba(255,255,255,.06);backdrop-filter:blur(10px);}
.__pb_fs_title{font-size:22px;font-weight:800;color:${c.text_color};margin:0;}
.__pb_fs_close{background:rgba(255,255,255,.08);border:none;color:${c.text_color};width:36px;height:36px;border-radius:10px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;}
.__pb_fs_close:hover{background:rgba(255,255,255,.15);}
.__pb_fs_body{max-width:1200px;margin:0 auto;padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;}
@media(max-width:768px){.__pb_fs_body{grid-template-columns:1fr;}}
</style>
<button class="__pb_fab" onclick="document.getElementById('__pb_fullscreen').classList.add('open');document.body.style.overflow='hidden';">${c.fab_emoji}</button>
<div id="__pb_fullscreen" class="__pb_fs">
<div class="__pb_fs_hdr">
<div class="__pb_fs_title">${c.page_title}</div>
<button class="__pb_fs_close" onclick="document.getElementById('__pb_fullscreen').classList.remove('open');document.body.style.overflow='';">&times;</button>
</div>
<div class="__pb_fs_body">
<div>${leftSections}</div>
<div>${rightSections}</div>
</div>
</div>`;
}

interface WidgetBuilderProps {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}

export function WidgetBuilder({ config, onChange }: WidgetBuilderProps) {
  const update = (key: keyof WidgetConfig, value: any) => onChange({ ...config, [key]: value });

  const updateSection = (si: number, key: keyof WidgetSection, value: any) => {
    const sections = [...config.sections];
    sections[si] = { ...sections[si], [key]: value };
    onChange({ ...config, sections });
  };

  const updateCard = (si: number, ci: number, key: keyof WidgetCard, value: string) => {
    const sections = [...config.sections];
    const cards = [...sections[si].cards];
    cards[ci] = { ...cards[ci], [key]: value };
    sections[si] = { ...sections[si], cards };
    onChange({ ...config, sections });
  };

  const addSection = () => {
    onChange({ ...config, sections: [...config.sections, { title: 'Nova Seção', layout: 'list', cards: [{ ...emptyCard }] }] });
  };

  const removeSection = (si: number) => {
    onChange({ ...config, sections: config.sections.filter((_, i) => i !== si) });
  };

  const addCard = (si: number) => {
    const sections = [...config.sections];
    sections[si] = { ...sections[si], cards: [...sections[si].cards, { ...emptyCard }] };
    onChange({ ...config, sections });
  };

  const removeCard = (si: number, ci: number) => {
    const sections = [...config.sections];
    sections[si] = { ...sections[si], cards: sections[si].cards.filter((_, i) => i !== ci) };
    onChange({ ...config, sections });
  };

  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});
  const toggleSection = (i: number) => setOpenSections(prev => ({ ...prev, [i]: !prev[i] }));

  const previewHtml = useMemo(() => {
    const html = generateWidgetHtml(config);
    return `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{margin:0;padding:0;min-height:100%;background:#0a0a12;}</style></head><body>${html}<script>document.getElementById('__pb_fullscreen')?.classList.add('open');</script></body></html>`;
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

      {/* Page Header */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tela</Label>
        <div className="mt-2">
          <Label className="text-xs">Título da página</Label>
          <Input value={config.page_title} onChange={e => update('page_title', e.target.value)} className="mt-1" />
        </div>
      </div>

      {/* Colors */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cores</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {([
            ['bg_color', 'Fundo'],
            ['card_bg', 'Cards'],
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

      {/* Sections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Seções</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addSection}>
            <Plus className="w-3 h-3" /> Adicionar Seção
          </Button>
        </div>
        <div className="space-y-3">
          {config.sections.map((section, si) => (
            <div key={si} className="border border-border rounded-lg bg-secondary/20 overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between p-3 hover:bg-secondary/40 transition-colors"
                onClick={() => toggleSection(si)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{section.title || 'Seção sem título'}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {section.layout === 'featured' ? '📐 Destaque' : section.layout === 'grid' ? '▦ Grid' : '☰ Lista'}
                    {' · '}{section.cards.length} card{section.cards.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); removeSection(si); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                  {openSections[si] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {openSections[si] && (
                <div className="p-3 pt-0 space-y-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <div>
                      <Label className="text-xs">Título da seção</Label>
                      <Input value={section.title} onChange={e => updateSection(si, 'title', e.target.value)} className="mt-1 h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Layout</Label>
                      <Select value={section.layout} onValueChange={v => updateSection(si, 'layout', v)}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="featured">📐 Destaque (cards grandes)</SelectItem>
                          <SelectItem value="list">☰ Lista (cards horizontais)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {section.cards.map((card, ci) => (
                      <div key={ci} className="border border-border rounded-md p-2.5 space-y-2 bg-background/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-muted-foreground">Card {ci + 1}</span>
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeCard(si, ci)}>
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px]">Título</Label>
                            <Input value={card.title} onChange={e => updateCard(si, ci, 'title', e.target.value)} className="mt-0.5 h-7 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px]">Descrição</Label>
                            <Input value={card.description} onChange={e => updateCard(si, ci, 'description', e.target.value)} className="mt-0.5 h-7 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px]">Texto botão</Label>
                            <Input value={card.button_text} onChange={e => updateCard(si, ci, 'button_text', e.target.value)} className="mt-0.5 h-7 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px]">Badge / Emoji</Label>
                            <Input value={card.badge} onChange={e => updateCard(si, ci, 'badge', e.target.value)} className="mt-0.5 h-7 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px]">URL imagem</Label>
                            <Input value={card.image_url} onChange={e => updateCard(si, ci, 'image_url', e.target.value)} className="mt-0.5 h-7 text-xs" placeholder="https://..." />
                          </div>
                          <div>
                            <Label className="text-[10px]">URL botão</Label>
                            <Input value={card.button_url} onChange={e => updateCard(si, ci, 'button_url', e.target.value)} className="mt-0.5 h-7 text-xs" placeholder="https://..." />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full gap-1 h-7 text-xs" onClick={() => addCard(si)}>
                      <Plus className="w-3 h-3" /> Card
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview ao vivo</Label>
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[500px] rounded-lg border border-border mt-2"
          sandbox="allow-scripts"
          title="Widget Preview"
        />
      </div>
    </div>
  );
}
