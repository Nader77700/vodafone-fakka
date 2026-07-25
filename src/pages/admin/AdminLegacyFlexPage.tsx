import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, Plus, Settings2, Eye, EyeOff, 
  Trash2, PauseCircle, PlayCircle, MoreVertical, 
  Zap, RefreshCw, AlertTriangle, Search, Clock, 
  ShieldAlert, Edit3, XCircle, Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/db/supabase';

export default function AdminLegacyFlexPage() {
  const navigate = useNavigate();
  const [systems, setSystems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Edit/Add State
  const [editingSystem, setEditingSystem] = useState<any | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const fetchSystems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('legacy_flex_systems').select('*').order('priority', { ascending: true });
    if (!error && data) {
      setSystems(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSystems();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSystem) return;

    if (editingSystem.id === 'new') {
      const { id, ...insertData } = editingSystem;
      await supabase.from('legacy_flex_systems').insert(insertData);
    } else {
      await supabase.from('legacy_flex_systems').update(editingSystem).eq('id', editingSystem.id);
    }
    
    setIsEditDialogOpen(false);
    fetchSystems();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('legacy_flex_systems').update({ status }).eq('id', id);
    fetchSystems();
  };

  const deleteSystem = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف النظام؟')) {
      await supabase.from('legacy_flex_systems').delete().eq('id', id);
      fetchSystems();
    }
  };

  const filteredSystems = systems.filter(sys => 
    sys.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm">
        <div className="flex items-center gap-3 px-4 h-16">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => navigate('/admin')}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-foreground">إدارة أنظمة فليكس القديمة</h1>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> متصل بقاعدة البيانات
            </p>
          </div>
          <Button size="sm" className="h-9 rounded-xl font-bold px-4 shadow-md bg-primary text-primary-foreground" onClick={() => {
            setEditingSystem({
              id: 'new', name: '', price: 0, flex_count: 0, system_id: '', bundle_id: '', product_id: '', status: 'active', priority: 100, color: '#E60000'
            });
            setIsEditDialogOpen(true);
          }}>
            <Plus className="w-4 h-4 ml-1.5" />
            نظام جديد
          </Button>
        </div>
      </div>

      {/* ── SEARCH & GLOBAL SETTINGS ── */}
      <div className="p-4 border-b border-border/40 bg-muted/10 space-y-3">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="ابحث عن نظام بالاسم..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-10 pr-9 bg-background border-border/50 focus-visible:ring-primary/20 rounded-xl text-sm shadow-sm"
          />
        </div>
      </div>

      {/* ── LIST ── */}
      <div className="flex-1 p-4">
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-sm font-bold text-foreground">قائمة الأنظمة ({filteredSystems.length})</h2>
          <span className="text-[10px] text-muted-foreground">الترتيب حسب الأولوية</span>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground font-bold">جاري التحميل...</div>
        ) : (
          <div className="space-y-3">
            {filteredSystems.map(sys => (
              <div key={sys.id} className="bg-card border border-border/50 hover:border-primary/30 transition-colors rounded-[16px] p-3 flex flex-col gap-3 shadow-sm relative overflow-hidden">
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-transparent flex items-center justify-center border border-primary/20 shrink-0">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-foreground flex items-center gap-2">
                        {sys.name}
                        {sys.status === 'hidden' && <EyeOff className="w-3 h-3 text-muted-foreground" />}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono bg-muted/50 inline-block px-1.5 rounded">{sys.product_id}</p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 rounded-full bg-muted/30">
                        <MoreVertical className="w-4 h-4 text-foreground/70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 rounded-xl border-border/50 shadow-xl">
                      <DropdownMenuItem className="text-xs font-semibold cursor-pointer py-2" onClick={() => {
                        setEditingSystem(sys);
                        setIsEditDialogOpen(true);
                      }}>
                        <Edit3 className="w-4 h-4 ml-2 text-primary" /> تعديل النظام
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-semibold cursor-pointer py-2" onClick={() => updateStatus(sys.id, sys.status === 'hidden' ? 'active' : 'hidden')}>
                        <Eye className="w-4 h-4 ml-2 text-info" /> {sys.status === 'hidden' ? 'إظهار النظام' : 'إخفاء النظام'}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-semibold cursor-pointer py-2 text-warning" onClick={() => updateStatus(sys.id, 'maintenance')}>
                        <AlertTriangle className="w-4 h-4 ml-2" /> وضع الصيانة
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-semibold cursor-pointer py-2 text-destructive" onClick={() => updateStatus(sys.id, 'disabled')}>
                        <PauseCircle className="w-4 h-4 ml-2" /> إيقاف مؤقت
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs font-semibold cursor-pointer py-2 text-destructive bg-destructive/5 hover:bg-destructive/10 mt-1" onClick={() => deleteSystem(sys.id)}>
                        <Trash2 className="w-4 h-4 ml-2" /> حذف النظام
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/40 rounded-lg p-2 flex flex-col justify-center border border-border/30">
                    <span className="text-[9px] text-muted-foreground font-bold mb-0.5">السعر</span>
                    <span className="text-xs font-black text-foreground">{sys.price} <span className="text-[9px] font-normal">ج.م</span></span>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2 flex flex-col justify-center border border-border/30">
                    <span className="text-[9px] text-muted-foreground font-bold mb-0.5">الفليكسات</span>
                    <span className="text-xs font-black text-foreground">{sys.flex_count?.toLocaleString()}</span>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2 flex flex-col justify-center border border-border/30">
                    <span className="text-[9px] text-muted-foreground font-bold mb-0.5">الحالة</span>
                    <AdminStatusBadge status={sys.status} />
                  </div>
                </div>
              </div>
            ))}
            {filteredSystems.length === 0 && (
              <div className="text-center py-10">
                <p className="text-sm font-bold text-muted-foreground">لم يتم العثور على أنظمة مطابقة.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[90vw] md:max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingSystem?.id === 'new' ? 'إضافة نظام جديد' : 'تعديل النظام'}</DialogTitle>
          </DialogHeader>
          {editingSystem && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">الاسم</label>
                <Input value={editingSystem.name} onChange={e => setEditingSystem({...editingSystem, name: e.target.value})} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">السعر</label>
                  <Input type="number" value={editingSystem.price} onChange={e => setEditingSystem({...editingSystem, price: Number(e.target.value)})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">عدد الفليكسات</label>
                  <Input type="number" value={editingSystem.flex_count} onChange={e => setEditingSystem({...editingSystem, flex_count: Number(e.target.value)})} required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">الوصف</label>
                <Input value={editingSystem.description || ''} onChange={e => setEditingSystem({...editingSystem, description: e.target.value})} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">System ID</label>
                  <Input value={editingSystem.system_id} onChange={e => setEditingSystem({...editingSystem, system_id: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">Bundle ID</label>
                  <Input value={editingSystem.bundle_id} onChange={e => setEditingSystem({...editingSystem, bundle_id: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">Product ID</label>
                  <Input value={editingSystem.product_id} onChange={e => setEditingSystem({...editingSystem, product_id: e.target.value})} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">الترتيب</label>
                  <Input type="number" value={editingSystem.priority} onChange={e => setEditingSystem({...editingSystem, priority: Number(e.target.value)})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">اللون</label>
                  <Input value={editingSystem.color} onChange={e => setEditingSystem({...editingSystem, color: e.target.value})} />
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="submit" className="w-full">
                  <Save className="w-4 h-4 ml-2" /> حفظ التعديلات
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string, color: string }> = {
    active: { label: 'متاح', color: 'text-success bg-success/10 border-success/20' },
    maintenance: { label: 'صيانة', color: 'text-warning bg-warning/10 border-warning/20' },
    hidden: { label: 'مخفي', color: 'text-muted-foreground bg-muted border-border' },
    coming_soon: { label: 'قريباً', color: 'text-primary bg-primary/10 border-primary/20' },
    disabled: { label: 'متوقف', color: 'text-muted-foreground bg-muted border-border' },
    subscription_required: { label: 'للمشتركين', color: 'text-info bg-info/10 border-info/20' },
    out_of_service: { label: 'خارج الخدمة', color: 'text-destructive bg-destructive/10 border-destructive/20' },
  };

  const c = configs[status] || configs['disabled'];

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${c.color} truncate max-w-full inline-block text-center`}>
      {c.label}
    </span>
  );
}