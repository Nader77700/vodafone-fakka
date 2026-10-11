/**
 * WhatsAppCustomerPreferencesTab — إدارة تفضيلات وموافقة العملاء لكل خط
 */
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Users,
  Search,
  RotateCw,
  Edit2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Phone,
  Filter,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import type { WhatsAppCustomerPreference } from './types';

interface MonitoredLineWithPref {
  id: string;
  phone_number: string;
  customer_name: string | null;
  activation_day: number | null;
  system_status: string;
  merchant_name?: string | null;
  pref?: WhatsAppCustomerPreference | null;
}

export function WhatsAppCustomerPreferencesTab() {
  const [lines, setLines] = useState<MonitoredLineWithPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'consented' | 'opt_out' | 'paused'>('all');

  // Edit Modal State
  const [selectedItem, setSelectedItem] = useState<MonitoredLineWithPref | null>(null);
  const [editRecipient, setEditRecipient] = useState('');
  const [editConsent, setEditConsent] = useState<'consented' | 'opt_out' | 'pending'>('consented');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editPaused, setEditPaused] = useState(false);
  const [editPauseReason, setEditPauseReason] = useState('');
  const [editAllowConversion, setEditAllowConversion] = useState(true);
  const [editAllowRenewal, setEditAllowRenewal] = useState(true);
  const [editAllowInvoice, setEditAllowInvoice] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch monitored lines
      const { data: linesData, error: linesErr } = await supabase
        .from('vip_red_monitored_lines')
        .select('id, phone_number, customer_name, activation_day, system_status, merchant:vip_red_merchants(name)')
        .order('created_at', { ascending: false });

      if (linesErr) throw linesErr;

      // 2. Fetch preferences
      const { data: prefsData, error: prefsErr } = await supabase
        .from('whatsapp_customer_preferences')
        .select('*');

      if (prefsErr) throw prefsErr;

      const prefMap = new Map<string, WhatsAppCustomerPreference>();
      for (const p of prefsData || []) {
        if (p.entity_id) prefMap.set(p.entity_id, p);
        if (p.line_phone_number) prefMap.set(p.line_phone_number, p);
      }

      const combined: MonitoredLineWithPref[] = (linesData || []).map((line: any) => ({
        id: line.id,
        phone_number: line.phone_number,
        customer_name: line.customer_name,
        activation_day: line.activation_day,
        system_status: line.system_status,
        merchant_name: line.merchant?.name,
        pref: prefMap.get(line.id) || prefMap.get(line.phone_number) || null,
      }));

      setLines(combined);
    } catch (err: any) {
      toast.error('فشل تحميل قائمة العملاء: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openEditModal = (item: MonitoredLineWithPref) => {
    setSelectedItem(item);
    const p = item.pref;
    setEditRecipient(p?.whatsapp_recipient || item.phone_number);
    setEditConsent(p?.consent_status || 'pending');
    setEditEnabled(p ? p.is_enabled : true);
    setEditPaused(p ? p.is_paused : false);
    setEditPauseReason(p?.pause_reason || '');
    setEditAllowConversion(p ? p.allow_conversion_notif : true);
    setEditAllowRenewal(p ? p.allow_renewal_reminders : true);
    setEditAllowInvoice(p ? p.allow_invoice_reminders : true);
  };

  const handleSavePref = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      let cleanRecipient = editRecipient.replace(/[^0-9]/g, '');
      if (cleanRecipient.startsWith('01') && cleanRecipient.length === 11) {
        cleanRecipient = '20' + cleanRecipient.substring(1);
      } else if (cleanRecipient.startsWith('1') && cleanRecipient.length === 10) {
        cleanRecipient = '20' + cleanRecipient;
      }

      const payload = {
        entity_type: 'line',
        entity_id: selectedItem.id,
        line_phone_number: selectedItem.phone_number,
        customer_name: selectedItem.customer_name || selectedItem.merchant_name || 'عميل فودافون ريد',
        whatsapp_recipient: cleanRecipient,
        is_valid_number: cleanRecipient.length >= 10,
        consent_status: editConsent,
        consent_source: 'admin_portal_manual',
        is_enabled: editEnabled,
        is_paused: editPaused,
        pause_reason: editPaused ? editPauseReason : null,
        allow_conversion_notif: editAllowConversion,
        allow_renewal_reminders: editAllowRenewal,
        allow_invoice_reminders: editAllowInvoice,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('whatsapp_customer_preferences')
        .upsert(payload, { onConflict: 'entity_type,entity_id' });

      if (error) throw error;

      toast.success('تم تحديث تفضيلات العميل بنجاح');
      setSelectedItem(null);
      fetchData();
    } catch (err: any) {
      toast.error('فشل حفظ التفضيلات: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  // Filter lines
  const filteredLines = lines.filter((l) => {
    const matchesSearch =
      l.phone_number.includes(searchTerm) ||
      (l.customer_name && l.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.merchant_name && l.merchant_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.pref?.whatsapp_recipient && l.pref.whatsapp_recipient.includes(searchTerm));

    if (!matchesSearch) return false;

    if (statusFilter === 'consented') {
      return !l.pref || l.pref.consent_status === 'consented';
    }
    if (statusFilter === 'opt_out') {
      return l.pref?.consent_status === 'opt_out';
    }
    if (statusFilter === 'paused') {
      return l.pref?.is_paused === true;
    }
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            تفضيلات استلام الرسائل وموافقة العملاء (Customer Preferences)
          </h2>
          <p className="text-xs text-muted-foreground">
            تخصيص أرقام استلام الواتساب لكل خط، وإدارة الموافقة (Consent)، والإيقاف المؤقت، وتحديد فئات الرسائل المسموحة لكل عميل.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث القائمة
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الخط، اسم العميل، التاجر، أو رقم الواتساب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-9 text-xs"
          />
        </div>

        <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
          <SelectTrigger className="w-full md:w-48 text-xs">
            <SelectValue placeholder="تصفية حسب الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كافة العملاء والخطوط</SelectItem>
            <SelectItem value="consented">الموافقون (Consented)</SelectItem>
            <SelectItem value="opt_out">ملغى الاشتراك (Opt-Out)</SelectItem>
            <SelectItem value="paused">المتوقفون مؤقتاً (Paused)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table of Lines */}
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل / التاجر</TableHead>
                  <TableHead>الرقم المراقب</TableHead>
                  <TableHead>يوم التفعيل</TableHead>
                  <TableHead>رقم استلام WhatsApp</TableHead>
                  <TableHead>الموافقة (Consent)</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الفئات المسموحة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      جاري تحميل بيانات العملاء...
                    </TableCell>
                  </TableRow>
                ) : filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      لا توجد خطوط مطابقة لمعايير البحث الحالية.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLines.map((item) => {
                    const p = item.pref;
                    const recipient = p?.whatsapp_recipient || item.phone_number;
                    const isConsented = p?.consent_status === 'consented';
                    const isOptOut = p?.consent_status === 'opt_out';
                    const isPaused = p?.is_paused === true;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-xs text-foreground">
                            {item.customer_name || 'بدون اسم'}
                          </div>
                          {item.merchant_name && (
                            <div className="text-[10px] text-muted-foreground">تاجر: {item.merchant_name}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.phone_number}</TableCell>
                        <TableCell>
                          {item.activation_day ? (
                            <Badge variant="outline" className="text-[10px]">
                              يوم {item.activation_day}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="text-primary font-semibold">{recipient}</span>
                        </TableCell>
                        <TableCell>
                          {isConsented ? (
                            <Badge className="bg-emerald-600/10 text-emerald-600 border border-emerald-600/30 text-[10px]">
                              موافق (Consented)
                            </Badge>
                          ) : isOptOut ? (
                            <Badge variant="destructive" className="text-[10px]">
                              ملغى (Opt-Out)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-amber-600 border border-amber-500/30 text-[10px]">
                              بانتظار الموافقة (Pending)
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isPaused ? (
                            <Badge variant="secondary" className="text-amber-600 border border-amber-500/30 text-[10px]">
                              متوقف مؤقتاً
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                              نشط
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {(!p || p.allow_conversion_notif) && <Badge variant="secondary" className="text-[9px]">تحويل</Badge>}
                            {(!p || p.allow_renewal_reminders) && <Badge variant="secondary" className="text-[9px]">تجديد</Badge>}
                            {(!p || p.allow_invoice_reminders) && <Badge variant="secondary" className="text-[9px]">فواتير</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-left">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(item)}
                            className="gap-1 text-xs"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-primary" />
                            تعديل
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Preferences Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5 text-primary" />
              تعديل تفضيلات المستلم: {selectedItem?.phone_number}
            </DialogTitle>
            <DialogDescription className="text-xs">
              التحكم في رقم هاتف استلام واتساب، وتصريح الإرسال، وإيقاف الرسائل المخصص لهذا الخط.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs">رقم هاتف استلام واتساب (مصر: +20)</Label>
                <Input
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  placeholder="010xxxxxxxx أو 2010xxxxxxxx"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  يمكن توجيه إشعارات الخط لرقم واتساب آخر (مثلاً رقم التاجر أو المالك الرئيسي).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">حالة الموافقة (Consent)</Label>
                  <Select value={editConsent} onValueChange={(val: any) => setEditConsent(val)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consented">موافق على الاستلام (Consented)</SelectItem>
                      <SelectItem value="opt_out">إلغاء الاشتراك (Opt-Out)</SelectItem>
                      <SelectItem value="pending">بانتظار التأكيد (Pending)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">تفعيل الإشعارات للخط</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
                    <span className="text-xs">{editEnabled ? 'مفعل' : 'معطل كلياً'}</span>
                  </div>
                </div>
              </div>

              {/* Pause Settings */}
              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <PauseCircle className="w-4 h-4 text-amber-500" />
                    إيقاف مؤقت لهذا الخط (Pause Notifications)
                  </Label>
                  <Switch checked={editPaused} onCheckedChange={setEditPaused} />
                </div>
                {editPaused && (
                  <Input
                    placeholder="سبب الإيقاف المؤقت (مثلاً: طلب العميل إيقاف الرسائل هذا الأسبوع)..."
                    value={editPauseReason}
                    onChange={(e) => setEditPauseReason(e.target.value)}
                    className="text-xs mt-2"
                  />
                )}
              </div>

              {/* Category Switches */}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-xs font-semibold">فئات الرسائل المصرح بها للعميل:</Label>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border">
                    <span>إشعارات التحويل المؤكد إلى RED</span>
                    <Switch checked={editAllowConversion} onCheckedChange={setEditAllowConversion} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border">
                    <span>تذكيرات تجديد الباقة (المسبقة ويوم الموعد)</span>
                    <Switch checked={editAllowRenewal} onCheckedChange={setEditAllowRenewal} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-card border border-border">
                    <span>تذكيرات وسداد الفواتير</span>
                    <Switch checked={editAllowInvoice} onCheckedChange={setEditAllowInvoice} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
                  إلغاء
                </Button>
                <Button size="sm" onClick={handleSavePref} disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'جاري الحفظ...' : 'حفظ التفضيلات'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
