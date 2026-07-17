import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { ShieldAlert, RefreshCw, ChevronRight, HardDrive, Smartphone, FileWarning, Clock, MapPin, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function AdminCrashLogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crash_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      toast.error('حدث خطأ أثناء جلب سجلات الأعطال');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="min-h-screen bg-background pb-20" dir="rtl">
      {/* ── Header ── */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/admin')}
              className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                سجلات الأعطال (Crash Logs)
              </h1>
              <p className="text-xs text-muted-foreground">أحدث 100 خطأ مسجل في النظام</p>
            </div>
          </div>
          <button 
            onClick={loadLogs}
            disabled={loading}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto flex flex-col lg:flex-row gap-6">
        
        {/* القائمة */}
        <div className="w-full lg:w-1/3 flex flex-col gap-3">
          {loading && logs.length === 0 ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 bg-muted/40 rounded-xl" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 bg-muted/10 rounded-2xl border border-border/40">
              <FileWarning className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">لا توجد سجلات أعطال حالياً</p>
            </div>
          ) : (
            logs.map((log) => (
              <button
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className={`flex flex-col gap-2 p-3.5 rounded-xl border text-right transition-all text-sm w-full ${
                  selectedLog?.id === log.id 
                    ? 'bg-destructive/10 border-destructive/30' 
                    : 'bg-card border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex justify-between items-start w-full gap-2">
                  <span className="font-semibold text-destructive line-clamp-1 flex-1">
                    {log.exception_type || 'Unknown Error'}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap bg-background px-1.5 py-0.5 rounded border border-border/50">
                    {new Date(log.created_at).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {log.exception_message}
                </p>
                <div className="flex items-center gap-3 mt-1 pt-2 border-t border-border/30 w-full text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> {log.device_model || 'N/A'}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {log.current_route || 'N/A'}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* التفاصيل */}
        <div className="w-full lg:w-2/3">
          {selectedLog ? (
            <div className="bg-card border border-border rounded-2xl overflow-hidden sticky top-24">
              <div className="bg-destructive/10 border-b border-destructive/20 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-foreground">{selectedLog.exception_type || 'Unknown Exception'}</h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(selectedLog.created_at).toLocaleString('ar-EG')}
                    </p>
                  </div>
                </div>
                <div className="mt-4 bg-background/50 p-3 rounded-xl border border-destructive/10">
                  <p className="text-sm font-medium leading-relaxed font-mono text-destructive text-left dir-ltr">
                    {selectedLog.exception_message}
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-6">
                
                {/* معلومات الجهاز */}
                <section>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    معلومات الجهاز والبيئة
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <InfoBox label="الجهاز" value={selectedLog.device_model} />
                    <InfoBox label="نظام أندرويد" value={selectedLog.android_version} />
                    <InfoBox label="إصدار التطبيق" value={selectedLog.app_version} />
                    <InfoBox label="المسار الحالي" value={selectedLog.current_route} />
                    <InfoBox label="حالة الإنترنت" value={selectedLog.internet_state} />
                  </div>
                </section>

                {/* معلومات إضافية */}
                {selectedLog.additional_data && Object.keys(selectedLog.additional_data).length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      بيانات إضافية
                    </h3>
                    <div className="bg-muted/30 rounded-xl p-3 border border-border/50 overflow-x-auto">
                      <pre className="text-xs text-left dir-ltr text-muted-foreground m-0">
                        {JSON.stringify(selectedLog.additional_data, null, 2)}
                      </pre>
                    </div>
                  </section>
                )}

                {/* Stack Trace */}
                {selectedLog.stack_trace && (
                  <section>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      Stack Trace
                    </h3>
                    <div className="bg-[#0a0a0a] rounded-xl p-4 border border-border/50 overflow-x-auto">
                      <pre className="text-xs text-left dir-ltr text-gray-300 font-mono m-0 leading-relaxed">
                        {selectedLog.stack_trace}
                      </pre>
                    </div>
                  </section>
                )}

              </div>
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center bg-card border border-border rounded-2xl text-muted-foreground text-sm">
              اختر سجلاً من القائمة لعرض التفاصيل
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground line-clamp-1">{value || 'N/A'}</p>
    </div>
  );
}
