import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// الشكل الجديد يتضمن label حقيقي من RPC
interface AmountStat {
  amount: number;
  count: number;
  label?: string;
}

interface OperationsAmountsFilterProps {
  userId?: string;
  selectedAmount: number | null;
  onSelectAmount: (amount: number | null) => void;
}

export function OperationsAmountsFilter({ userId, selectedAmount, onSelectAmount }: OperationsAmountsFilterProps) {
  const [stats, setStats] = useState<AmountStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_operations_amounts_stats', {
        p_user_id: userId || null
      });
      if (!error && data) {
        setStats(data as AmountStat[]);
      }
      setLoading(false);
    }
    fetchStats();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  if (stats.length === 0) return null;

  const totalCount = stats.reduce((sum, s) => sum + Number(s.count), 0);

  return (
    <ScrollArea className="w-full whitespace-nowrap pb-2 -mb-2">
      <div className="flex w-max space-x-2 space-x-reverse p-1">
        <Badge
          variant={selectedAmount === null ? 'default' : 'outline'}
          className="cursor-pointer px-4 py-1.5 text-sm transition-colors hover:bg-primary/90"
          onClick={() => onSelectAmount(null)}
        >
          الكل ({totalCount})
        </Badge>
        {stats.map((stat) => (
          <Badge
            key={stat.amount}
            variant={selectedAmount === stat.amount ? 'default' : 'outline'}
            className="cursor-pointer px-4 py-1.5 text-sm transition-colors hover:bg-primary/90"
            onClick={() => onSelectAmount(stat.amount)}
          >
            {stat.label ?? `${stat.amount} جنيه`} ({stat.count})
          </Badge>
        ))}
      </div>
      <ScrollBar orientation="horizontal" className="h-2" />
    </ScrollArea>
  );
}
