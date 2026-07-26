// مدير روابط التنقل — يعرض جميع صفحات التطبيق
import { useState } from 'react';
import { Copy, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { APP_PAGES } from './DeepLinkSelect';

// Route list enriched with extra details
const ROUTE_DETAILS: Record<string, { access: string; usedIn: string }> = {
  '/home':                 { access: 'مستخدم مسجّل',     usedIn: 'الصفحة الرئيسية · التنقل السفلي' },
  '/recharge':             { access: 'مستخدم مسجّل',     usedIn: 'شحن الأرقام · التنقل السفلي' },
  '/notifications':        { access: 'مستخدم مسجّل',     usedIn: 'قائمة التنقل · Deep Links' },
  '/settings':             { access: 'مستخدم مسجّل',     usedIn: 'إعدادات الحساب · التنقل السفلي' },
  '/subscription-history': { access: 'مستخدم مسجّل',     usedIn: 'الاشتراكات · إشعارات التجديد' },
  '/operations':           { access: 'مستخدم مسجّل',     usedIn: 'سجل العمليات · التنقل السفلي' },
  '/statistics':           { access: 'مستخدم مسجّل',     usedIn: 'الإحصائيات الشخصية' },
  '/favorites':            { access: 'مستخدم مسجّل',     usedIn: 'الأرقام المفضلة · التنقل' },
  '/build-info':           { access: 'مستخدم مسجّل',     usedIn: 'إشعارات التحديث · معلومات الإصدار' },
  '/admin':                { access: 'مسؤول / سوبر أدمن', usedIn: 'لوحة تحكم المسؤول' },
  '/system-logs':          { access: 'مسؤول / سوبر أدمن', usedIn: 'سجلات النظام التفصيلية' },
};

export default function NavLinksManager() {
  const [search, setSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const filtered = APP_PAGES.filter(p =>
    !search.trim() ||
    p.label.includes(search) ||
    p.path.includes(search) ||
    (p.description ?? '').includes(search)
  );

  const copy = async (path: string) => {
    await navigator.clipboard.writeText(path);
    setCopiedPath(path);
    toast.success(`تم نسخ: ${path}`);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="ابحث عن صفحة..."
        className="bg-background border-border h-9 text-sm"
      />

      {/* Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{filtered.length} صفحة</Badge>
        <Badge variant="outline" className="text-[10px] border-success/40 text-success">
          {filtered.filter(p => !ROUTE_DETAILS[p.path]?.access.includes('مسؤول')).length} عامة
        </Badge>
        <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
          {filtered.filter(p => ROUTE_DETAILS[p.path]?.access.includes('مسؤول')).length} مسؤول فقط
        </Badge>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-right p-3 text-xs font-bold text-muted-foreground whitespace-nowrap">الصفحة</th>
              <th className="text-right p-3 text-xs font-bold text-muted-foreground whitespace-nowrap">الرابط</th>
              <th className="text-right p-3 text-xs font-bold text-muted-foreground whitespace-nowrap hidden md:table-cell">الوصف</th>
              <th className="text-right p-3 text-xs font-bold text-muted-foreground whitespace-nowrap hidden lg:table-cell">الصلاحية</th>
              <th className="text-right p-3 text-xs font-bold text-muted-foreground whitespace-nowrap hidden lg:table-cell">يُستخدم في</th>
              <th className="p-3 text-xs font-bold text-muted-foreground whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((page, i) => {
              const details = ROUTE_DETAILS[page.path];
              const isAdmin = details?.access.includes('مسؤول') ?? false;
              return (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="p-3 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{page.icon}</span>
                      <span className="font-semibold text-xs">{page.label}</span>
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <code className="text-[11px] bg-muted/60 px-1.5 py-0.5 rounded font-mono text-primary">{page.path}</code>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground hidden md:table-cell max-w-[180px]">
                    <span className="line-clamp-2">{page.description ?? '—'}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap hidden lg:table-cell">
                    <Badge variant="outline" className={`text-[10px] ${isAdmin ? 'border-warning/40 text-warning' : 'border-success/40 text-success'}`}>
                      {details?.access ?? 'مستخدم مسجّل'}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell max-w-[200px]">
                    <span className="line-clamp-2">{details?.usedIn ?? '—'}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                        title="نسخ المسار" onClick={() => copy(page.path)}>
                        {copiedPath === page.path
                          ? <Check className="w-3.5 h-3.5 text-success" />
                          : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      <a href={page.path} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" title="فتح">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
