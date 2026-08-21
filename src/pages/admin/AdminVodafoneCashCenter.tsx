import React, { useState, useEffect } from 'react';
import { ArrowLeft, Send, Phone, BarChart2, Search, Filter, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';

export default function AdminVodafoneCashCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'transfers' | 'recharges' | 'stats'>('transfers');
  
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransfers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vcc_transfers').select('*, profiles(full_name, phone)').order('created_at', { ascending: false });
    if (!error && data) {
      setTransfers(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'transfers') {
      fetchTransfers();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-black text-white pb-24 font-cairo">
      {/* ── Header ── */}
      <div className="bg-[#111] border-b border-white/10 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate('/admin')} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-lg font-bold">إدارة Vodafone Cash</h1>
          </div>
          <div className="w-10"></div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex px-4 gap-4 overflow-x-auto no-scrollbar border-b border-white/5">
          <button
            onClick={() => setActiveTab('transfers')}
            className={`whitespace-nowrap py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'transfers' ? 'border-[#E60000] text-[#E60000]' : 'border-transparent text-white/50 hover:text-white/80'}`}
          >
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              تحويل الأموال
            </div>
          </button>
          <button
            onClick={() => setActiveTab('recharges')}
            className={`whitespace-nowrap py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'recharges' ? 'border-[#E60000] text-[#E60000]' : 'border-transparent text-white/50 hover:text-white/80'}`}
          >
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              شحن الرصيد
            </div>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`whitespace-nowrap py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'stats' ? 'border-[#E60000] text-[#E60000]' : 'border-transparent text-white/50 hover:text-white/80'}`}
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              الإحصائيات
            </div>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Placeholder Content Based on Tab */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#111] p-4 rounded-xl border border-white/10">
              <p className="text-white/50 text-xs font-bold mb-1">إجمالي التحويلات</p>
              <p className="text-xl font-bold">0</p>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-white/10">
              <p className="text-white/50 text-xs font-bold mb-1">إجمالي الشحنات</p>
              <p className="text-xl font-bold">0</p>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-white/10">
              <p className="text-white/50 text-xs font-bold mb-1">عمليات ناجحة</p>
              <p className="text-xl font-bold text-green-500">0</p>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-white/10">
              <p className="text-white/50 text-xs font-bold mb-1">عمليات فاشلة</p>
              <p className="text-xl font-bold text-red-500">0</p>
            </div>
          </div>
        )}

        {(activeTab === 'transfers' || activeTab === 'recharges') && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="بحث برقم الهاتف..."
                  className="w-full bg-[#111] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#E60000] transition-colors placeholder:text-white/30"
                />
              </div>
              <button onClick={fetchTransfers} className="bg-[#111] border border-white/10 p-2.5 rounded-xl text-white/70 hover:text-white hover:border-white/30 transition-colors">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {activeTab === 'transfers' && (
              <div className="space-y-3 mt-4">
                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-[#E60000]" /></div>
                ) : transfers.length > 0 ? (
                  transfers.map(tr => (
                    <div key={tr.id} className="bg-[#111] p-4 rounded-xl border border-white/5 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-[#E60000]">{tr.amount} ج.م</div>
                        <div className="text-sm text-white/70">{tr.receiver_number}</div>
                        <div className="text-xs text-white/40 mt-1">{new Date(tr.created_at).toLocaleString('ar-EG')}</div>
                        {tr.profiles && <div className="text-xs text-white/50">{tr.profiles.full_name}</div>}
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-lg ${
                          tr.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          tr.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {tr.status === 'completed' ? 'ناجح' : tr.status === 'failed' ? 'فشل' : 'معلق'}
                        </span>
                        {tr.status === 'failed' && tr.failure_reason && (
                          <div className="text-[10px] text-red-400 mt-2 max-w-[120px] truncate">{tr.failure_reason}</div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-50">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                      <Send className="w-8 h-8 text-white/50" />
                    </div>
                    <p className="font-bold">لا توجد عمليات تحويل</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'recharges' && (
              <div className="flex flex-col items-center justify-center py-20 opacity-50">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Phone className="w-8 h-8 text-white/50" />
                </div>
                <p className="font-bold">لا توجد بيانات حالياً</p>
                <p className="text-xs mt-1 text-white/50">سيتم تفعيل النظام قريباً</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
