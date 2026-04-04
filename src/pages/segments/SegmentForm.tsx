import type { SetStateAction } from 'react';
import { Loader2, Upload, Zap, RefreshCw, Eye, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import { formatCPF } from '@/lib/formatters';
import { SegmentRuleBuilder } from './SegmentRuleBuilder';
import { SEGMENT_COLORS, SEGMENT_ICONS } from './types';
import type { SegmentRule } from './types';

interface SegmentFormProps {
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  newDesc: string;
  setNewDesc: (v: string) => void;
  newType: 'manual' | 'automatic';
  setNewType: (v: 'manual' | 'automatic') => void;
  newRules: SegmentRule[];
  setNewRules: (r: SetStateAction<SegmentRule[]>) => void;
  newMatchType: 'all' | 'any';
  setNewMatchType: (m: 'all' | 'any') => void;
  newAutoRefresh: boolean;
  setNewAutoRefresh: (v: boolean) => void;
  newColor: string;
  setNewColor: (v: string) => void;
  newIcon: string;
  setNewIcon: (v: string) => void;
  previewCount: number | null;
  previewSample: string[];
  previewLoading: boolean;
  previewRules: (rules: SegmentRule[], matchType: string) => Promise<void>;
  createMut: { mutate: () => void; isPending: boolean };
  resetCreateForm: () => void;
}

export function SegmentForm({
  createOpen, setCreateOpen,
  newName, setNewName, newDesc, setNewDesc,
  newType, setNewType,
  newRules, setNewRules,
  newMatchType, setNewMatchType,
  newAutoRefresh, setNewAutoRefresh,
  newColor, setNewColor,
  newIcon, setNewIcon,
  previewCount, previewSample, previewLoading, previewRules,
  createMut, resetCreateForm,
}: SegmentFormProps) {
  return (
    <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetCreateForm(); }}>
      <DialogTrigger asChild>
        <Button className="gradient-primary border-0">
          <span className="mr-2">+</span> Novo Segmento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Segmento</DialogTitle>
          <DialogDescription>Crie um segmento manual (lista de CPFs) ou automatico (baseado em regras)</DialogDescription>
        </DialogHeader>

        <Tabs value={newType} onValueChange={v => setNewType(v as 'manual' | 'automatic')} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="text-xs">
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Manual (CPFs)
            </TabsTrigger>
            <TabsTrigger value="automatic" className="text-xs">
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Automatico (Regras)
            </TabsTrigger>
          </TabsList>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: VIPs Nivel 5+" className="bg-secondary border-border" />
              </div>
              <div>
                <Label>Descricao (opcional)</Label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Jogadores de alto nivel" className="bg-secondary border-border" />
              </div>
            </div>

            {/* Color & Icon */}
            <div className="flex items-center gap-4">
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex gap-1.5 mt-1">
                  {SEGMENT_COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Icone</Label>
                <div className="flex gap-1.5 mt-1">
                  {SEGMENT_ICONS.map(ic => (
                    <button key={ic} onClick={() => setNewIcon(ic)}
                      className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-all ${newIcon === ic ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                      {ic === 'users' ? '👥' : ic === 'star' ? '⭐' : ic === 'zap' ? '⚡' : ic === 'target' ? '🎯' : ic === 'crown' ? '👑' : ic === 'diamond' ? '💎' : ic === 'fire' ? '🔥' : ic === 'shield' ? '🛡' : ic === 'trophy' ? '🏆' : '🎁'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <TabsContent value="manual" className="mt-0 space-y-2">
              <p className="text-xs text-muted-foreground">Apos criar, adicione CPFs manualmente ao segmento.</p>
            </TabsContent>

            <TabsContent value="automatic" className="mt-0 space-y-4">
              <SegmentRuleBuilder rules={newRules} setRules={setNewRules} matchType={newMatchType} setMatchType={setNewMatchType} />

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium">Auto-refresh</p>
                    <p className="text-[10px] text-muted-foreground">Reavalia automaticamente a cada 24h</p>
                  </div>
                </div>
                <Switch checked={newAutoRefresh} onCheckedChange={setNewAutoRefresh} />
              </div>

              {/* Preview */}
              {newRules.length > 0 && (
                <div className="space-y-2">
                  <Button variant="outline" size="sm" onClick={() => previewRules(newRules, newMatchType)}
                    disabled={previewLoading || newRules.some(r => !r.value)} className="text-xs">
                    {previewLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                    Pre-visualizar
                  </Button>
                  {previewCount !== null && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">{previewCount.toLocaleString('pt-BR')}</span>
                        <span className="text-xs text-muted-foreground">jogadores correspondem</span>
                      </div>
                      {previewSample.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {previewSample.slice(0, 5).map(cpf => (
                            <span key={cpf} className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">{formatCPF(cpf)}</span>
                          ))}
                          {previewCount > 5 && <span className="text-[10px] text-muted-foreground">+{previewCount - 5} mais</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending || (newType === 'automatic' && newRules.length === 0)} className="gradient-primary border-0">
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Segmento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
