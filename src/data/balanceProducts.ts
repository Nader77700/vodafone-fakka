// منتجات نظام الشحن من رصيد أنا فودافون
// المصدر الوحيد للحقيقة: Reference_Script_Instruction.txt
// جميع البيانات مطابقة 100% لـ get_fakka_cards_dict() — لا يتم استبدال "غير محدد" بأي قيمة افتراضية

export interface BalanceProduct {
  id: string;
  product_id: string;
  name: string;
  display_name: string;
  category: 'fakka' | 'mared';
  price: number;
  net_balance: number;
  units: number;
  product_type: string;
  validity: string;
  is_visible: boolean;
  is_enabled: boolean;
  sort_order: number;
  notes?: string | null;
  usage_count?: number;
  success_count?: number;
  fail_count?: number;
  last_used_at?: string | null;
  // حقول العرض — مأخوذة مباشرة من السكربت كما هي
  units_label?: string;
  net_charge_label?: string;
}

// ── خريطة العرض الحرفي من السكربت (لا تُعدَّل) ──
// المصدر: get_fakka_cards_dict() في Reference_Script_Instruction.txt
export const SCRIPT_LABELS: Record<string, { units_label: string; net_charge_label: string }> = {
  'Fakka_2.5_Unite':     { units_label: '45 وحدة',              net_charge_label: '1.75'       },
  'Fakka_3_Unite':       { units_label: '125 وحدة',             net_charge_label: '2.10'       },
  'Fakka_4.25_Unite':    { units_label: '190 وحدة',             net_charge_label: '2.97'       },
  'Fakka_5_Unite':       { units_label: '225 وحدة',             net_charge_label: '3.50'       },
  'Fakka_6_Unite':       { units_label: 'غير محدد',             net_charge_label: 'غير محدد'  },
  'Fakka_7_Unite':       { units_label: '300 وحدة',             net_charge_label: '4.90'       },
  'Fakka_8_Unite':       { units_label: 'غير محدد',             net_charge_label: 'غير محدد'  },
  'Fakka_9_Unite':       { units_label: '400 وحدة',             net_charge_label: '6.30'       },
  'Fakka_10_Unite':      { units_label: '450 وحدة',             net_charge_label: '7.00'       },
  'Fakka_10.5_Unite':    { units_label: '400 وحدة + 50MB',      net_charge_label: '7.35'       },
  'Fakka_11.5_Unite':    { units_label: 'غير محدد',             net_charge_label: '8.05'       },
  'Fakka_12_Unite':      { units_label: '425 وحدة',             net_charge_label: '8.40'       },
  'Fakka_12.5_Unite':    { units_label: 'غير محدد',             net_charge_label: 'غير محدد'  },
  'Fakka_13_Unite':      { units_label: 'غير محدد',             net_charge_label: '9.10'       },
  'Fakka_13.5_Unite':    { units_label: '625 وحدة',             net_charge_label: '9.45'       },
  'Fakka_15_Unite':      { units_label: '550 وحدة',             net_charge_label: '10.50'      },
  'Fakka_15.5_Unite':    { units_label: '625 وحدة',             net_charge_label: '10.85'      },
  'Fakka_16.5_Unite':    { units_label: 'غير محدد',             net_charge_label: '11.55'      },
  'Fakka_17.5_Unite':    { units_label: '650 وحدة',             net_charge_label: '12.25'      },
  'Fakka_19.5_NewUnite': { units_label: 'غير محدد',             net_charge_label: '13.65'      },
  'Fakka_20_Unite':      { units_label: 'غير محدد',             net_charge_label: 'غير محدد'  },
  'Fakka_26_Unite':      { units_label: 'غير محدد',             net_charge_label: '18.20'      },
  'Fakka_6_NewUnite':    { units_label: 'غير محدد',             net_charge_label: 'غير محدد'  },
  'Fakka_2.5_Social':    { units_label: '45 وحدة سوشيال',       net_charge_label: '1.75'       },
  'Fakka_4.25_Social':   { units_label: '190 وحدة سوشيال',      net_charge_label: '2.97'       },
  'Fakka_7_Social':      { units_label: '300 وحدة سوشيال',      net_charge_label: '4.90'       },
  'Fakka_9_Social':      { units_label: '400 وحدة سوشيال',      net_charge_label: '6.30'       },
  'Mared_10_Minuts':     { units_label: '10 دقائق',             net_charge_label: 'غير محدد'  },
  'Mared_10_Flexs':      { units_label: '10 فليكس',             net_charge_label: 'غير محدد'  },
  'Mared_10_Social':     { units_label: '10 سوشيال',            net_charge_label: 'غير محدد'  },
};

