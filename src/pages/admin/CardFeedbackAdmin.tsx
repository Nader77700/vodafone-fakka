import { useState, useEffect } from 'react';
import { supabase } from '@/db/supabase';
import { formatEgyptDate, formatEgyptTime } from '@/lib/egyptTime';
import {
  MessageSquare, Image as ImageIcon, CheckCircle, XCircle, Clock,
  Filter, Search, AlertCircle, RefreshCw, Trash2, Edit3, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AdminShell, { SectionCard } from '@/components/admin/AdminShell';

interface CardFeedback {
  id: string;
  user_id: string;
  user_name: string;
  operation_id: string;
  card_type: string;
  operation_date: string;
  actual_units: number | null;
  actual_price: number | null;
  actual_validity_days: number | null;
  screenshot_url: string | null;
  status: 'new' | 'under_review' | 'applied' | 'rejected';
  admin_notes: string | null;
  created_at: string;
}

const STATUS_LABELS = {
  new: 'جديد',
  under_review: 'قيد المراجعة',
  applied: 'تم التطبيق',
  rejected: 'مرفوض'
};

const STATUS_COLORS = {
  new: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  under_review: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  applied: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  rejected: 'text-red-500 bg-red-500/10 border-red-500/20'
};

export default function CardFeedbackAdmin() {
  const [feedbacks, setFeedbacks] = useState<CardFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingFeedback, setEditingFeedback] = useState<CardFeedback | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState<CardFeedback['status']>('new');

  const loadFeedbacks = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('card_feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.or(`user_name.ilike.%${searchTerm}%,card_type.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setFeedbacks(data as CardFeedback[]);
    } catch (err: any) {
      toast.error('فشل في تحميل التقييمات', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [statusFilter, searchTerm]);

  const handleUpdate = async () => {
    if (!editingFeedback) return;
    
    try {
      const { error } = await supabase
        .from('card_feedbacks')
        .update({
          status: newStatus,
          admin_notes: adminNotes
        })
        .eq('id', editingFeedback.id);

      if (error) throw error;
      
      toast.success('تم التحديث بنجاح');
      setEditingFeedback(null);
      loadFeedbacks();
    } catch (err: any) {
      toast.error('فشل في التحديث', { description: err.message });
    }
  };

  const handleDelete = async (id: string, url: string | null) => {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم نهائياً؟')) return;

    try {
      const { error } = await supabase.from('card_feedbacks').delete().eq('id', id);
      if (error) throw error;

      if (url) {
        // محاولة حذف الصورة من Storage، لا نوقف العملية إذا فشل
        try {
          const path = url.split('/feedbacks/')[1];
          if (path) {
            await supabase.storage.from('feedbacks').remove([path]);
          }
        } catch (e) {
          console.error('Failed to delete image', e);
        }
      }

      toast.success('تم الحذف بنجاح');
      loadFeedbacks();
    } catch (err: any) {
      toast.error('فشل الحذف', { description: err.message });
    }
  };

  return (
    <AdminShell 
      title="تقييمات واقتراحات الكروت" 
      breadcrumbs={[
        { label: 'لوحة التحكم', href: '/admin' },
        { label: 'تقييمات الكروت' }
      ]}
    >
      <SectionCard title="لوحة التحكم بالتقييمات" icon={Filter}>
        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-2xl border border-border/50">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم المستخدم أو نوع الكارت..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-4 pr-10 bg-background/50 border-border/50"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[180px] bg-background/50 border-border/50">
            <SelectValue placeholder="حالة التقييم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الجميع</SelectItem>
            <SelectItem value="new">جديد</SelectItem>
            <SelectItem value="under_review">قيد المراجعة</SelectItem>
            <SelectItem value="applied">تم التطبيق</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={loadFeedbacks} variant="outline" size="icon" className="shrink-0" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {feedbacks.length === 0 && !loading ? (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border/50 rounded-2xl bg-card/20">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">لا توجد تقييمات مطابقة للبحث</p>
          </div>
        ) : (
          feedbacks.map((fb) => (
            <div key={fb.id} className="bg-card border border-border/50 rounded-2xl p-5 space-y-4 hover:border-primary/30 transition-colors shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm truncate max-w-[150px]">{fb.user_name}</h3>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatEgyptDate(fb.created_at)}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[fb.status]}`}>
                  {STATUS_LABELS[fb.status]}
                </span>
              </div>

              <div className="bg-background/50 rounded-xl p-3 border border-border/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الكارت:</span>
                  <span className="font-bold max-w-[140px] truncate">{fb.card_type}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الرقم المرجعي:</span>
                  <span className="font-mono text-[10px]">{fb.operation_id.slice(0, 10).toUpperCase()}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-primary/5 rounded-lg p-2 text-center border border-primary/10">
                  <p className="text-[10px] text-muted-foreground mb-1">الوحدات</p>
                  <p className="text-sm font-bold text-primary">{fb.actual_units ?? '-'}</p>
                </div>
                <div className="bg-primary/5 rounded-lg p-2 text-center border border-primary/10">
                  <p className="text-[10px] text-muted-foreground mb-1">السعر</p>
                  <p className="text-sm font-bold text-primary">{fb.actual_price ? `${fb.actual_price}ج` : '-'}</p>
                </div>
                <div className="bg-primary/5 rounded-lg p-2 text-center border border-primary/10">
                  <p className="text-[10px] text-muted-foreground mb-1">الصلاحية</p>
                  <p className="text-sm font-bold text-primary">{fb.actual_validity_days ? `${fb.actual_validity_days}ي` : '-'}</p>
                </div>
              </div>

              {fb.screenshot_url && (
                <div 
                  className="relative h-20 rounded-xl overflow-hidden cursor-pointer border border-border/50 group"
                  onClick={() => setSelectedImage(fb.screenshot_url)}
                >
                  <img src={fb.screenshot_url} alt="Screenshot" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="w-6 h-6 text-white" />
                  </div>
                </div>
              )}

              {fb.admin_notes && (
                <div className="bg-warning/5 rounded-lg p-3 border border-warning/20">
                  <p className="text-[10px] font-bold text-warning mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> ملاحظات الإدارة:
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{fb.admin_notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-border/50">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 h-9 gap-2"
                  onClick={() => {
                    setEditingFeedback(fb);
                    setNewStatus(fb.status);
                    setAdminNotes(fb.admin_notes || '');
                  }}
                >
                  <Edit3 className="w-3.5 h-3.5" /> إجراء
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive border-border/50"
                  onClick={() => handleDelete(fb.id, fb.screenshot_url)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl w-[95vw] p-1 bg-transparent border-none shadow-none">
          {selectedImage && (
            <img src={selectedImage} alt="Full Preview" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
          )}
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={!!editingFeedback} onOpenChange={(o) => !o && setEditingFeedback(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تحديث حالة التقييم</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground">حالة التقييم</label>
              <Select value={newStatus} onValueChange={(v: any) => setNewStatus(v)}>
                <SelectTrigger className="w-full h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">جديد</SelectItem>
                  <SelectItem value="under_review">قيد المراجعة</SelectItem>
                  <SelectItem value="applied">تم التطبيق بنجاح</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground">ملاحظات الإدارة (اختياري)</label>
              <Input
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="أضف ملاحظات تظهر للمستخدم أو للرجوع إليها لاحقاً..."
                className="h-12"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingFeedback(null)} className="h-11">
              إلغاء
            </Button>
            <Button onClick={handleUpdate} className="h-11">
              حفظ التحديثات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </SectionCard>
    </AdminShell>
  );
}