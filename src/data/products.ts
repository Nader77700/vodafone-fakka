// بيانات المنتجات المستخرجة من السكربت — لا تعديل يدوي
// FAKKA_PRODUCTS + MARED_PRODUCTS
// آخر تحديث: v2.6.0 — تصحيح الصلاحيات + إضافة الرصيد الصافي + تصحيح الوحدات

export type ProductCategory = 'fakka' | 'mared';

export interface VodafoneProduct {
  id: string;            // Product ID من السكربت
  name: string;          // الاسم الكامل
  category: ProductCategory;
  price: number;         // السعر بالجنيه
  units: number;         // عدد الوحدات
  type: string;          // وحدة / دقايق / فليكس / سوشيال
  displayName: string;   // اسم قصير للعرض في الكارت
  priceLabel: string;    // "2.5 جنيه"
  unitsLabel: string;    // "45 وحدة"
  validity: string;      // مدة الصلاحية الكاملة — صالح 24 ساعة / صالح 3 أيام ...
  net_balance: number;   // الرصيد الصافي بالجنيه
}

// ─── مساعد: تنسيق label الوحدات ───────────────────────────────────────────
function ul(n: number): string { return `${n} وحدة`; }

export const FAKKA_PRODUCTS: VodafoneProduct[] = [
  // ─── 1 يوم = صالح 24 ساعة ───────────────────────────────────────────────
  { id: 'Fakka_2.5_Unite',     name: 'فكة 2.5 جنيه - 45 وحدة',          category: 'fakka', price: 2.5,  units: 45,   type: 'وحدة', displayName: 'فكة 2.5 جنيه',      priceLabel: '2.5 جنيه',  unitsLabel: ul(45),   validity: 'صالح 24 ساعة',  net_balance: 1.75  },
  { id: 'Fakka_4.25_Unite',    name: 'فكة 4.25 جنيه - 190 وحدة',         category: 'fakka', price: 4.25, units: 190,  type: 'وحدة', displayName: 'فكة 4.25 جنيه',     priceLabel: '4.25 جنيه', unitsLabel: ul(190),  validity: 'صالح 24 ساعة',  net_balance: 2.97  },
  { id: 'Fakka_5_Unite',       name: 'فكة 5 جنيه - 80 وحدة',             category: 'fakka', price: 5,    units: 80,   type: 'وحدة', displayName: 'فكة 5 جنيه',        priceLabel: '5 جنيه',    unitsLabel: ul(80),   validity: 'صالح 24 ساعة',  net_balance: 3.50  },
  { id: 'Fakka_6_NewUnite',    name: 'فكة 6 جنيه - 225 وحدة',            category: 'fakka', price: 6,    units: 225,  type: 'وحدة', displayName: 'فكة 6 جنيه',        priceLabel: '6 جنيه',    unitsLabel: ul(225),  validity: 'صالح 24 ساعة',  net_balance: 4.20  },
  // ─── 3 أيام ─────────────────────────────────────────────────────────────
  { id: 'Fakka_7_Unite',       name: 'فكة 7 جنيه - 300 وحدة',            category: 'fakka', price: 7,    units: 300,  type: 'وحدة', displayName: 'فكة 7 جنيه',        priceLabel: '7 جنيه',    unitsLabel: ul(300),  validity: 'صالح 3 أيام',   net_balance: 4.90  },
  // ─── 4 أيام ─────────────────────────────────────────────────────────────
  { id: 'Fakka_9_Unite',       name: 'فكة 9 جنيه - 400 وحدة',            category: 'fakka', price: 9,    units: 400,  type: 'وحدة', displayName: 'فكة 9 جنيه',        priceLabel: '9 جنيه',    unitsLabel: ul(400),  validity: 'صالح 4 أيام',   net_balance: 6.30  },
  // ─── 7 أيام ─────────────────────────────────────────────────────────────
  { id: 'Fakka_10_Unite',      name: 'فكة 10 جنيه - 450 وحدة',           category: 'fakka', price: 10,   units: 450,  type: 'وحدة', displayName: 'فكة 10 جنيه',       priceLabel: '10 جنيه',   unitsLabel: ul(450),  validity: 'صالح 7 أيام',   net_balance: 7.00  },
  { id: 'Fakka_10_NewUnite',   name: 'فكة 10 جنيه (new) - 450 وحدة',     category: 'fakka', price: 10,   units: 450,  type: 'وحدة', displayName: 'فكة 10 جنيه (new)', priceLabel: '10 جنيه',   unitsLabel: ul(450),  validity: 'صالح 7 أيام',   net_balance: 7.00  },
  { id: 'Fakka_10.5_Unite',    name: 'فكة 10.5 جنيه - 400 وحدة',         category: 'fakka', price: 10.5, units: 400,  type: 'وحدة', displayName: 'فكة 10.5 جنيه',     priceLabel: '10.5 جنيه', unitsLabel: ul(400),  validity: 'صالح 7 أيام',   net_balance: 7.35  },
  { id: 'Fakka_11.5_Unite',    name: 'فكة 11.5 جنيه - 450 وحدة',         category: 'fakka', price: 11.5, units: 450,  type: 'وحدة', displayName: 'فكة 11.5 جنيه',     priceLabel: '11.5 جنيه', unitsLabel: ul(450),  validity: 'صالح 7 أيام',   net_balance: 8.05  },
  { id: 'Fakka_12_Unite',      name: 'فكة 12 جنيه - 450 وحدة',           category: 'fakka', price: 12,   units: 450,  type: 'وحدة', displayName: 'فكة 12 جنيه',       priceLabel: '12 جنيه',   unitsLabel: ul(450),  validity: 'صالح 7 أيام',   net_balance: 8.40  },
  { id: 'Fakka_12.5_Unite',    name: 'فكة 12.5 جنيه - 425 وحدة',         category: 'fakka', price: 12.5, units: 425,  type: 'وحدة', displayName: 'فكة 12.5 جنيه',     priceLabel: '12.5 جنيه', unitsLabel: ul(425),  validity: 'صالح 7 أيام',   net_balance: 8.75  },
  { id: 'Fakka_13_Unite',      name: 'فكة 13 جنيه - 650 وحدة',           category: 'fakka', price: 13,   units: 650,  type: 'وحدة', displayName: 'فكة 13 جنيه',       priceLabel: '13 جنيه',   unitsLabel: ul(650),  validity: 'صالح 7 أيام',   net_balance: 9.10  },
  { id: 'Fakka_13.5_Unite',    name: 'فكة 13.5 جنيه - 650 وحدة',         category: 'fakka', price: 13.5, units: 650,  type: 'وحدة', displayName: 'فكة 13.5 جنيه',     priceLabel: '13.5 جنيه', unitsLabel: ul(650),  validity: 'صالح 7 أيام',   net_balance: 9.45  },
  { id: 'Fakka_15_Unite',      name: 'فكة 15 جنيه - 625 وحدة',           category: 'fakka', price: 15,   units: 625,  type: 'وحدة', displayName: 'فكة 15 جنيه',       priceLabel: '15 جنيه',   unitsLabel: ul(625),  validity: 'صالح 7 أيام',   net_balance: 10.50 },
  { id: 'Fakka_15_NewUnite',   name: 'فكة 15 جنيه (new) - 625 وحدة',     category: 'fakka', price: 15,   units: 625,  type: 'وحدة', displayName: 'فكة 15 جنيه (new)', priceLabel: '15 جنيه',   unitsLabel: ul(625),  validity: 'صالح 7 أيام',   net_balance: 10.50 },
  { id: 'Fakka_15.5_Unite',    name: 'فكة 15.5 جنيه - 625 وحدة',         category: 'fakka', price: 15.5, units: 625,  type: 'وحدة', displayName: 'فكة 15.5 جنيه',     priceLabel: '15.5 جنيه', unitsLabel: ul(625),  validity: 'صالح 7 أيام',   net_balance: 10.85 },
  // ─── 6 أيام ─────────────────────────────────────────────────────────────
  { id: 'Fakka_16.5_Unite',    name: 'فكة 16.5 جنيه - 425 وحدة',         category: 'fakka', price: 16.5, units: 425,  type: 'وحدة', displayName: 'فكة 16.5 جنيه',     priceLabel: '16.5 جنيه', unitsLabel: ul(425),  validity: 'صالح 6 أيام',   net_balance: 11.55 },
  // ─── 10 أيام ────────────────────────────────────────────────────────────
  { id: 'Fakka_17.5_Unite',    name: 'فكة 17.5 جنيه - 650 وحدة',         category: 'fakka', price: 17.5, units: 650,  type: 'وحدة', displayName: 'فكة 17.5 جنيه',     priceLabel: '17.5 جنيه', unitsLabel: ul(650),  validity: 'صالح 10 أيام',  net_balance: 12.25 },
  { id: 'Fakka_19.5_NewUnite', name: 'فكة 19.5 جنيه - 550 وحدة',         category: 'fakka', price: 19.5, units: 550,  type: 'وحدة', displayName: 'فكة 19.5 جنيه',     priceLabel: '19.5 جنيه', unitsLabel: ul(550),  validity: 'صالح 10 أيام',  net_balance: 13.65 },
  { id: 'Fakka_20_Unite',      name: 'فكة 20 جنيه - 750 وحدة',           category: 'fakka', price: 20,   units: 750,  type: 'وحدة', displayName: 'فكة 20 جنيه',       priceLabel: '20 جنيه',   unitsLabel: ul(750),  validity: 'صالح 10 أيام',  net_balance: 14.00 },
  { id: 'Fakka_26_Unite',      name: 'فكة 26 جنيه - 1300 وحدة',          category: 'fakka', price: 26,   units: 1300, type: 'وحدة', displayName: 'فكة 26 جنيه',       priceLabel: '26 جنيه',   unitsLabel: ul(1300), validity: 'صالح 10 أيام',  net_balance: 18.20 },
];

