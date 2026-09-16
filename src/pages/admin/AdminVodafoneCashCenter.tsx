import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Phone, BarChart2, Search, RefreshCw, Loader2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VodafoneCashService } from '@/services/vodafone-cash/VodafoneCashService';
import type { VodafoneCashCenterStats } from '@/types/vodafoneCash';

export default function AdminVodafoneCashCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'transfers' | 'recharges' | 'stats'>('transfers');

  const [transfers, setTransfers]   = useState<any[]>([]);
  const [recharges, setRecharges]   = useState<any[]>([]);
  const [stats, setStats]           = useState<VodafoneCashCenterStats | null>(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');

  const fetchData = useCallback(async (tab: typeof activeTab) => {
    setLoading(true);
    try {
      if (tab === 'transfers') {
        const data = await VodafoneCashService.getTransferHistory();
        setTransfers(data);
      } else if (tab === 'recharges') {
        const data = await VodafoneCashService.getRechargeHistory();
        setRecharges(data);
      } else {
        const data = await VodafoneCashService.getAdminStats();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(activeTab); }, [activeTab, fetchData]);

  const filtered = (list: any[]) => {
    if (!search.trim()) return list;
    const q = search.trim();
    return list.filter(r =>
      r.receiver_number?.includes(q) ||
      r.profiles?.full_name?.includes(q) ||
      r.profiles?.username?.includes(q)
    );
  };

  const statusBadge = (status: string, failureReason?: string) => (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-xs px-2 py-1 rounded-lg font-bold ${
        status === 'completed' ? 'bg-green-500/20 text-green-400' :
        status === 'failed'    ? 'bg-red-500/20 text-red-400' :
                                 'bg-yellow-500/20 text-yellow-400'
      }`}>
        {status === 'completed' ? 'ناجح' : status === 'failed' ? 'فشل' : 'معلق'}
      </span>
      {status === 'failed' && failureReason && (
        <span className="text-xs text-red-400 max-w-[130px] text-right leading-tight">{failureReason}</span>
      )}
    </div>
  );

  const renderList = (list: any[], emptyIcon: React.ReactNode, emptyLabel: string) => {
    const rows = filtered(list);
    if (loading) return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[#E60000]" />
      </div>
    );
    if (rows.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 opacity-40">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          {emptyIcon}
        </div>
        <p className="font-bold">{emptyLabel}</p>
      </div>
    );
    return (
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="bg-[#111] p-4 rounded-xl border border-white/5 flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="font-bold text-[#E60000] text-base">{Number(r.amount).toLocaleString('ar-EG')} ج.م</div>
              <div className="text-sm text-white/80 mt-0.5">{r.receiver_number}</div>
              <div className="text-xs text-white/40 mt-1">{new Date(r.created_at).toLocaleString('ar-EG')}</div>
              {r.profiles && (
                <div className="text-xs text-white/50 mt-0.5">
                  {r.profiles.full_name}{r.profiles.username ? ` · @${r.profiles.username}` : ''}
                </div>
              )}
            </div>
            <div className="shrink-0">{statusBadge(r.status, r.failure_reason)}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24 font-cairo">
      {/* ── Header ── */}
      <div className="bg-[#111] border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate('/admin')} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold flex-1 text-center">إدارة Vodafone Cash</h1>
          <div className="w-10" />
        </div>

        <div className="flex px-4 gap-4 overflow-x-auto no-scrollbar border-b border-white/5">
          {([
            { key: 'transfers', label: 'تحويل الأموال', icon: <Send className="w-4 h-4" /> },
            { key: 'recharges', label: 'شحن الرصيد',    icon: <Phone className="w-4 h-4" /> },
            { key: 'stats',     label: 'الإحصائيات',    icon: <BarChart2 className="w-4 h-4" /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === t.key ? 'border-[#E60000] text-[#E60000]' : 'border-transparent text-white/50 hover:text-white/80'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── بحث + تحديث (للقوائم فقط) ── */}
        {activeTab !== 'stats' && (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث برقم الهاتف أو الاسم..."
                className="w-full bg-[#111] border border-white/10 rounded-xl py-2.5 pr-10 pl-4 text-sm outline-none focus:border-[#E60000] transition-colors placeholder:text-white/30 text-right"
              />
            </div>
            <button onClick={() => fetchData(activeTab)}
              className="bg-[#111] border border-white/10 p-2.5 rounded-xl text-white/70 hover:text-white hover:border-white/30 transition-colors">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* ── تحويلات ── */}
        {activeTab === 'transfers' && renderList(transfers, <Send className="w-8 h-8 text-white/50" />, 'لا توجد عمليات تحويل')}

        {/* ── شحنات ── */}
        {activeTab === 'recharges' && renderList(recharges, <Phone className="w-8 h-8 text-white/50" />, 'لا توجد عمليات شحن')}

        {/* ── إحصائيات ── */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => fetchData('stats')}
                className="flex items-center gap-2 text-xs text-white/50 hover:text-white bg-[#111] border border-white/10 px-3 py-2 rounded-xl transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#E60000]" /></div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'إجمالي التحويلات',   value: stats.total_transfers,          color: 'text-white' },
                    { label: 'إجمالي الشحنات',      value: stats.total_recharges,           color: 'text-white' },
                    { label: 'عمليات ناجحة',        value: stats.successful_operations,     color: 'text-green-400' },
                    { label: 'عمليات فاشلة',        value: stats.failed_operations,         color: 'text-red-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#111] p-4 rounded-xl border border-white/10">
                      <p className="text-white/50 text-xs font-bold mb-2">{s.label}</p>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString('ar-EG')}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'إجمالي مبلغ التحويلات (الناجحة)', value: stats.total_amount_transferred, icon: <Send className="w-4 h-4" /> },
                    { label: 'إجمالي مبلغ الشحنات (الناجحة)',   value: stats.total_amount_recharged,   icon: <Phone className="w-4 h-4" /> },
                  ].map(s => (
                    <div key={s.label} className="bg-[#111] p-4 rounded-xl border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-white/50">
                        {s.icon}
                        <span className="text-sm font-bold">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4 text-[#E60000]" />
                        <span className="text-lg font-bold text-[#E60000]">
                          {s.value.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* معدل النجاح */}
                {stats.total_transfers + stats.total_recharges > 0 && (() => {
                  const total = stats.total_transfers + stats.total_recharges;
                  const rate  = Math.round((stats.successful_operations / total) * 100);
                  return (
                    <div className="bg-[#111] p-4 rounded-xl border border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-white/50 font-bold">معدل نجاح العمليات</span>
                        <span className={`text-sm font-bold ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{rate}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <BarChart2 className="w-12 h-12 mb-3" />
                <p className="font-bold">تعذر تحميل الإحصائيات</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


