import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Shield, AlertTriangle, Ban, RefreshCw, Smartphone, Plus, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function SecurityDashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [bannedDevices, setBannedDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // لحظر جهاز يدوياً
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banDeviceId, setBanDeviceId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);

  // نافذة التفاصيل
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, bansRes] = await Promise.all([
        supabase.from('security_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('device_bans').select('*').eq('is_active', true).order('created_at', { ascending: false })
      ]);

      if (logsRes.error) throw logsRes.error;
      if (bansRes.error) throw bansRes.error;

      setLogs(logsRes.data || []);
      setBannedDevices(bansRes.data || []);
    } catch (err: any) {
      toast.error('فشل في تحميل بيانات الأمان');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const unbanDevice = async (id: string) => {
    try {
      const { error } = await supabase.from('device_bans').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      toast.success('تم رفع الحظر عن الجهاز');
      fetchData();
    } catch {
      toast.error('فشل في رفع الحظر');
    }
  };

  const manualBanDevice = async () => {
    if (!banDeviceId.trim()) return toast.error('يرجى إدخال معرف الجهاز أو البصمة');
    setBanning(true);
    try {
      const { error } = await supabase.from('device_bans').insert({
        device_id: banDeviceId.trim(),
        device_fp: banDeviceId.trim(),
        ban_reason: banReason.trim() || 'حظر يدوي من الإدارة',
        ban_type: 'manual_ban',
        is_permanent: true,
        is_active: true
      });
      if (error) throw error;
      toast.success('تم حظر الجهاز بنجاح');
      setBanDialogOpen(false);
      setBanDeviceId('');
      setBanReason('');
      fetchData();
    } catch (e: any) {
      toast.error('فشل حظر الجهاز: ' + e.message);
    } finally {
      setBanning(false);
    }
  };

  const banDevice = async (deviceFp: string) => {
    if (!confirm('هل أنت متأكد من حظر وحرق هذا الجهاز نهائياً؟ لن يتمكن من فتح التطبيق مرة أخرى.')) return;
    try {
      const { error } = await supabase.from('device_bans').insert({
        device_fp: deviceFp,
        ban_reason: 'حظر يدوي من لوحة التحكم بسبب سلوك مشبوه',
        ban_type: 'manual_burn',
        is_permanent: true,
        is_active: true
      });
      if (error) throw error;
      toast.success('تم إرسال إشارة التدمير للجهاز بنجاح');
      setSelectedLog(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'فشل في حظر الجهاز');
    }
  };

  const explainAction = (action: string) => {
    if (!action) return 'غير معروف';
    if (action.includes('ROOT_EMULATOR')) return 'محاولة استخدام التطبيق من جهاز مهكر (عليه Root) أو محاكي، مما يسهل اختراق التطبيق أو سرقة البيانات.';
    if (action.includes('DEVICE_HIJACK')) return 'محاولة سرقة أو الدخول إلى حساب مستخدم آخر من جهاز غير مصرح به أو مختلف عن جهازه الأصلي.';
    if (action.includes('UNOFFICIAL_APK')) return 'محاولة تشغيل التطبيق من خلال نسخة معدّلة أو مهكّرة أو غير رسمية، وليست النسخة الأصلية.';
    if (action.includes('SECURITY_BREACH')) return 'كشف اختراق أمني أو محاولة التلاعب بأكواد الحماية داخل التطبيق.';
    return 'سلوك مريب أو محاولة غير مصرح بها للوصول إلى بيانات حساسة.';
  };

  return (
    <div className="p-4 lg:p-8 space-y-8" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
          تحكم الأمان
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => setBanDialogOpen(true)} variant="destructive" className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">حظر جهاز</span>
          </Button>
          <button onClick={fetchData} className="p-2 bg-secondary rounded-xl hover:bg-secondary/80 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* نافذة الحظر اليدوي */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>حظر جهاز يدوياً</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">معرف الجهاز أو بصمته (Fingerprint)</label>
              <Input 
                placeholder="أدخل المعرف..." 
                value={banDeviceId}
                onChange={e => setBanDeviceId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">سبب الحظر (سيظهر للمستخدم)</label>
              <Input 
                placeholder="مثال: التلاعب في النظام" 
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={manualBanDevice} disabled={banning}>
              {banning ? 'جاري الحظر...' : 'تأكيد الحظر'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة التفاصيل */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" />
              تفاصيل المحاولة المريبة
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4">
            {selectedLog && (
              <>
                <div className="bg-red-500/10 text-red-600 p-4 rounded-xl space-y-2">
                  <h3 className="font-bold">التشخيص والتوضيح:</h3>
                  <p className="text-sm leading-relaxed">{explainAction(selectedLog.action)}</p>
                </div>

                <div className="space-y-3 bg-muted p-4 rounded-xl text-sm">
                  <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">نوع الحدث:</span>
                    <span className="col-span-2 font-bold text-red-500">{selectedLog.action}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">الوقت:</span>
                    <span className="col-span-2">{new Date(selectedLog.created_at).toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">التفاصيل التقنية:</span>
                    <span className="col-span-2 text-xs break-words">{selectedLog.reason}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">بصمة الجهاز (ID):</span>
                    <span className="col-span-2 text-xs font-mono break-all bg-background p-1 rounded">{selectedLog.device_fp || 'غير متوفر'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">الـ IP الخاص به:</span>
                    <span className="col-span-2 font-mono">{selectedLog.ip_address || 'غير مسجل'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">إصدار التطبيق:</span>
                    <span className="col-span-2 font-mono">{selectedLog.app_version || 'غير مسجل'}</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="mt-auto shrink-0 flex-row gap-2 border-t pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setSelectedLog(null)}>إغلاق</Button>
            {selectedLog?.device_fp && (
              <Button 
                variant="destructive" 
                className="flex-1" 
                onClick={() => banDevice(selectedLog.device_fp)}
              >
                حرق الجهاز نهائياً
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* سجلات الأمان */}
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-muted p-4 border-b shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              سجلات التلاعب
            </h2>
          </div>
          <div className="flex-1 overflow-x-auto min-h-0 bg-card">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-3 whitespace-nowrap">الوقت</th>
                  <th className="p-3 whitespace-nowrap">الحدث</th>
                  <th className="p-3 whitespace-nowrap">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">لا توجد سجلات</td></tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="p-3 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      <div className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleDateString('ar-EG')}</div>
                    </td>
                    <td className="p-3">
                      <span className="text-red-500 font-medium text-xs md:text-sm line-clamp-2" title={log.action}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-8 text-xs gap-1"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Info className="w-3.5 h-3.5" />
                        التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* الأجهزة المحظورة */}
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-muted p-4 border-b shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              الأجهزة المحظورة (Kill Switch)
            </h2>
          </div>
          <div className="flex-1 overflow-x-auto min-h-0 bg-card">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-3 whitespace-nowrap">الجهاز</th>
                  <th className="p-3 whitespace-nowrap">تاريخ الحظر</th>
                  <th className="p-3 whitespace-nowrap">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bannedDevices.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">لا توجد أجهزة محظورة</td></tr>
                )}
                {bannedDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-muted/50">
                    <td className="p-3">
                      <div className="font-mono text-xs text-muted-foreground line-clamp-1 max-w-[120px]" title={device.device_fp}>
                        {device.device_fp || device.hardware_hash || device.device_id}
                      </div>
                      <div className="text-xs text-red-400 mt-0.5 line-clamp-1 max-w-[150px]" title={device.ban_reason}>
                        {device.ban_reason}
                      </div>
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">{new Date(device.created_at).toLocaleDateString('ar-EG')}</td>
                    <td className="p-3 whitespace-nowrap">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 text-xs text-green-500 border-green-500/20 hover:bg-green-500/10"
                        onClick={() => unbanDevice(device.id)}
                      >
                        رفع الحظر
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}