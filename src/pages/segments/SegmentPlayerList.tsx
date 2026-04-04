import { MutableRefObject, SetStateAction } from 'react';
import {
  Loader2, Upload, X, CreditCard, DollarSign, SearchCheck, ShieldCheck, ShieldX, Ban, Download,
  Zap, Settings2, RefreshCw, Filter, Users, Trash2, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import { formatCPF, formatDateTime, parseCPFList } from '@/lib/formatters';
import { SegmentRuleBuilder } from './SegmentRuleBuilder';
import { RULE_FIELDS, OPERATORS_NUMBER, OPERATORS_DAYS } from './types';
import type { SegmentRow, SegmentItemRow, AllUserItem, SegmentRule, VerifyResult } from './types';

interface SegmentPlayerListProps {
  selectedSeg: SegmentRow;
  isAllUsers: boolean;
  effectiveItemsLoading: boolean;
  effectiveItemsCount: number;
  pagedItems: (SegmentItemRow | AllUserItem)[];
  allUsersFetchProgress: { loaded: number; total: number };
  creds: { username: string; password: string };

  // Pagination
  tablePage: number;
  setTablePage: (p: number | ((p: number) => number)) => void;
  tablePageSize: number;
  setTablePageSize: (s: number) => void;
  tableTotalPages: number;
  tableStart: number;

  // Add CPFs
  addCpfOpen: boolean;
  setAddCpfOpen: (o: boolean) => void;
  cpfInput: string;
  setCpfInput: (v: string) => void;
  addCpfsMut: { mutate: () => void; isPending: boolean };

  // Remove CPF
  removeCpfMut: { mutate: (id: string) => void };

  // Mass credit
  creditOpen: boolean;
  setCreditOpen: (o: boolean) => void;
  creditAmount: string;
  setCreditAmount: (v: string) => void;
  creditLoading: boolean;
  creditProgress: { current: number; total: number; credited: number; errors: number };
  handleMassCredit: () => Promise<void>;
  creditCancelRef: MutableRefObject<boolean>;

  // Verify bonus
  verifyOpen: boolean;
  setVerifyOpen: (o: boolean) => void;
  verifyDays: string;
  setVerifyDays: (v: string) => void;
  verifyConcurrency: string;
  setVerifyConcurrency: (v: string) => void;
  verifyLoading: boolean;
  verifyProgress: { current: number; total: number };
  verifyResults: Record<string, VerifyResult>;
  verifyDone: boolean;
  setVerifyDone: (v: boolean) => void;
  verifyMode: 'received' | 'balance';
  setVerifyMode: (m: 'received' | 'balance') => void;
  handleVerifyBonus: () => Promise<void>;
  verifyCancelRef: MutableRefObject<boolean>;
  handleRemoveWithBonus: () => Promise<void>;
  exportVerifyCSV: (filter?: 'all' | 'with' | 'without') => void;

  // Automatic segment controls
  evaluating: boolean;
  handleReEvaluate: () => Promise<void>;
  editRulesOpen: boolean;
  setEditRulesOpen: (o: boolean) => void;
  editRules: SegmentRule[];
  setEditRules: (r: SetStateAction<SegmentRule[]>) => void;
  editMatchType: 'all' | 'any';
  setEditMatchType: (m: 'all' | 'any') => void;
  editAutoRefresh: boolean;
  setEditAutoRefresh: (v: boolean) => void;
  handleSaveRules: () => Promise<void>;
}

export function SegmentPlayerList({
  selectedSeg, isAllUsers, effectiveItemsLoading, effectiveItemsCount, pagedItems,
  allUsersFetchProgress, creds,
  tablePage, setTablePage, tablePageSize, setTablePageSize, tableTotalPages, tableStart,
  addCpfOpen, setAddCpfOpen, cpfInput, setCpfInput, addCpfsMut, removeCpfMut,
  creditOpen, setCreditOpen, creditAmount, setCreditAmount, creditLoading, creditProgress,
  handleMassCredit, creditCancelRef,
  verifyOpen, setVerifyOpen, verifyDays, setVerifyDays, verifyConcurrency, setVerifyConcurrency,
  verifyLoading, verifyProgress, verifyResults, verifyDone, setVerifyDone, verifyMode, setVerifyMode,
  handleVerifyBonus, verifyCancelRef, handleRemoveWithBonus, exportVerifyCSV,
  evaluating, handleReEvaluate,
  editRulesOpen, setEditRulesOpen, editRules, setEditRules, editMatchType, setEditMatchType,
  editAutoRefresh, setEditAutoRefresh, handleSaveRules,
}: SegmentPlayerListProps) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedSeg.color || '#6d28d9' }} />
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              {selectedSeg.name}
              {selectedSeg.segment_type === 'automatic' && (
                <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
                  <Zap className="w-3 h-3 mr-1" /> Automatico
                </Badge>
              )}
            </h2>
            {selectedSeg.description && <p className="text-sm text-muted-foreground">{selectedSeg.description}</p>}
            {selectedSeg.last_evaluated_at && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Ultima avaliacao: {formatDateTime(selectedSeg.last_evaluated_at)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Automatic segment controls */}
          {selectedSeg.segment_type === 'automatic' && !isAllUsers && (
            <>
              <Button variant="outline" size="sm" className="border-border text-xs"
                onClick={() => {
                  setEditRules(selectedSeg.rules || []);
                  setEditMatchType((selectedSeg.match_type || 'all') as 'all' | 'any');
                  setEditAutoRefresh(selectedSeg.auto_refresh || false);
                  setEditRulesOpen(true);
                }}>
                <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Editar Regras
              </Button>
              <Button variant="outline" size="sm" className="border-border text-xs"
                onClick={handleReEvaluate} disabled={evaluating}>
                {evaluating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Reavaliar
              </Button>
            </>
          )}

          {/* Manual segment: add CPFs */}
          {(!isAllUsers && selectedSeg.segment_type !== 'automatic') && (
            <Dialog open={addCpfOpen} onOpenChange={setAddCpfOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-border">
                  <Upload className="w-4 h-4 mr-2" /> Adicionar CPFs
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Adicionar CPFs ao Segmento</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Cole os CPFs (um por linha, separados por virgula ou espaco)</Label>
                  <Textarea value={cpfInput} onChange={e => setCpfInput(e.target.value)}
                    placeholder={"12345678901\n98765432109\n11122233344"} rows={8}
                    className="bg-secondary border-border font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">{parseCPFList(cpfInput).length} CPF(s) valido(s) detectado(s)</p>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                  <Button onClick={() => addCpfsMut.mutate()} disabled={parseCPFList(cpfInput).length === 0 || addCpfsMut.isPending} className="gradient-primary border-0">
                    {addCpfsMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Adicionar {parseCPFList(cpfInput).length} CPFs
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Mass Credit */}
          <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-success border-0 text-success-foreground" size="sm" disabled={effectiveItemsCount === 0}>
                <CreditCard className="w-4 h-4 mr-2" /> Creditar Segmento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Creditacao em Massa</DialogTitle>
                <DialogDescription>Creditar bonus para todos os {effectiveItemsCount} CPFs do segmento "{selectedSeg?.name}"</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!creds.username && (
                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                    Conecte-se primeiro na barra de credenciais acima
                  </div>
                )}
                <div>
                  <Label>Valor do Bonus (R$)</Label>
                  <Input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                    className="bg-secondary border-border font-mono mt-1" placeholder="10" />
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">CPFs no segmento</span><span className="font-semibold text-foreground">{effectiveItemsCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor por jogador</span><span className="font-mono text-foreground">R$ {parseFloat(creditAmount) || 0}</span></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1">
                    <span className="text-muted-foreground font-semibold">Total estimado</span>
                    <span className="font-mono font-bold text-foreground">R$ {(effectiveItemsCount * (parseFloat(creditAmount) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                {creditLoading && (
                  <div className="space-y-2">
                    <Progress value={creditProgress.total > 0 ? (creditProgress.current / creditProgress.total) * 100 : 0} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Processando {creditProgress.current}/{creditProgress.total}</span>
                      <span><span className="text-success">{creditProgress.credited} ok</span>{creditProgress.errors > 0 && <span className="text-destructive ml-2">{creditProgress.errors} erro</span>}</span>
                    </div>
                  </div>
                )}
                {!creditLoading && creditProgress.current > 0 && (
                  <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                    <p className="font-semibold text-success">Processamento concluido!</p>
                    <p className="text-muted-foreground mt-1">{creditProgress.credited} creditados, {creditProgress.errors} erros</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                {creditLoading ? (
                  <Button onClick={() => { creditCancelRef.current = true; }} variant="destructive"><Ban className="w-4 h-4 mr-2" />Cancelar</Button>
                ) : (
                  <Button onClick={handleMassCredit} disabled={!creds.username || effectiveItemsCount === 0} className="gradient-success border-0 text-success-foreground">
                    <DollarSign className="w-4 h-4 mr-2" /> Iniciar Creditacao
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Verify Bonus */}
          <Dialog open={verifyOpen} onOpenChange={(o) => { setVerifyOpen(o); if (!o) setVerifyDone(false); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-border" disabled={effectiveItemsCount === 0}>
                <SearchCheck className="w-4 h-4 mr-2" /> Verificar Bonus
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Verificar Bonus no Segmento</DialogTitle>
                <DialogDescription>Verifique bonus recebidos ou saldo de bonus atual dos jogadores.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!creds.username && (
                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">Conecte-se primeiro na barra de credenciais acima</div>
                )}
                <div>
                  <Label>Tipo de verificacao</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button onClick={() => setVerifyMode('received')}
                      className={`p-3 rounded-lg border text-left text-xs transition-colors ${verifyMode === 'received' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'}`}>
                      <p className="font-semibold">Bonus Recebidos</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Quem recebeu bonus nos ultimos X dias</p>
                    </button>
                    <button onClick={() => setVerifyMode('balance')}
                      className={`p-3 rounded-lg border text-left text-xs transition-colors ${verifyMode === 'balance' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/50'}`}>
                      <p className="font-semibold">Saldo Bonus Atual</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Quem ja usou vs quem ainda tem saldo</p>
                    </button>
                  </div>
                </div>
                {verifyMode === 'received' && (
                  <div>
                    <Label>Periodo (dias)</Label>
                    <Input type="number" value={verifyDays} onChange={e => setVerifyDays(e.target.value)}
                      className="bg-secondary border-border font-mono mt-1" placeholder="7" min="1" />
                    <p className="text-xs text-muted-foreground mt-1">Jogadores que receberam bonus nos ultimos {verifyDays || '0'} dias serao marcados</p>
                  </div>
                )}
                {verifyMode === 'balance' && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                    Consulta o saldo atual da carteira bonus de cada jogador. Quem tem saldo R$ 0,00 ja usou todo o bonus.
                  </div>
                )}
                <div>
                  <Label>Concorrencia</Label>
                  <Input type="number" value={verifyConcurrency} onChange={e => setVerifyConcurrency(e.target.value)}
                    className="bg-secondary border-border font-mono mt-1" placeholder="15" min="1" max="50" />
                </div>
                {verifyLoading && (
                  <div className="space-y-2">
                    <Progress value={verifyProgress.total > 0 ? (verifyProgress.current / verifyProgress.total) * 100 : 0} className="h-2" />
                    <p className="text-xs text-muted-foreground text-center">Verificando {verifyProgress.current}/{verifyProgress.total} jogadores...</p>
                  </div>
                )}
                {verifyDone && verifyMode === 'received' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Total verificados</span><span className="font-semibold text-foreground">{Object.keys(verifyResults).length}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldX className="w-3 h-3 text-destructive" /> Com bonus</span><span className="font-semibold text-destructive">{Object.values(verifyResults).filter(r => r.hasBonus).length}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-success" /> Sem bonus</span><span className="font-semibold text-success">{Object.values(verifyResults).filter(r => !r.hasBonus).length}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('all')}><Download className="w-3.5 h-3.5 mr-1" /> Todos</Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('with')}><Download className="w-3.5 h-3.5 mr-1" /> Com bonus</Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('without')}><Download className="w-3.5 h-3.5 mr-1" /> Sem bonus</Button>
                    </div>
                    {Object.values(verifyResults).filter(r => r.hasBonus).length > 0 && (
                      <Button onClick={handleRemoveWithBonus} className="w-full" variant="destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Remover {Object.values(verifyResults).filter(r => r.hasBonus).length} CPFs com bonus
                      </Button>
                    )}
                  </div>
                )}
                {verifyDone && verifyMode === 'balance' && (() => {
                  const all = Object.entries(verifyResults);
                  const withBalance = all.filter(([, r]) => (r.bonusBalance || 0) > 0);
                  const usedAll = all.filter(([, r]) => (r.bonusBalance || 0) === 0);
                  const totalBalance = withBalance.reduce((s, [, r]) => s + (r.bonusBalance || 0), 0);
                  return (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-secondary/50 text-sm space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Total verificados</span><span className="font-semibold text-foreground">{all.length}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-success" /> Ja usaram (saldo R$ 0)</span><span className="font-semibold text-success">{usedAll.length}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><ShieldX className="w-3 h-3 text-amber-400" /> Ainda tem saldo</span><span className="font-semibold text-amber-400">{withBalance.length}</span></div>
                        <div className="flex justify-between border-t border-border pt-1 mt-1">
                          <span className="text-muted-foreground font-semibold">Saldo total pendente</span>
                          <span className="font-mono font-bold text-amber-400">R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('all')}><Download className="w-3.5 h-3.5 mr-1" /> Todos</Button>
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('with')}><Download className="w-3.5 h-3.5 mr-1" /> Com saldo</Button>
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => exportVerifyCSV('without')}><Download className="w-3.5 h-3.5 mr-1" /> Ja usaram</Button>
                      </div>
                      {all.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Saldo por jogador:</p>
                          <div className="max-h-60 overflow-y-auto space-y-1">
                            {all.sort((a, b) => (b[1].bonusBalance || 0) - (a[1].bonusBalance || 0)).map(([cpf, r]) => (
                              <div key={cpf} className="flex justify-between text-xs bg-secondary/30 rounded px-2 py-1">
                                <span className="font-mono text-foreground">{cpf}</span>
                                <span className={`font-mono font-semibold ${(r.bonusBalance || 0) > 0 ? 'text-amber-400' : 'text-success'}`}>
                                  R$ {(r.bonusBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {withBalance.length > 0 && (
                        <Button onClick={handleRemoveWithBonus} className="w-full" variant="destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Remover {withBalance.length} CPFs com saldo pendente
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
                {!verifyDone && (
                  verifyLoading ? (
                    <Button onClick={() => { verifyCancelRef.current = true; }} variant="destructive"><Ban className="w-4 h-4 mr-2" />Cancelar</Button>
                  ) : (
                    <Button onClick={handleVerifyBonus} disabled={!creds.username || effectiveItemsCount === 0} className="gradient-primary border-0">
                      <SearchCheck className="w-4 h-4 mr-2" /> Iniciar Verificacao
                    </Button>
                  )
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rules display for automatic segments */}
      {selectedSeg.segment_type === 'automatic' && selectedSeg.rules && selectedSeg.rules.length > 0 && !isAllUsers && (
        <div className="p-3 rounded-lg bg-secondary/30 border border-border space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">Regras ativas</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {selectedSeg.match_type === 'all' ? 'TODAS (AND)' : 'QUALQUER (OR)'}
            </Badge>
          </div>
          <div className="space-y-1">
            {(selectedSeg.rules || []).map((rule: SegmentRule, idx: number) => {
              const fieldDef = RULE_FIELDS.find(f => f.value === rule.field);
              const operators = fieldDef?.type === 'days' ? OPERATORS_DAYS : OPERATORS_NUMBER;
              const opLabel = operators.find(o => o.value === rule.operator)?.label || rule.operator;
              return (
                <div key={rule.id || idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                  {idx > 0 && <span className="text-[10px] font-bold uppercase text-primary">{selectedSeg.match_type === 'all' ? 'E' : 'OU'}</span>}
                  <span className="text-foreground font-medium">{fieldDef?.label || rule.field}</span>
                  <span>{opLabel}</span>
                  <span className="font-mono text-foreground font-semibold">{rule.value}</span>
                  {fieldDef?.type === 'days' && <span>dias</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Rules Dialog */}
      <Dialog open={editRulesOpen} onOpenChange={setEditRulesOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Regras do Segmento</DialogTitle>
            <DialogDescription>Modifique as regras e reavalie o segmento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SegmentRuleBuilder rules={editRules} setRules={setEditRules} matchType={editMatchType} setMatchType={setEditMatchType} />
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium">Auto-refresh</p>
                  <p className="text-[10px] text-muted-foreground">Reavalia automaticamente a cada 24h</p>
                </div>
              </div>
              <Switch checked={editAutoRefresh} onCheckedChange={setEditAutoRefresh} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleSaveRules} disabled={evaluating || editRules.length === 0} className="gradient-primary border-0">
              {evaluating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar e Reavaliar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      {effectiveItemsLoading ? (
        <div className="flex flex-col items-center justify-center p-8 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          {isAllUsers && allUsersFetchProgress.total > 0 && (
            <div className="w-64 space-y-1">
              <Progress value={(allUsersFetchProgress.loaded / allUsersFetchProgress.total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {allUsersFetchProgress.loaded.toLocaleString('pt-BR')} / {allUsersFetchProgress.total.toLocaleString('pt-BR')} jogadores
              </p>
            </div>
          )}
        </div>
      ) : isAllUsers && !creds.username ? (
        <div className="text-center py-10">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Conecte-se a API para carregar todos os jogadores</p>
        </div>
      ) : effectiveItemsCount > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">CPF Mascarado</TableHead>
                  {isAllUsers && <TableHead className="text-xs font-semibold uppercase tracking-wider">Username</TableHead>}
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{isAllUsers ? 'Cadastro' : 'Adicionado em'}</TableHead>
                  {!isAllUsers && selectedSeg.segment_type !== 'manual' && (
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Fonte</TableHead>
                  )}
                  {Object.keys(verifyResults).length > 0 && (
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status Bonus</TableHead>
                  )}
                  {!isAllUsers && selectedSeg.segment_type !== 'automatic' && (
                    <TableHead className="text-xs font-semibold uppercase tracking-wider w-12"></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((item: SegmentItemRow | AllUserItem) => {
                  const vr = verifyResults[item.cpf];
                  return (
                    <TableRow key={item.id} className={`hover:bg-secondary/30 ${vr?.hasBonus ? 'bg-destructive/5' : ''}`}>
                      <TableCell className="font-mono text-sm">{formatCPF(item.cpf)}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{item.cpf_masked}</TableCell>
                      {isAllUsers && <TableCell className="text-sm">{item.username || '\u2014'}</TableCell>}
                      <TableCell className="text-xs text-muted-foreground">{item.created_at ? formatDateTime(item.created_at) : '\u2014'}</TableCell>
                      {!isAllUsers && selectedSeg.segment_type !== 'manual' && (
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${'source' in item && item.source === 'rule' ? 'border-amber-500/30 text-amber-400' : 'border-border text-muted-foreground'}`}>
                            {'source' in item ? (item.source === 'rule' ? 'Regra' : item.source === 'import' ? 'Import' : 'Manual') : 'Manual'}
                          </Badge>
                        </TableCell>
                      )}
                      {Object.keys(verifyResults).length > 0 && (
                        <TableCell>
                          {vr ? (
                            vr.hasBonus ? (
                              <div className="flex items-center gap-1.5">
                                <ShieldX className="w-3.5 h-3.5 text-destructive" />
                                <span className="text-xs text-destructive font-medium">
                                  {vr.bonusCount}x bonus
                                  {vr.lastBonusDate && <span className="text-muted-foreground font-normal ml-1">({formatDateTime(vr.lastBonusDate)})</span>}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-success" />
                                <span className="text-xs text-success font-medium">Sem bonus</span>
                              </div>
                            )
                          ) : <span className="text-xs text-muted-foreground">{'\u2014'}</span>}
                        </TableCell>
                      )}
                      {!isAllUsers && selectedSeg.segment_type !== 'automatic' && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeCpfMut.mutate(item.id)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {effectiveItemsCount > 0 && (
            <div className="flex items-center justify-between gap-4 pt-3 px-1 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Linhas por pagina:</span>
                <Select value={String(tablePageSize)} onValueChange={(v) => { setTablePageSize(Number(v)); setTablePage(0); }}>
                  <SelectTrigger className="h-7 w-16 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{[25, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <span className="ml-2">{(tableStart + 1).toLocaleString('pt-BR')}-{Math.min(tableStart + tablePageSize, effectiveItemsCount).toLocaleString('pt-BR')} de {effectiveItemsCount.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tablePage === 0} onClick={() => setTablePage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {(() => {
                  const maxBtns = 5;
                  if (tableTotalPages <= maxBtns) return Array.from({ length: tableTotalPages }, (_, i) => i);
                  const btns: (number | '...')[] = [0];
                  let s = Math.max(1, tablePage - 1), e = Math.min(tableTotalPages - 2, tablePage + 1);
                  if (tablePage <= 2) { s = 1; e = 3; }
                  if (tablePage >= tableTotalPages - 3) { s = tableTotalPages - 4; e = tableTotalPages - 2; }
                  s = Math.max(1, s); e = Math.min(tableTotalPages - 2, e);
                  if (s > 1) btns.push('...');
                  for (let i = s; i <= e; i++) btns.push(i);
                  if (e < tableTotalPages - 2) btns.push('...');
                  btns.push(tableTotalPages - 1);
                  return btns;
                })().map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">{'\u2026'}</span>
                  ) : (
                    <Button key={p} variant={tablePage === p ? 'default' : 'ghost'} size="icon"
                      className={`h-7 w-7 text-xs ${tablePage === p ? 'gradient-primary border-0' : ''}`}
                      onClick={() => setTablePage(p as number)}>
                      {(p as number) + 1}
                    </Button>
                  )
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={tablePage >= tableTotalPages - 1} onClick={() => setTablePage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {isAllUsers ? 'Nenhum jogador encontrado' :
              selectedSeg.segment_type === 'automatic' ? 'Nenhum jogador corresponde as regras. Clique em "Reavaliar" para atualizar.' :
                'Nenhum CPF neste segmento'}
          </p>
          {!isAllUsers && selectedSeg.segment_type !== 'automatic' && <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar CPFs" para comecar</p>}
        </div>
      )}
    </div>
  );
}
