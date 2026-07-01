// صفحة الإحصائيات
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserStatistics } from '@/lib/api';
import type { UserStatistics } from '@/types/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, CreditCard, Banknote, Phone,
  CalendarDays, CalendarCheck, Calendar, Clock
} from 'lucide-react';
import AppFooter from '@/components/common/AppFooter';
<<<<<<< HEAD
import { formatEgyptDateTime } from '@/lib/egyptTime';
=======
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, accent }: StatCardProps) {
  return (
    <div className={`card-premium p-4 space-y-2 h-full flex flex-col ${accent ? 'border-primary/30' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent ? 'bg-primary/20' : 'bg-muted'}`}>
        <Icon className={`w-5 h-5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <p className="text-2xl font-black text-balance">{value}</p>
      <p className="text-xs text-muted-foreground text-pretty flex-1">{label}</p>
      {sub && <p className="text-[11px] text-primary font-medium">{sub}</p>}
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#151523',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#fff',
  },
  cursor: { fill: 'rgba(230,0,0,0.08)' },
};

export default function StatisticsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserStatistics(user.id).then(s => { setStats(s); setLoading(false); });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = stats!;
  const hasData = s.total_operations > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 page-enter">
      {/* العنوان */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-black">الإحصائيات</h1>
      </div>

      {/* بطاقات الإجماليات */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Clock}      label="إجمالي العمليات"       value={s.total_operations}           accent />
        <StatCard icon={CreditCard} label="إجمالي الكروت الناجحة" value={s.total_cards} />
        <StatCard icon={Banknote}   label="إجمالي المبالغ"         value={`${s.total_amount.toFixed(2)} ج.م`} accent />
        <StatCard icon={Phone}      label="أرقام مستخدمة"          value={s.unique_phones} />
      </div>

      {/* بطاقات الفترات الزمنية */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground mb-3">عمليات حسب الفترة</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={CalendarDays}  label="اليوم"   value={s.today_operations}  />
          <StatCard icon={CalendarCheck} label="الأسبوع" value={s.week_operations}   />
          <StatCard icon={Calendar}      label="الشهر"   value={s.month_operations}  />
        </div>
      </div>

      {/* آخر عملية */}
      {s.last_operation && (
        <div className="card-premium p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">آخر عملية</h2>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold font-mono">{s.last_operation.phone_number}</p>
              <p className="text-xs text-muted-foreground">{s.last_operation.card_type ?? 'غير محدد'}</p>
            </div>
            <div className="text-left space-y-0.5 shrink-0">
              {s.last_operation.amount != null && s.last_operation.amount > 0 && (
                <p className="text-sm font-black text-primary">{s.last_operation.amount} ج.م</p>
              )}
              <p className="text-xs text-muted-foreground">
<<<<<<< HEAD
                {formatEgyptDateTime(s.last_operation.performed_at)}
=======
                {new Date(s.last_operation.performed_at).toLocaleString('en-GB', {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* مخطط العمليات اليومية */}
      <div className="card-premium p-4 space-y-3">
        <h2 className="text-sm font-bold">عمليات آخر 7 أيام</h2>
        {!hasData ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            لا توجد بيانات بعد
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={s.daily_chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [v, 'عمليات']}
                />
                <Bar
                  dataKey="count"
                  fill="#E60000"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* مخطط المبالغ اليومية */}
      <div className="card-premium p-4 space-y-3">
        <h2 className="text-sm font-bold">المبالغ آخر 7 أيام (ج.م)</h2>
        {!hasData ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            لا توجد بيانات بعد
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={s.daily_chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="amountGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#E60000" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#E60000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [`${v} ج.م`, 'المبالغ']}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#E60000"
                  strokeWidth={2}
                  fill="url(#amountGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <AppFooter />
    </div>
  );
}
