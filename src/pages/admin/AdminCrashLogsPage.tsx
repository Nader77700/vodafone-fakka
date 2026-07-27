import { useState, useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { ShieldAlert, Trash2, Search, User as UserIcon, Calendar, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AdminCrashLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crash_logs')
        .select(`
          *,
          user:profiles (
            full_name,
            phone
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      toast.error(err.message || 'فشل جلب سجل الأعطال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const clearAllLogs = async () => {
    if (!confirm('هل أنت متأكد من مسح جميع سجلات الأعطال؟ لا يمكن التراجع عن هذه الخطوة.')) return;
    try {
      const { error } = await supabase.from('crash_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success('تم مسح جميع السجلات بنجاح');
      fetchLogs();
    } catch (err: any) {
      toast.error('فشل المسح: ' + err.message);
    }
  };

  const filteredLogs = logs.filter(l => 
    l.error_message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.component_stack?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.user?.phone?.includes(searchTerm)
  );

  return (
    <div className="flex flex-col min-h-full pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            سجل الأخطاء الشامل
          </h1>
          <p className="text-xs text-muted-foreground mt-1">تتبع الأعطال والمشاكل التقنية عند المستخدمين</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
          <Button variant="destructive" size="sm" onClick={clearAllLogs}>
            <Trash2 className="w-4 h-4 mr-2" />
            مسح الكل
          </Button>
        </div>
      </div>

      <div className="px-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
          <Input 
            placeholder="بحث في الخطأ، المكون، أو بيانات المستخدم..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-4 pr-10 text-sm h-10 bg-card border-border/50"
          />
        </div>
      </div>

      <div className="px-4 space-y-3">
        {loading ? (
          <div className="text-center py-10"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 bg-card rounded-2xl border border-border/50">
            <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-muted-foreground">لا توجد أخطاء مسجلة حالياً</p>
          </div>
        ) : (
          filteredLogs.map(log => (
            <div 
              key={log.id} 
              onClick={() => setSelectedLog(log)}
              className="bg-card border border-destructive/20 rounded-2xl p-4 cursor-pointer hover:border-destructive/50 transition-colors shadow-sm relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-1 h-full bg-destructive" />
              
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-bold text-destructive line-clamp-1 flex-1 ml-4" dir="ltr">
                  {log.error_message || 'Unknown Error'}
                </p>
                <div className="text-[10px] text-muted-foreground shrink-0 text-left" dir="ltr">
                  {new Date(log.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground mt-2">
                {log.user ? (
                  <div className="flex items-center gap-1 text-primary">
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>{log.user.full_name} ({log.user.phone})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>زائر / غير مسجل</span>
                  </div>
                )}
                
                <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md text-[10px]">
                  <span>v{log.app_version || '?'}</span>
                </div>
                
                <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md text-[10px]" dir="ltr">
                  <span>{log.os_info || 'Unknown OS'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal التفاصيل */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div 
            className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-border/50 p-4 flex justify-between items-center z-10">
              <h3 className="font-bold text-lg text-destructive">تفاصيل العطل</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedLog(null)}>
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* User Info */}
              <div className="bg-muted/50 rounded-xl p-3 border border-border/50 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-[10px] mb-0.5">المستخدم</span>
                  <span className="font-medium text-foreground">{selectedLog.user ? selectedLog.user.full_name : 'غير مسجل'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] mb-0.5">رقم الهاتف</span>
                  <span className="font-medium text-foreground" dir="ltr">{selectedLog.user ? selectedLog.user.phone : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] mb-0.5">وقت العطل</span>
                  <span className="font-medium text-foreground text-xs" dir="ltr">{new Date(selectedLog.created_at).toLocaleString('en-US')}</span>
                </div>
              </div>

              {/* Error Details */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-foreground flex items-center gap-2">
                  رسالة الخطأ
                </h4>
                <div className="bg-destructive/10 text-destructive p-3 rounded-xl text-sm font-mono whitespace-pre-wrap border border-destructive/20" dir="ltr">
                  {selectedLog.error_message}
                </div>
              </div>

              {/* Component Stack */}
              {selectedLog.component_stack && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-foreground">مكان الخطأ في الكود (Component Stack)</h4>
                  <div className="bg-[#1e1e1e] text-orange-300 p-3 rounded-xl text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-border/50" dir="ltr">
                    {selectedLog.component_stack}
                  </div>
                </div>
              )}

              {/* Device Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                  <span className="text-muted-foreground block text-[10px] mb-1">نسخة التطبيق</span>
                  <span className="font-medium text-sm" dir="ltr">v{selectedLog.app_version || 'Unknown'}</span>
                </div>
                <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                  <span className="text-muted-foreground block text-[10px] mb-1">نظام التشغيل والجهاز</span>
                  <span className="font-medium text-sm" dir="ltr">{selectedLog.os_info || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}