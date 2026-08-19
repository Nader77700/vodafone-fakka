
-- ═══════════════════════════════════════════════════════════════
-- إصلاح تكرار الأجهزة في device_registry
-- 1. دمج السجلات المكررة (نفس user_id + نفس device_fp أو hardware_hash)
-- 2. الاحتفاظ بأحدث سجل لكل جهاز
-- ═══════════════════════════════════════════════════════════════

-- أولاً: دمج السجلات التي لها نفس user_id + device_fp (ليست NULL)
-- نحتفظ بأحدث سجل (last_seen_at الأعلى) ونحذف القديم بأمان
DO $$
DECLARE
  dup RECORD;
  keep_id uuid;
  del_ids uuid[];
BEGIN
  -- تجميع المكررات بناءً على (user_id, device_fp)
  FOR dup IN
    SELECT user_id, device_fp, array_agg(id ORDER BY last_seen_at DESC) AS ids
    FROM device_registry
    WHERE device_fp IS NOT NULL
    GROUP BY user_id, device_fp
    HAVING count(*) > 1
  LOOP
    keep_id := dup.ids[1];
    del_ids := dup.ids[2:]; -- كل ما عدا الأحدث

    -- تحديث السجل المحتفظ به بأحدث البيانات الموجودة
    UPDATE device_registry
    SET
      app_version   = COALESCE((SELECT app_version   FROM device_registry WHERE id = ANY(del_ids) AND app_version   IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1), app_version),
      hardware_hash = COALESCE((SELECT hardware_hash FROM device_registry WHERE id = ANY(del_ids) AND hardware_hash IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1), hardware_hash),
      device_id     = COALESCE((SELECT device_id     FROM device_registry WHERE id = ANY(del_ids) AND device_id     IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1), device_id),
      last_seen_at  = GREATEST(last_seen_at, (SELECT MAX(last_seen_at) FROM device_registry WHERE id = ANY(del_ids)))
    WHERE id = keep_id;

    -- حذف المكررات القديمة
    DELETE FROM device_registry WHERE id = ANY(del_ids);
  END LOOP;
END;
$$;

-- ثانياً: دمج المكررات بناءً على (user_id, hardware_hash) — بعد دمج device_fp
DO $$
DECLARE
  dup RECORD;
  keep_id uuid;
  del_ids uuid[];
BEGIN
  FOR dup IN
    SELECT user_id, hardware_hash, array_agg(id ORDER BY last_seen_at DESC) AS ids
    FROM device_registry
    WHERE hardware_hash IS NOT NULL
    GROUP BY user_id, hardware_hash
    HAVING count(*) > 1
  LOOP
    keep_id := dup.ids[1];
    del_ids := dup.ids[2:];

    UPDATE device_registry
    SET
      app_version  = COALESCE((SELECT app_version  FROM device_registry WHERE id = ANY(del_ids) AND app_version  IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1), app_version),
      device_fp    = COALESCE(device_fp, (SELECT device_fp FROM device_registry WHERE id = ANY(del_ids) AND device_fp IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1)),
      device_id    = COALESCE(device_id, (SELECT device_id FROM device_registry WHERE id = ANY(del_ids) AND device_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1)),
      last_seen_at = GREATEST(last_seen_at, (SELECT MAX(last_seen_at) FROM device_registry WHERE id = ANY(del_ids)))
    WHERE id = keep_id;

    DELETE FROM device_registry WHERE id = ANY(del_ids);
  END LOOP;
END;
$$;

-- تأكيد: index يساعد في التعرف السريع على الأجهزة المكررة
CREATE INDEX IF NOT EXISTS idx_device_registry_hw_user
  ON device_registry(user_id, hardware_hash)
  WHERE hardware_hash IS NOT NULL;
