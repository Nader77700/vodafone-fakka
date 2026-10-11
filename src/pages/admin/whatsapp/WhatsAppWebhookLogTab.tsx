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
import {
  Search,
  RefreshCw,
  Eye,
  ShieldCheck,
  ShieldAlert,
  FileJson,
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { WhatsAppWebhookEvent } from './types';

interface Props {
  events: WhatsAppWebhookEvent[];
  loading: boolean;
  onRefresh: () => void;
}

export function WhatsAppWebhookLogTab({
  events,
  loading,
  onRefresh,
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sigFilter, setSigFilter] = useState('all');
  const [procFilter, setProcFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState<WhatsAppWebhookEvent | null>(null);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (sigFilter === 'valid' && !ev.signature_valid) return false;
      if (sigFilter === 'invalid' && ev.signature_valid) return false;
      if (procFilter !== 'all' && ev.processing_status !== procFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesId = ev.event_id?.toLowerCase().includes(term);
        const matchesWamid = ev.wamid?.toLowerCase().includes(term);
        const matchesPhone = ev.recipient_or_sender?.toLowerCase().includes(term);
        if (!matchesId && !matchesWamid && !matchesPhone) return false;
      }
      return true;
    });
  }, [events, sigFilter, procFilter, searchTerm]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Search & Filters */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
              <Input
                placeholder="بحث بـ Event ID، WAMID، أو رقم الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-9 text-xs"
              />
            </div>

            {/* Signature Filter */}
            <div className="w-full md:w-44">
              <Select value={sigFilter} onValueChange={setSigFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="حالة التوقيع" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل التواقيع</SelectItem>
                  <SelectItem value="valid">توقيع موثق (HMAC Valid)</SelectItem>
                  <SelectItem value="invalid">توقيع غير موثق / ناقص</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Processing Filter */}
            <div className="w-full md:w-40">
              <Select value={procFilter} onValueChange={setProcFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="حالة المعالجة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="processed">تمت المعالجة (Processed)</SelectItem>
                  <SelectItem value="pending">معلق (Pending)</SelectItem>
                  <SelectItem value="failed">فشلت المعالجة (Failed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

      {/* Webhook Events Table */}
      <Card className="border border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">سجل أحداث Webhook ({filteredEvents.length})</CardTitle>
            <CardDescription className="text-xs">
              جميع الإشعارات المستلمة من Meta مع فحص التوقيع الرقمي ومعالجة التكرار (Idempotency)
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="p-3 font-medium whitespace-nowrap">معرف الحدث (Event ID)</th>
                  <th className="p-3 font-medium whitespace-nowrap">نوع الحدث</th>
                  <th className="p-3 font-medium whitespace-nowrap">التوقيع الرقمي</th>
                  <th className="p-3 font-medium whitespace-nowrap">حالة المعالجة</th>
                  <th className="p-3 font-medium whitespace-nowrap">توقيت الاستلام</th>
                  <th className="p-3 font-medium whitespace-nowrap text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-muted-foreground">
                      لا توجد أحداث Webhook مسجلة بعد. عند وصول أول إشعار من Meta ستظهر البيانات هنا فورياً.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap max-w-[220px] truncate dir-ltr text-right">
                        {ev.event_id}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px]">
                          {ev.event_type}
                        </Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {ev.signature_valid ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1 text-[10px]">
                            <ShieldCheck className="w-3 h-3" />
                            HMAC Valid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-400 border-amber-500/30 gap-1 text-[10px]">
                            <ShieldAlert className="w-3 h-3" />
                            Unverified
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {ev.processing_status === 'processed' ? (
                          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px]">
                            معالج بنجاح
                          </Badge>
                        ) : ev.processing_status === 'failed' ? (
                          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px]">
                            فشل المعالجة
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {ev.processing_status}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(ev.received_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-3 whitespace-nowrap text-left">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEvent(ev)}
                          className="h-7 px-2 text-xs gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          عرض الحمولة (Payload)
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              حمولة حدث الـ Webhook الخام (JSON)
            </DialogTitle>
            <DialogDescription className="text-xs">
              البيانات المستلمة مشفرة من Meta ومعالجة التكرار
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event ID:</span>
                  <span className="font-mono dir-ltr">{selectedEvent.event_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">نتيجة المعالجة:</span>
                  <span className="font-medium text-foreground">{selectedEvent.processing_result || 'تم الحفظ'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground text-[11px] block">البيانات الخام (Payload):</span>
                <pre className="p-3 rounded-lg bg-black/60 border border-border text-[10px] font-mono overflow-x-auto max-h-60 text-emerald-400 dir-ltr text-left">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
