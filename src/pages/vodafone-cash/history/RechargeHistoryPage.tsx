import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Filter, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { RechargeBalance } from '../../../types/vodafoneCash';

export default function RechargeHistoryPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  // Dummy data for phase 1
  const history: RechargeBalance[] = [];

  return (
    <div className="min-h-screen bg-background pb-24 font-cairo">
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -mr-2 rounded-full hover:bg-muted active:bg-muted/70 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide text-foreground">سجل شحن الرصيد</h1>
            <p className="text-[10px] text-primary font-medium">Vodafone Cash</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="ابحث برقم الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-card border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <button className="bg-card border border-border p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* History List */}
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 opacity-60">
              <Clock className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">لا توجد عمليات شحن مسجلة بعد</p>
            </div>
          ) : (
            history.map((op) => (
              <div key={op.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    op.status === 'completed' ? 'bg-green-500/10 text-green-500'
                    : op.status === 'failed'    ? 'bg-red-500/10 text-red-500'
                    : 'bg-orange-500/10 text-orange-500'
                  }`}>
                    {op.status === 'completed' ? <CheckCircle2 className="w-5 h-5" />
                      : op.status === 'failed'  ? <XCircle className="w-5 h-5" />
                      : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{op.receiver_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(op.created_at).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">{op.amount} ج.م</p>
                  <p className={`text-[10px] ${
                    op.status === 'completed' ? 'text-green-500'
                    : op.status === 'failed'   ? 'text-red-500'
                    : 'text-orange-500'
                  }`}>
                    {op.status === 'completed' ? 'ناجحة' : op.status === 'failed' ? 'فاشلة' : 'قيد التنفيذ'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
