import React, { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Shield, AlertTriangle, Ban, RefreshCw, Smartphone, Plus } from 'lucide-react';
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
        ban_reason: 'حظر يدوي من لوحة التحكم',
        ban_type: 'manual_burn',
        is_permanent: true,
        is_active: true
      });
      if (error) throw error;
      toast.success('تم إرسال إشارة التدمير للجهاز بنجاح');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'فشل في حظر الجهاز');
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-8" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-red-500" />
          لوحة تحكم الأمان والمراقبة
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => setBanDialogOpen(true)} variant="destructive" className="gap-2">
            <Plus className="w-4 h-4" />
            حظر جهاز جديد
          </Button>
          <button onClick={fetchData} className="p-2 bg-secondary rounded-full hover:bg-secondary/80">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>حظر جهاز يدوياً</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">معرف الجهاز (Device ID / Fingerprint)</label>
              <Input 
                placeholder="أدخل المعرف أو البصمة..." 
                value={banDeviceId}
                onChange={e => setBanDeviceId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">سبب الحظر (اختياري)</label>
              <Input 
                placeholder="سبب الحظر ليظهر للمستخدم..." 
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* سجلات الأمان */}
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="bg-muted p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              سجلات التلاعب والأمان
            </h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-3">الوقت</th>
                  <th className="p-3">الحدث</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3">بصمة الجهاز</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">لا توجد سجلات</td></tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="p-3 text-xs">{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                    <td className="p-3 text-red-500 font-medium">{log.action}</td>
                    <td className="p-3">{log.reason}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{log.device_fp?.slice(0, 8)}...</span>
                        {log.device_fp && (
                          <button 
                            onClick={() => banDevice(log.device_fp)}
                            className="px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 text-[10px]"
                          >
                            حرق الجهاز
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* الأجهزة المحظورة */}
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="bg-muted p-4 border-b">
            <h2 className="font-semibold flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              الأجهزة المحظورة نشطاً (Kill Switch)
            </h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-3">بصمة الجهاز</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3">تاريخ الحظر</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bannedDevices.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">لا توجد أجهزة محظورة</td></tr>
                )}
                {bannedDevices.map((device) => (
                  <tr key={device.id} className="hover:bg-muted/50">
                    <td className="p-3 font-mono text-xs flex items-center gap-1">
                      <Smartphone className="w-4 h-4 text-muted-foreground" />
                      {device.device_fp || device.hardware_hash || device.device_id}
                    </td>
                    <td className="p-3">{device.ban_reason}</td>
                    <td className="p-3 text-xs">{new Date(device.created_at).toLocaleString('ar-EG')}</td>
                    <td className="p-3">
                      <button 
                        onClick={() => unbanDevice(device.id)}
                        className="px-3 py-1 bg-green-500/10 text-green-500 rounded hover:bg-green-500/20 text-xs"
                      >
                        رفع الحظر
                      </button>
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