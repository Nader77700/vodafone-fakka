// ─── مودال إضافة/تعديل عرض eSIM ──────────────────────────────────────────────
import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ESimOffer } from '@/types/esim';
import { createESimOffer, updateESimOffer } from '@/lib/esimApi';

const BLUE = '#1E6FFF';

interface Props {
  offer: ESimOffer | null;
  onClose: () => void;
  onSave: (offer: ESimOffer | null) => void;
}

const EMPTY: Omit<ESimOffer, 'id' | 'created_at' | 'updated_at'> = {
  title: '', description: '', image: null, price: 0, old_price: null,
  discount: null, data_size: '', duration: '30 يوم', status: 'available',
  warranty: true, speed: '4G/5G', country: 'مصر', features: [],
  supported_networks: [], whatsapp_enabled: true, order_index: 0,
  is_featured: false, hidden: false,
};

export default function ESimOfferFormModal({ offer, onClose, onSave }: Props) {
  const [form, setForm] = useState<typeof EMPTY>(
    offer ? { ...offer } : { ...EMPTY }
  );
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.data_size.trim()) {
      toast.error('الاسم وحجم البيانات مطلوبان');
      return;
    }
    setSaving(true);
    let result: ESimOffer | null = null;
    if (offer) {
      const ok = await updateESimOffer(offer.id, form);
      if (ok) result = { ...offer, ...form };
      else toast.error('فشل التحديث');
    } else {
      result = await createESimOffer(form);
      if (!result) toast.error('فشل الإضافة');
    }
    setSaving(false);
    onSave(result);
  };

  const inputClass = "w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#1E6FFF] transition-colors";
  const inputStyle = { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-hidden max-h-[90dvh] flex flex-col"
        style={{ background: '#0d0d0d', border: '1.5px solid rgba(30,111,255,0.25)', borderBottom: 'none' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <p className="text-sm font-black" style={{ color: BLUE }}>
            {offer ? 'تعديل العرض' : 'إضافة عرض جديد'}
          </p>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
          {[
            { label: 'اسم العرض *', key: 'title', type: 'text' },
            { label: 'حجم البيانات *', key: 'data_size', type: 'text', placeholder: 'مثال: 10GB' },
            { label: 'السعر (جنيه) *', key: 'price', type: 'number' },
            { label: 'السعر قبل الخصم', key: 'old_price', type: 'number' },
            { label: 'نسبة الخصم (%)', key: 'discount', type: 'number' },
            { label: 'مدة الصلاحية', key: 'duration', type: 'text', placeholder: '30 يوم' },
            { label: 'السرعة', key: 'speed', type: 'text', placeholder: '4G/5G' },
            { label: 'الدولة', key: 'country', type: 'text', placeholder: 'مصر' },
            { label: 'رابط الصورة', key: 'image', type: 'text', placeholder: 'https://...' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
              <input
                type={type}
                value={(form[key as keyof typeof form] as string | number) ?? ''}
                onChange={e => set(key as keyof typeof EMPTY,
                  type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder={placeholder}
                dir="rtl"
              />
            </div>
          ))}

          {/* الوصف */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">الوصف</p>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className={inputClass}
              style={{ ...inputStyle, resize: 'none' }}
              rows={3} dir="rtl"
            />
          </div>

          {/* المميزات */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">المميزات (كل مميزة في سطر)</p>
            <textarea
              value={form.features.join('\n')}
              onChange={e => set('features', e.target.value.split('\n').filter(Boolean))}
              className={inputClass}
              style={{ ...inputStyle, resize: 'none' }}
              rows={3} dir="rtl"
            />
          </div>

          {/* الشبكات المدعومة */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">الشبكات المدعومة (كل شبكة في سطر)</p>
            <textarea
              value={form.supported_networks.join('\n')}
              onChange={e => set('supported_networks', e.target.value.split('\n').filter(Boolean))}
              className={inputClass}
              style={{ ...inputStyle, resize: 'none' }}
              rows={2} dir="rtl"
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'ضمان', key: 'warranty' },
              { label: 'مميز', key: 'is_featured' },
              { label: 'مخفي', key: 'hidden' },
              { label: 'واتساب مفعّل', key: 'whatsapp_enabled' },
            ].map(({ label, key }) => (
              <button key={key}
                onClick={() => set(key as keyof typeof EMPTY, !form[key as keyof typeof form])}
                className="flex items-center justify-between p-2.5 rounded-xl text-[11px] font-bold"
                style={{
                  background: form[key as keyof typeof form] ? `${BLUE}15` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${form[key as keyof typeof form] ? `${BLUE}40` : 'rgba(255,255,255,0.08)'}`,
                  color: form[key as keyof typeof form] ? BLUE : undefined,
                }}>
                {label}
                <span className="text-xs">{form[key as keyof typeof form] ? '✓' : '○'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: `linear-gradient(135deg,${BLUE},#0044cc)`, boxShadow: `0 4px 16px ${BLUE}40` }}>
            <Save className="w-4 h-4" />
            {saving ? 'جاري الحفظ...' : (offer ? 'حفظ التعديلات' : 'إضافة العرض')}
          </button>
        </div>
      </div>
    </div>
  );
}
