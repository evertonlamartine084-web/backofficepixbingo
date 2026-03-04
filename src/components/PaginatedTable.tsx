import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginatedTableProps {
  data: any[];
  columns: string[];
  formatCell: (key: string, value: any) => string;
  formatLabel: (key: string) => string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export function PaginatedTable({
  data,
  columns,
  formatCell,
  formatLabel,
  pageSizeOptions = [10, 25, 50],
  defaultPageSize = 10,
}: PaginatedTableProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const start = page * pageSize;
  const pageData = data.slice(start, start + pageSize);

  const handlePageSizeChange = (v: string) => {
    setPageSize(Number(v));
    setPage(0);
  };

  const maxButtons = 5;
  const pageButtons = (() => {
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i);
    const buttons: (number | '...')[] = [0];
    let startP = Math.max(1, page - 1);
    let endP = Math.min(totalPages - 2, page + 1);
    if (page <= 2) { startP = 1; endP = 3; }
    if (page >= totalPages - 3) { startP = totalPages - 4; endP = totalPages - 2; }
    startP = Math.max(1, startP);
    endP = Math.min(totalPages - 2, endP);
    if (startP > 1) buttons.push('...');
    for (let i = startP; i <= endP; i++) buttons.push(i);
    if (endP < totalPages - 2) buttons.push('...');
    buttons.push(totalPages - 1);
    return buttons;
  })();

  if (data.length === 0) return null;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              {columns.map(k => (
                <TableHead key={k} className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                  {formatLabel(k)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((item: any, i: number) => (
              <TableRow key={i} className="hover:bg-secondary/30">
                {columns.map(k => (
                  <TableCell key={k} className="text-xs font-mono whitespace-nowrap">
                    {formatCell(k, item[k])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between gap-4 pt-3 px-1 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Linhas por página:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-7 w-16 text-xs bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map(s => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-2">{start + 1}-{Math.min(start + pageSize, data.length)} de {data.length}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {pageButtons.map((p, i) =>
            p === '...' ? (
              <span key={`dots-${i}`} className="text-xs text-muted-foreground px-1">…</span>
            ) : (
              <Button
                key={p}
                variant={page === p ? 'default' : 'ghost'}
                size="icon"
                className={`h-7 w-7 text-xs ${page === p ? 'gradient-primary border-0' : ''}`}
                onClick={() => setPage(p as number)}
              >
                {(p as number) + 1}
              </Button>
            )
          )}
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
