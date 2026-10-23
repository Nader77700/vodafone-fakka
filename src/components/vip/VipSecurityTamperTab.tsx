import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Ban,
  CheckCircle2,
  Lock,
  Cpu,
  Smartphone,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSecurityTamperEvents,
  type SecurityTamperEvent,
} from '@/services/vipDelegationService';
import { supabase } from '@/db/supabase';

export const VipSecurityTamperTab: React.FC = () => {
  const [events, setEvents] = useState<SecurityTamperEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getSecurityTamperEvents(100);
      setEvents(data);
    } catch (err) {
      console.error(err);
      toast.error('تعذر جلب سجلات الأمان');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleManualBanDevice = async (deviceId?: string) => {
    if (!deviceId) {
      toast.error('معرف الجهاز غير متوفر');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حظر الجهاز (${deviceId}) فورياً من السيرفر؟`)) return;

    try {
      const { error } = await supabase.from('device_bans').upsert({
        device_id: deviceId,
        reason: 'حظر يدوي من لوحة تحكم المالك بعد محاولة تلاعب',
        banned_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast.success('تم حظر الجهاز بنجاح!');
      loadEvents();
    } catch (err: any) {
      toast.error(err.message || 'فشل الحظر');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* البطاقة العلوية */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">سجل كشف التلاعب والحظر التلقائي (Zero-Trust)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              يراقب السيرفر أي محاولات لتعديل الـ APK، تجاوز الفواصل الزمنية، ادعاء صلاحيات أدمن، أو استدعاءات غير مصرح بها
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
          تحديث السجلات
        </Button>
      </div>

      {/* جدول الأحداث الأمنية */}
      <Card className="border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-destructive" />
            <span>محاولات التلاعب المرصودة ({events.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            كل محاولة تلاعب تؤدي تلقائياً إلى تعطيل تفويض المستخدم وسحب الجلسة وحظر الجهاز خادمياً
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-primary" />
              جاري فحص الأحداث الأمنية...
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50" />
              <p className="text-emerald-400 font-semibold">المنظومة آمنة تماماً</p>
              <p className="text-xs">لم يتم تسجيل أي محاولات تلاعب أو خروقات أمنية حتى الآن.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-3 pr-2 font-medium">الوقت</th>
                    <th className="pb-3 font-medium">نوع التلاعب</th>
                    <th className="pb-3 font-medium">الحساب المشبوه</th>
                    <th className="pb-3 font-medium">معرف الجهاز</th>
                    <th className="pb-3 font-medium">الإجراء المتخذ</th>
                    <th className="pb-3 pl-2 text-left font-medium">إجراء فوري</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                          {ev.event_type}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1 max-w-xs truncate">
                          {ev.details}
                        </div>
                      </td>
                      <td className="py-3 font-mono text-xs text-foreground">
                        {ev.user_email || 'غير مسجل'}
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {ev.device_id || '-'}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">
                          {ev.action_taken}
                        </Badge>
                      </td>
                      <td className="py-3 pl-2 text-left">
                        {ev.device_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleManualBanDevice(ev.device_id)}
                            className="text-destructive hover:bg-destructive/10 text-xs gap-1"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>حظر الجهاز</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
