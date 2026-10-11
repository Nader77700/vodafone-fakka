import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  FileCode,
  History,
  Phone,
} from 'lucide-react';
import type { WhatsAppMessage, WhatsAppStatusHistory } from './types';
import { supabase } from '@/db/supabase';

interface Props {
  messages: WhatsAppMessage[];
  loading: boolean;
  onRefresh: () => void;
  onRetryMessage?: (msg: WhatsAppMessage) => void;
}

export function WhatsAppMessageLogTab({
  messages,
  loading,
  onRefresh,
  onRetryMessage,
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);
  const [historyList, setHistoryList] = useState<WhatsAppStatusHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (typeFilter !== 'all' && m.message_type !== typeFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesPhone = m.recipient_phone?.toLowerCase().includes(term);
        const matchesWamid = m.wamid?.toLowerCase().includes(term);
        const matchesTemplate = m.template_name?.toLowerCase().includes(term);
        if (!matchesPhone && !matchesWamid && !matchesTemplate) return false;
      }
      return true;
    });
  }, [messages, statusFilter, typeFilter, searchTerm]);

  const handleOpenDetails = async (msg: WhatsAppMessage) => {
    setSelectedMessage(msg);
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('whatsapp_message_status_history')
        .select('*')
        .eq('message_id', msg.id)
        .order('event_timestamp', { ascending: true });

      setHistoryList(data || []);
    } catch {
      toast.error('فشل تحميل سجل تتبع الحالات');
    } finally {
      setLoadingHistory(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'read':
        return (
          <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 gap-1 text-[11px]">
            <Eye className="w-3 h-3" />
            تمت القراءة
          </Badge>
        );
      case 'delivered':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1 text-[11px]">
            <CheckCircle2 className="w-3 h-3" />
            تم التسليم
          </Badge>
        );
      case 'sent':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 gap-1 text-[11px]">
            <Send className="w-3 h-3" />
            تم الإرسال
          </Badge>
        );
      case 'accepted':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 gap-1 text-[11px]">
            <Clock className="w-3 h-3" />
            مقبولة من Meta
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 gap-1 text-[11px]">
            <XCircle className="w-3 h-3" />
            فشل
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-amber-400 border-amber-500/30 gap-1 text-[11px]">
            <Clock className="w-3 h-3" />
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Controls Bar */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الهاتف، WAMID، أو اسم القالب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9 text-xs"
              />
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-44">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="accepted">مقبولة (Accepted)</SelectItem>
                  <SelectItem value="sent">مُرسلة (Sent)</SelectItem>
                  <SelectItem value="delivered">مُستلمة (Delivered)</SelectItem>
                  <SelectItem value="read">مقروءة (Read)</SelectItem>
                  <SelectItem value="failed">فاشلة (Failed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="w-full md:w-40">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="النوع" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="template">قوالب (Template)</SelectItem>
                  <SelectItem value="text">نص حر (Text)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-1.5 shrink-0 text-xs w-full md:w-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Messages Table */}
      <Card className="border border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">سجل رسائل WhatsApp ({filteredMessages.length})</CardTitle>
            <CardDescription className="text-xs">
              جميع محاولات الإرسال وحالات التسليم والقراءة المستلمة عبر Webhook
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="p-3 font-medium whitespace-nowrap">رقم المستلم</th>
                  <th className="p-3 font-medium whitespace-nowrap">النوع / القالب</th>
                  <th className="p-3 font-medium whitespace-nowrap">الحالة الحالية</th>
                  <th className="p-3 font-medium whitespace-nowrap">معرف Meta (WAMID)</th>
                  <th className="p-3 font-medium whitespace-nowrap">توقيت الإنشاء</th>
                  <th className="p-3 font-medium whitespace-nowrap text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-muted-foreground">
                      لا توجد نتائج تطابق معايير البحث الحالية
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono font-medium whitespace-nowrap dir-ltr text-right">
                        {msg.recipient_phone}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {msg.message_type === 'template' ? 'قالب' : 'نص'}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {msg.template_name || 'نص مخصص'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {renderStatusBadge(msg.status)}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap max-w-[200px] truncate dir-ltr text-right">
                        {msg.wamid || '—'}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(msg.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-3 whitespace-nowrap text-left">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetails(msg)}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            التفاصيل
                          </Button>

                          {msg.status === 'failed' && onRetryMessage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRetryMessage(msg)}
                              className="h-7 px-2 text-xs gap-1 text-rose-400 hover:text-rose-300 border-rose-500/30"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              إعادة المحاولة
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Message Details Modal */}
      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary" />
              تفاصيل الرسالة وتتبع دورة الحياة
            </DialogTitle>
            <DialogDescription className="text-xs">
              معلومات الإرسال والردود المستلمة من Meta Graph API
            </DialogDescription>
          </DialogHeader>

          {selectedMessage && (
            <div className="space-y-4 py-2 text-xs">
              {/* Meta Identifiers */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                <div>
                  <span className="text-muted-foreground block text-[11px]">المستلم:</span>
                  <span className="font-mono font-bold text-sm dir-ltr block text-right">{selectedMessage.recipient_phone}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">الحالة:</span>
                  <div className="mt-1">{renderStatusBadge(selectedMessage.status)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[11px]">معرف Meta (WAMID):</span>
                  <span className="font-mono text-[11px] break-all block dir-ltr text-right">{selectedMessage.wamid || 'غير متوفر'}</span>
                </div>
              </div>

              {/* Status Timelines */}
              <Card className="border border-border">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-primary" />
                    المسار الزمني للأحداث (Audit Trail)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {loadingHistory ? (
                    <div className="py-4 text-center text-muted-foreground">جارٍ تحميل السجل...</div>
                  ) : historyList.length === 0 ? (
                    <div className="py-4 text-center text-muted-foreground">لا توجد أحداث إضافية مسجلة</div>
                  ) : (
                    <div className="space-y-2 border-r-2 border-primary/30 pr-3 mr-1 mt-2">
                      {historyList.map((h, i) => (
                        <div key={h.id || i} className="relative">
                          <span className="w-2 h-2 rounded-full bg-primary absolute -right-[17px] top-1.5" />
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">تحديث الحالة إلى: {h.status}</span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {new Date(h.event_timestamp).toLocaleTimeString('ar-EG')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Error Details if any */}
              {selectedMessage.error_message && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 space-y-1">
                  <span className="font-bold block">تفاصيل الخطأ المستلم:</span>
                  <p className="font-mono text-[11px] leading-relaxed">
                    [{selectedMessage.error_code}] {selectedMessage.error_message}
                  </p>
                </div>
              )}

              {/* Raw Response JSON */}
              {selectedMessage.meta_response && (
                <div className="space-y-1.5">
                  <span className="text-muted-foreground text-[11px] block">استجابة Meta Graph API الخام (JSON):</span>
                  <pre className="p-3 rounded-lg bg-black/60 border border-border text-[10px] font-mono overflow-x-auto max-h-48 text-emerald-400 dir-ltr text-left">
                    {JSON.stringify(selectedMessage.meta_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
