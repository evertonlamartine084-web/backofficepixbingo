/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProxy } from '@/hooks/use-proxy';
import { Users, Search, Copy, ExternalLink, Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Vendedores() {
  const { callProxy } = useProxy();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchVendedor, setSearchVendedor] = useState('');
  const [searchLogin, setSearchLogin] = useState('');
  const [appliedSearch, setAppliedSearch] = useState({ vendedor: '', login: '' });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Detail dialog
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailVendedor, setDetailVendedor] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vendedores', page, pageSize, appliedSearch],
    queryFn: async () => {
      const res = await callProxy('list_vendedores', null, {
        draw: 1,
        start: page * pageSize,
        length: pageSize,
        busca_vendedor: appliedSearch.vendedor || undefined,
        busca_login: appliedSearch.login || undefined,
      });
      return res?.data;
    },
  });

  // Indicados query (when detail is open)
  const { data: indicadosData, isLoading: indicadosLoading } = useQuery({
    queryKey: ['vendedor_indicados', detailId],
    queryFn: async () => {
      if (!detailId) return null;
      const res = await callProxy('vendedor_indicados', null, {
        vendedor_id: detailId,
        draw: 1,
        start: 0,
        length: 50,
      });
      return res?.data;
    },
    enabled: !!detailId,
  });

  const rows = data?.aaData || data?.data || [];
  const totalRecords = data?.iTotalRecords || data?.recordsTotal || 0;
  const totalFiltered = data?.iTotalDisplayRecords || data?.recordsFiltered || totalRecords;
  const totalPages = Math.ceil(totalFiltered / pageSize);

  const handleSearch = () => {
    setPage(0);
    setAppliedSearch({ vendedor: searchVendedor, login: searchLogin });
  };

  const copyCode = useCallback((code: string) => {
    const link = `https://pixbingobr.com/?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedCode(code);
      toast.success('Link copiado!');
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }, []);

  const openDetail = (row: any) => {
    const id = row.id || row[0];
    setDetailVendedor(row);
    setDetailId(String(id));
  };

  // Parse row data - DataTables can return arrays or objects
  const getField = (row: any, index: number, key: string) => {
    if (Array.isArray(row)) return row[index] ?? '';
    return row[key] ?? '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os vendedores/afiliados da plataforma ({totalFiltered} registros)
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="relative">
              <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Vendedor"
                value={searchVendedor}
                onChange={e => setSearchVendedor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-10 bg-secondary border-border"
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Login"
                value={searchLogin}
                onChange={e => setSearchLogin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="pl-10 bg-secondary border-border"
              />
            </div>
          </div>
          <Button onClick={handleSearch} className="gradient-primary border-0">
            <Search className="w-4 h-4 mr-2" /> Buscar
          </Button>
        </div>
      </div>

      {/* Page size */}
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-20 h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">resultados por página</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Nenhum vendedor encontrado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-xs font-semibold uppercase w-16">ID</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Distribuidor</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Vendedor</TableHead>
                <TableHead className="text-xs font-semibold uppercase">Email/Login</TableHead>
                <TableHead className="text-xs font-semibold uppercase w-20">Ativo</TableHead>
                <TableHead className="text-xs font-semibold uppercase w-28">Código</TableHead>
                <TableHead className="text-xs font-semibold uppercase w-24">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any, idx: number) => {
                const id = getField(row, 0, 'id');
                const distribuidor = getField(row, 1, 'distribuidor');
                const vendedor = getField(row, 2, 'vendedor');
                const email = getField(row, 3, 'email');
                const ativo = getField(row, 4, 'ativo');
                const codigo = getField(row, 5, 'codigo');
                const isActive = ativo === 'SIM' || ativo === true || ativo === 1;

                return (
                  <TableRow key={idx} className="hover:bg-secondary/30">
                    <TableCell className="text-sm font-mono text-muted-foreground">{id}</TableCell>
                    <TableCell className="text-sm">{distribuidor}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{vendedor}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{email}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? 'default' : 'destructive'} className="text-[10px]">
                        {isActive ? 'SIM' : 'NÃO'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{codigo}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copiar link de indicação"
                          onClick={() => copyCode(codigo)}
                        >
                          {copiedCode === codigo ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Ver indicados"
                          onClick={() => openDetail(row)}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * pageSize + 1} até {Math.min((page + 1) * pageSize, totalFiltered)} de {totalFiltered} registros
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(0)}
              className="text-xs h-7"
            >
              Primeiro
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              if (pageNum >= totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 w-7 text-xs p-0"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
              className="text-xs h-7"
            >
              Último
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={open => { if (!open) { setDetailId(null); setDetailVendedor(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Indicados - {detailVendedor ? getField(detailVendedor, 2, 'vendedor') : ''}
              <span className="ml-2 text-sm text-muted-foreground font-normal">
                (Código: {detailVendedor ? getField(detailVendedor, 5, 'codigo') : ''})
              </span>
            </DialogTitle>
          </DialogHeader>

          {indicadosLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div>
              {(() => {
                const indRows = indicadosData?.aaData || indicadosData?.data || [];
                if (indRows.length === 0) {
                  return (
                    <div className="text-center p-8">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">Nenhum indicado encontrado</p>
                    </div>
                  );
                }
                return (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/50">
                          <TableHead className="text-xs font-semibold uppercase">ID</TableHead>
                          <TableHead className="text-xs font-semibold uppercase">Username</TableHead>
                          <TableHead className="text-xs font-semibold uppercase">CPF</TableHead>
                          <TableHead className="text-xs font-semibold uppercase">Cadastro</TableHead>
                          <TableHead className="text-xs font-semibold uppercase">Depósitos</TableHead>
                          <TableHead className="text-xs font-semibold uppercase">Apostas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indRows.map((r: any, i: number) => (
                          <TableRow key={i} className="hover:bg-secondary/30">
                            <TableCell className="text-sm font-mono">{getField(r, 0, 'id')}</TableCell>
                            <TableCell className="text-sm">{getField(r, 1, 'username')}</TableCell>
                            <TableCell className="text-sm font-mono">{getField(r, 2, 'cpf')}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{getField(r, 3, 'created_at')}</TableCell>
                            <TableCell className="text-sm font-semibold">{getField(r, 4, 'depositos')}</TableCell>
                            <TableCell className="text-sm font-semibold">{getField(r, 5, 'apostas')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