// ── دمج labels السكربت مع أي مصدر بيانات (DB أو Fallback) ──
export function mergeScriptLabels(products: BalanceProduct[]): BalanceProduct[] {
  return products.map(p => ({
    ...p,
    units_label: SCRIPT_LABELS[p.product_id]?.units_label
      ?? (p.units > 0 ? `${p.units} ${p.product_type}` : 'غير محدد'),
    net_charge_label: SCRIPT_LABELS[p.product_id]?.net_charge_label
      ?? (p.net_balance > 0 ? String(p.net_balance) : 'غير محدد'),
  }));
}

// Fallback محلي — يُستخدم فقط عند فشل DB
// 30 كارت مطابقة 100% لـ get_fakka_cards_dict() في Reference_Script_Instruction.txt
export const BALANCE_PRODUCTS_FALLBACK: BalanceProduct[] = [
  // ── فكة يونايت ──
  { id:'', product_id:'Fakka_2.5_Unite',     name:'Fakka 2.5',            display_name:'فكة 2.5 جنيه',         category:'fakka', price:2.5,  net_balance:1.75,  units:45,  product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:10  },
  { id:'', product_id:'Fakka_3_Unite',       name:'Fakka 3',              display_name:'فكة 3 جنيه',           category:'fakka', price:3,    net_balance:2.10,  units:125, product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:20  },
  { id:'', product_id:'Fakka_4.25_Unite',    name:'Fakka 4.25',           display_name:'فكة 4.25 جنيه',        category:'fakka', price:4.25, net_balance:2.97,  units:190, product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:30  },
  { id:'', product_id:'Fakka_5_Unite',       name:'Fakka 5',              display_name:'فكة 5 جنيه',           category:'fakka', price:5,    net_balance:3.50,  units:225, product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:40  },
  { id:'', product_id:'Fakka_6_Unite',       name:'Fakka 6',              display_name:'فكة 6 جنيه',           category:'fakka', price:6,    net_balance:0,     units:0,   product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:50  },
  { id:'', product_id:'Fakka_7_Unite',       name:'Fakka 7',              display_name:'فكة 7 جنيه',           category:'fakka', price:7,    net_balance:4.90,  units:300, product_type:'وحدة',    validity:'3 أيام',     is_visible:true,  is_enabled:true,  sort_order:60  },
  { id:'', product_id:'Fakka_8_Unite',       name:'Fakka 8',              display_name:'فكة 8 جنيه',           category:'fakka', price:8,    net_balance:0,     units:0,   product_type:'وحدة',    validity:'أيام',       is_visible:true,  is_enabled:true,  sort_order:70  },
  { id:'', product_id:'Fakka_9_Unite',       name:'Fakka 9',              display_name:'فكة 9 جنيه',           category:'fakka', price:9,    net_balance:6.30,  units:400, product_type:'وحدة',    validity:'4 أيام',     is_visible:true,  is_enabled:true,  sort_order:80  },
  { id:'', product_id:'Fakka_10_Unite',      name:'Fakka 10',             display_name:'فكة 10 جنيه',          category:'fakka', price:10,   net_balance:7.00,  units:450, product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:90  },
  { id:'', product_id:'Fakka_10.5_Unite',    name:'Fakka 10.5',           display_name:'فكة 10.5 جنيه',        category:'fakka', price:10.5, net_balance:7.35,  units:400, product_type:'وحدة+MB', validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:100 },
  { id:'', product_id:'Fakka_11.5_Unite',    name:'Fakka 11.5',           display_name:'فكة 11.5 جنيه',        category:'fakka', price:11.5, net_balance:8.05,  units:0,   product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:105 },
  { id:'', product_id:'Fakka_12_Unite',      name:'Fakka 12',             display_name:'فكة 12 جنيه',          category:'fakka', price:12,   net_balance:8.40,  units:425, product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:110 },
  { id:'', product_id:'Fakka_12.5_Unite',    name:'Fakka 12.5',           display_name:'فكة 12.5 جنيه',        category:'fakka', price:12.5, net_balance:0,     units:0,   product_type:'وحدة',    validity:'أيام',       is_visible:true,  is_enabled:true,  sort_order:120 },
  { id:'', product_id:'Fakka_13_Unite',      name:'Fakka 13',             display_name:'فكة 13 جنيه',          category:'fakka', price:13,   net_balance:9.10,  units:0,   product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:125 },
  { id:'', product_id:'Fakka_13.5_Unite',    name:'Fakka 13.5',           display_name:'فكة 13.5 جنيه',        category:'fakka', price:13.5, net_balance:9.45,  units:625, product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:130 },
  { id:'', product_id:'Fakka_15_Unite',      name:'Fakka 15',             display_name:'فكة 15 جنيه',          category:'fakka', price:15,   net_balance:10.50, units:550, product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:140 },
  { id:'', product_id:'Fakka_15.5_Unite',    name:'Fakka 15.5',           display_name:'فكة 15.5 جنيه',        category:'fakka', price:15.5, net_balance:10.85, units:625, product_type:'وحدة',    validity:'7 أيام',     is_visible:true,  is_enabled:true,  sort_order:150 },
  { id:'', product_id:'Fakka_16.5_Unite',    name:'Fakka 16.5',           display_name:'فكة 16.5 جنيه',        category:'fakka', price:16.5, net_balance:11.55, units:0,   product_type:'وحدة',    validity:'10 أيام',    is_visible:true,  is_enabled:true,  sort_order:155 },
  { id:'', product_id:'Fakka_17.5_Unite',    name:'Fakka 17.5',           display_name:'فكة 17.5 جنيه',        category:'fakka', price:17.5, net_balance:12.25, units:650, product_type:'وحدة',    validity:'10 أيام',    is_visible:true,  is_enabled:true,  sort_order:160 },
  { id:'', product_id:'Fakka_19.5_NewUnite', name:'Fakka 19.5 NewUnite',  display_name:'فكة 19.5 جنيه نيو',    category:'fakka', price:19.5, net_balance:13.65, units:0,   product_type:'وحدة',    validity:'10 أيام',    is_visible:true,  is_enabled:true,  sort_order:165 },
  { id:'', product_id:'Fakka_20_Unite',      name:'Fakka 20',             display_name:'فكة 20 جنيه',          category:'fakka', price:20,   net_balance:0,     units:0,   product_type:'وحدة',    validity:'أيام',       is_visible:true,  is_enabled:true,  sort_order:170 },
  { id:'', product_id:'Fakka_26_Unite',      name:'Fakka 26',             display_name:'فكة 26 جنيه',          category:'fakka', price:26,   net_balance:18.20, units:0,   product_type:'وحدة',    validity:'شهر',        is_visible:true,  is_enabled:true,  sort_order:175 },
  // ── فكة نيو يونايت ──
  { id:'', product_id:'Fakka_6_NewUnite',    name:'Fakka 6 NewUnite',     display_name:'فكة 6 جنيه نيو',       category:'fakka', price:6,    net_balance:0,     units:0,   product_type:'وحدة',    validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:55  },
  // ── فكة سوشيال ──
  { id:'', product_id:'Fakka_2.5_Social',    name:'Fakka 2.5 Social',     display_name:'فكة 2.5 سوشيال',       category:'fakka', price:2.5,  net_balance:1.75,  units:45,  product_type:'سوشيال',  validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:200 },
  { id:'', product_id:'Fakka_4.25_Social',   name:'Fakka 4.25 Social',    display_name:'فكة 4.25 سوشيال',      category:'fakka', price:4.25, net_balance:2.97,  units:190, product_type:'سوشيال',  validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:210 },
  { id:'', product_id:'Fakka_7_Social',      name:'Fakka 7 Social',       display_name:'فكة 7 سوشيال',         category:'fakka', price:7,    net_balance:4.90,  units:300, product_type:'سوشيال',  validity:'3 أيام',     is_visible:true,  is_enabled:true,  sort_order:220 },
  { id:'', product_id:'Fakka_9_Social',      name:'Fakka 9 Social',       display_name:'فكة 9 سوشيال',         category:'fakka', price:9,    net_balance:6.30,  units:400, product_type:'سوشيال',  validity:'4 أيام',     is_visible:true,  is_enabled:true,  sort_order:230 },
  // ── مارد ──
  { id:'', product_id:'Mared_10_Minuts',     name:'Mared 10 دقائق',       display_name:'مارد 10 دقائق',         category:'mared', price:10,   net_balance:0,     units:10,  product_type:'دقائق',   validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:240 },
  { id:'', product_id:'Mared_10_Flexs',      name:'Mared 10 فليكس',       display_name:'مارد 10 فليكس',         category:'mared', price:10,   net_balance:0,     units:10,  product_type:'فليكس',   validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:250 },
  { id:'', product_id:'Mared_10_Social',     name:'Mared 10 سوشيال',      display_name:'مارد 10 سوشيال',        category:'mared', price:10,   net_balance:0,     units:10,  product_type:'سوشيال',  validity:'يوم واحد',   is_visible:true,  is_enabled:true,  sort_order:260 },
];
