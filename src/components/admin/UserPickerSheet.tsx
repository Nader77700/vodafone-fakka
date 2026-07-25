// مكوّن اختيار المستخدمين — Multi-Select مع بحث لحظي
import { useState, useEffect, useCallback } from 'react';
import { Search, UserCheck, X, CheckSquare, Square, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAllProfilesForPicker } from '@/lib/api';
import type { Profile } from '@/types/types';

interface UserPickerSheetProps {
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

function getInitials(p: Profile): string {
  const name = p.username ?? p.full_name ?? p.email ?? '?';
  return name.slice(0, 2).toUpperCase();
}

export default function UserPickerSheet({ selectedIds, onSelect }: UserPickerSheetProps) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const data = await getAllProfilesForPicker(q);
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter(x => x !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  const selectAll = () => onSelect(users.map(u => u.id));
  const clearAll  = () => onSelect([]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الإيميل أو الهاتف..."
          className="bg-background border-border pr-9 h-9 text-sm"
        />
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs border-border gap-1" onClick={selectAll}>
          <CheckSquare className="w-3 h-3" /> تحديد الكل
        </Button>
        {selectedIds.length > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs border-border gap-1" onClick={clearAll}>
            <X className="w-3 h-3" /> إلغاء ({selectedIds.length})
          </Button>
        )}
        {selectedIds.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary mr-auto">
            {selectedIds.length} محدد
          </Badge>
        )}
      </div>

      {/* User list */}
      <div className="max-h-60 overflow-y-auto space-y-1 rounded-xl border border-border bg-muted/10 p-1">
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <Users className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">لا يوجد مستخدمون</p>
          </div>
        ) : users.map(u => {
          const selected = selectedIds.includes(u.id);
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className={cn(
                'w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-right',
                selected
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted/60 border border-transparent'
              )}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden border border-border">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-primary">{getInitials(u)}</span>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs font-semibold truncate">{u.username ?? u.full_name ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email ?? u.phone ?? u.id.slice(0,12)+'…'}</p>
              </div>
              {/* Check */}
              {selected
                ? <UserCheck className="w-4 h-4 text-primary shrink-0" />
                : <Square className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