export const MARED_PRODUCTS: VodafoneProduct[] = [
  // P5 FIX: صلاحية المارد = 7 أيام (تصحيح من 30 يوم)
  { id: 'Mared_10_Minuts', name: 'مارد 10 دقايق - 450 وحدة',  category: 'mared', price: 10, units: 450, type: 'دقايق',  displayName: 'مارد دقايق',  priceLabel: '10 جنيه', unitsLabel: ul(450), validity: 'صالح 7 أيام', net_balance: 0 },
  { id: 'Mared_10_Flexs',  name: 'مارد 10 فليكس - 450 وحدة',  category: 'mared', price: 10, units: 450, type: 'فليكس',  displayName: 'مارد فليكس',  priceLabel: '10 جنيه', unitsLabel: ul(450), validity: 'صالح 7 أيام', net_balance: 0 },
  { id: 'Mared_10_Social', name: 'مارد 10 سوشيال - 450 وحدة', category: 'mared', price: 10, units: 450, type: 'سوشيال', displayName: 'مارد سوشيال', priceLabel: '10 جنيه', unitsLabel: ul(450), validity: 'صالح 7 أيام', net_balance: 0 },
];

export const ALL_PRODUCTS: VodafoneProduct[] = [...FAKKA_PRODUCTS, ...MARED_PRODUCTS];
