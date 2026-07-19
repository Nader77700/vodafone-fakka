
-- إضافة حقول الفئة والمبلغ ورقم العملية إلى جدول operations
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS operation_number BIGSERIAL,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2);

-- إنشاء sequence منفصل لأرقام العمليات إذا لزم
CREATE SEQUENCE IF NOT EXISTS operations_number_seq START 1000;
