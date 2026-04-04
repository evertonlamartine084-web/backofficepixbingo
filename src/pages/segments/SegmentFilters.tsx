import { Users, Trash2, ChevronRight, Loader2, Hash, Calendar, Zap, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/formatters';
import type { SegmentRow, AllUserItem } from './types';
import { ALL_USERS_ID } from './types';

interface SegmentFiltersProps {
  segments: SegmentRow[] | undefined;
  isLoading: boolean;
  selectedSegment: string | null;
  setSelectedSegment: (id: string | null) => void;
  allUsersItems: AllUserItem[] | undefined;
  deleteMut: { mutate: (id: string) => void };
}

export function SegmentFilters({
  segments, isLoading, selectedSegment, setSelectedSegment,
  allUsersItems, deleteMut,
}: SegmentFiltersProps) {
  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* All Users */}
          <button
            onClick={() => setSelectedSegment(ALL_USERS_ID)}
            className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${selectedSegment === ALL_USERS_ID ? 'border-primary/50 bg-primary/5' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> All Users
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">Todos os jogadores da plataforma</p>
                <div className="flex items-center gap-3 mt-2">
                  <Badge variant="secondary" className="text-xs"><Hash className="w-3 h-3 mr-1" />{allUsersItems?.length || '\u2014'} jogadores</Badge>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSegment === ALL_USERS_ID ? 'rotate-90' : ''}`} />
            </div>
          </button>

          {segments?.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum segmento criado</p>
            </div>
          ) : (
            segments?.map((seg: SegmentRow) => (
              <button
                key={seg.id}
                onClick={() => setSelectedSegment(seg.id)}
                className={`w-full glass-card p-4 text-left transition-all hover:border-primary/30 group ${selectedSegment === seg.id ? 'border-primary/50 bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color || '#6d28d9' }} />
                      {seg.name}
                      {seg.segment_type === 'automatic' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400">
                          <Zap className="w-2.5 h-2.5 mr-0.5" /> Auto
                        </Badge>
                      )}
                    </p>
                    {seg.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{seg.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <Hash className="w-3 h-3 mr-1" />
                        {seg.member_count || seg.item_count} {seg.segment_type === 'automatic' ? 'jogadores' : 'CPFs'}
                      </Badge>
                      {seg.segment_type === 'automatic' && seg.rules && seg.rules.length > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                          <Filter className="w-2.5 h-2.5 mr-0.5" /> {seg.rules.length} regra{seg.rules.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {seg.auto_refresh && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400">
                          <RefreshCw className="w-2.5 h-2.5 mr-0.5" /> Auto
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{formatDateTime(seg.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteMut.mutate(seg.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSegment === seg.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </button>
            ))
          )}
        </>
      )}
    </div>
  );
}
