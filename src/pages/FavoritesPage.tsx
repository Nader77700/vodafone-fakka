// صفحة المفضلة — حفظ الأرقام المتكررة
import AppFooter from '@/components/common/AppFooter';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getFavorites, addFavorite, updateFavorite, deleteFavorite } from '@/lib/api';
import type { Favorite } from '@/types/types';
import { toast } from 'sonner';
import { Heart, Plus, Pencil, Trash2, Phone, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';

interface FavForm { name: string; phone_number: string; notes: string; }
const emptyForm: FavForm = { name: '', phone_number: '', notes: '' };

export default function FavoritesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Favorite | null>(null);
  const [form, setForm] = useState<FavForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const data = await getFavorites(user.id);
    setFavorites(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (fav: Favorite) => {
    setEditTarget(fav);
    setForm({ name: fav.name ?? '', phone_number: fav.phone_number, notes: fav.notes ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.phone_number.trim()) { toast.error('يرجى إدخال رقم الهاتف'); return; }
    if (!user) return;
    setSaving(true);
    if (editTarget) {
      const { error } = await updateFavorite(editTarget.id, form);
      if (error) { toast.error('فشل التعديل'); setSaving(false); return; }
      toast.success('تم التعديل بنجاح');
    } else {
      const { error } = await addFavorite(user.id, form);
      if (error) { toast.error('فشل الإضافة'); setSaving(false); return; }
      toast.success('تمت الإضافة للمفضلة');
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await deleteFavorite(deleteId);
    if (error) { toast.error('فشل الحذف'); }
    else { toast.success('تم الحذف'); }
    setDeleteId(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-5 page-enter">
      {/* الهيدر */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-black">المفضلة</h1>
        </div>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-9" onClick={openAdd}>
          <Plus className="w-4 h-4 ml-1" />
          إضافة
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Heart className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">لا توجد أرقام مفضلة</p>
            <p className="text-xs text-muted-foreground mt-1">أضف الأرقام المتكررة للشحن السريع</p>
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openAdd}>
            <Plus className="w-4 h-4 ml-1" /> إضافة رقم
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {favorites.map(fav => (
            <div key={fav.id} className="card-premium p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {fav.name && <p className="text-sm font-semibold truncate">{fav.name}</p>}
                <p className={`font-mono ${fav.name ? 'text-xs text-muted-foreground' : 'text-sm font-semibold'}`}>
                  {fav.phone_number}
                </p>
                {fav.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{fav.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-primary hover:bg-primary/10"
                  onClick={() => navigate('/home', { state: { prefillPhone: fav.phone_number } })}
                  title="شحن سريع"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => openEdit(fav)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteId(fav.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* حوار الإضافة/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'تعديل الرقم' : 'إضافة رقم جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">الاسم (اختياري)</Label>
              <Input
                className="bg-muted border-border text-right"
                placeholder="مثال: منزل، عمل..."
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">رقم الهاتف *</Label>
              <Input
                type="tel"
                className="bg-muted border-border"
                placeholder="01xxxxxxxxx"
                value={form.phone_number}
                onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">ملاحظات (اختياري)</Label>
              <Input
                className="bg-muted border-border text-right"
                placeholder="أي ملاحظات إضافية"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-border" onClick={() => setDialogOpen(false)}>
              <X className="w-4 h-4 ml-1" /> إلغاء
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSave} disabled={saving}>
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Check className="w-4 h-4 ml-1" /> حفظ</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرقم</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا الرقم من المفضلة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-border">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDelete}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AppFooter />
    </div>
  );
}
