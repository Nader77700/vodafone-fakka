/**
 * verify-access — التحقق من صلاحية الوصول لخدمة ما Server-Side
 *
 * Endpoint:
 *   POST /verify-access
 *   body: { service_id: string }
 *
 * يتحقق من:
 *   - Authenticated user
 *   - Profile access_mode (subscribed | preview)
 *   - Subscription status
 *   - حالة القسم في services_control
 *   - Preview Mode enabled/disabled
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { zeroTrustCheck, CORS_HEADERS } from "../_shared/zero_trust.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const zt = await zeroTrustCheck(req);
    if (zt.error) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "AUTH_REQUIRED", message: zt.error }),
        { status: zt.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const { user, supabaseAdmin, profile } = zt;
    const { service_id } = await req.json().catch(() => ({})) as { service_id?: string };

    if (!service_id || typeof service_id !== "string") {
      return new Response(
        JSON.stringify({ allowed: false, reason: "INVALID_SERVICE", message: "معرّف القسم غير صالح." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const isAdmin = ["admin", "super_admin"].includes(profile.role);
    if (isAdmin) {
      return new Response(
        JSON.stringify({ allowed: true, reason: "ADMIN", message: "صلاحية أدمن." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // جلب إعدادات Preview Mode والقسم المطلوب
    const [{ data: configRows }, { data: svcRows }] = await Promise.all([
      supabaseAdmin.from("core_app_config").select("key, value").eq("key", "ff_preview_mode_enabled"),
      supabaseAdmin.from("services_control").select("*").eq("id", service_id).maybeSingle(),
    ]);

    const previewModeEnabled = configRows?.[0]?.value === "true";
    const svc = svcRows;

    // القسم غير موجود → يُعتبر غير متاح
    if (!svc) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "SERVICE_NOT_FOUND", message: "القسم غير موجود." }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (svc.status === "disabled") {
      return new Response(
        JSON.stringify({ allowed: false, reason: "SERVICE_DISABLED", message: "هذا القسم معطّل حالياً." }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (svc.status === "maintenance") {
      return new Response(
        JSON.stringify({ allowed: false, reason: "MAINTENANCE", message: svc.maintenance_message ?? "القسم في صيانة مؤقتة." }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // حالة الاشتراك الحقيقية من جدول subscriptions
    const { data: subRows } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", user.id)
      .in("status", ["active", "expired", "grace_period"])
      .order("created_at", { ascending: false })
      .limit(1);

    const sub = subRows?.[0];
    let hasActiveSub = false;
    if (sub?.status === "active" && sub.expires_at) {
      hasActiveSub = new Date(sub.expires_at).getTime() > Date.now();
    }

    const accessMode = svc.access_mode as "all" | "subscribers_only" | "preview_available";

    // المشترك النشط يمر دائماً (باستثناء الحالات أعلاه)
    if (hasActiveSub) {
      return new Response(
        JSON.stringify({ allowed: true, reason: "ACTIVE_SUBSCRIPTION", message: "اشتراك نشط." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // المستخدم في Preview Mode
    if (profile.access_mode === "preview") {
      if (!previewModeEnabled) {
        return new Response(
          JSON.stringify({ allowed: false, reason: "PREVIEW_DISABLED", message: "تم إيقاف وضع المعاينة." }),
          { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      if (accessMode === "preview_available") {
        return new Response(
          JSON.stringify({ allowed: true, reason: "PREVIEW", message: "متاح للمعاينة." }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ allowed: false, reason: "SUBSCRIPTION_REQUIRED", message: "هذه الخدمة متاحة للمشتركين فقط." }),
        { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // مستخدم عادي غير مشترك
    if (accessMode === "all") {
      return new Response(
        JSON.stringify({ allowed: true, reason: "PUBLIC", message: "متاح للجميع." }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ allowed: false, reason: "SUBSCRIPTION_REQUIRED", message: "هذه الخدمة متاحة للمشتركين فقط." }),
      { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return new Response(
      JSON.stringify({ allowed: false, reason: "SERVER_ERROR", message: msg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
