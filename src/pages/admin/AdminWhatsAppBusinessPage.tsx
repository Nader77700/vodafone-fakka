/**
 * AdminWhatsAppBusinessPage — لوحة إدارة WhatsApp Business Cloud API (المرحلة الأولى)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowRight,
  MessageSquareCode,
  LayoutDashboard,
  KeyRound,
  Send,
  Radio,
  MessageSquare,
  ShieldCheck,
  FileCheck2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Sliders,
  Users,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import type {
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppWebhookEvent,
  WhatsAppMessageType,
} from './whatsapp/types';

import { WhatsAppDashboardTab } from './whatsapp/WhatsAppDashboardTab';
import { WhatsAppConnectionTab } from './whatsapp/WhatsAppConnectionTab';
import { WhatsAppSendSettingsTab } from './whatsapp/WhatsAppSendSettingsTab';
import { WhatsAppWebhookTab } from './whatsapp/WhatsAppWebhookTab';
import { WhatsAppMessageLogTab } from './whatsapp/WhatsAppMessageLogTab';
import { WhatsAppWebhookLogTab } from './whatsapp/WhatsAppWebhookLogTab';
import { WhatsAppReadinessTab } from './whatsapp/WhatsAppReadinessTab';
import { WhatsAppAutomationRulesTab } from './whatsapp/WhatsAppAutomationRulesTab';
import { WhatsAppTemplatesTab } from './whatsapp/WhatsAppTemplatesTab';
import { WhatsAppCustomerPreferencesTab } from './whatsapp/WhatsAppCustomerPreferencesTab';
import { WhatsAppSchedulerQueueTab } from './whatsapp/WhatsAppSchedulerQueueTab';

export default function AdminWhatsAppBusinessPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WhatsAppWebhookEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [checkingReachability, setCheckingReachability] = useState(false);
  const [auditing, setAuditing] = useState(false);

  // ── Load Config & Data ──
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Fetch public config
      const { data: configData, error: configError } = await supabase
        .from('whatsapp_business_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (configError) throw configError;
      setConfig(configData);

      // 2. Fetch Messages
      const { data: msgsData, error: msgsError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (msgsError) throw msgsError;
      setMessages(msgsData || []);

      // 3. Fetch Webhook Events
      const { data: eventsData, error: eventsError } = await supabase
        .from('whatsapp_webhook_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (eventsError) throw eventsError;
      setWebhookEvents(eventsData || []);
    } catch (err: any) {
      toast.error('خطأ في جلب بيانات WhatsApp: ' + (err?.message || 'فشل الاتصال'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Subscribe to realtime changes on messages
    const channel = supabase
      .channel('whatsapp_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        () => {
          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_webhook_events' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // ── Handler: Save Config & Secrets ──
  const handleSaveConfig = async (data: {
    meta_app_id: string;
    waba_id: string;
    phone_number_id: string;
    display_phone: string;
    graph_api_version: string;
    access_token?: string;
    app_secret?: string;
    webhook_verify_token?: string;
  }): Promise<boolean> => {
    try {
      const { data: result, error } = await supabase.rpc('whatsapp_save_admin_config', {
        p_meta_app_id: data.meta_app_id || null,
        p_waba_id: data.waba_id || null,
        p_phone_number_id: data.phone_number_id || null,
        p_display_phone: data.display_phone || null,
        p_graph_api_version: data.graph_api_version || 'v20.0',
        p_access_token: data.access_token || null,
        p_app_secret: data.app_secret || null,
        p_webhook_verify_token: data.webhook_verify_token || null,
      });

      if (error) throw error;
      if (result && !result.success) throw new Error(result.error);

      await loadData(true);
      return true;
    } catch (err: any) {
      toast.error('فشل حفظ الإعدادات: ' + (err?.message || 'خطأ غير متوقع'));
      return false;
    }
  };

  // ── Handler: Test Meta Connection ──
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        toast.error('جلسة المشرف غير نشطة');
        return;
      }

      const res = await fetch(
        'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/whatsapp-check-connection',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const json = await res.json();

      if (res.ok && json.success) {
        toast.success('تم فحص الاتصال مع Meta بنجاح! جميع المعرفات والصلاحيات نشطة.');
      } else if (json.status === 'incomplete') {
        toast.warning(json.details?.message || 'الإعدادات غير مكتملة، يرجى إدخال المعرفات والرمز السري.');
      } else if (json.status === 'insufficient_permissions') {
        toast.error('تم الاتصال ولكن الصلاحيات غير كافية لحساب الأعمال أو رقم الهاتف.');
      } else {
        toast.error(json.details?.error_message || json.error || 'فشل الاتصال مع Meta Graph API');
      }

      await loadData(true);
    } catch (err: any) {
      toast.error('فشل استدعاء دالة فحص الاتصال: ' + err?.message);
    } finally {
      setTestingConnection(false);
    }
  };

  // ── Handler: Send Safe Test Message ──
  const handleSendMessage = async (payload: {
    recipient_phone: string;
    message_type: WhatsAppMessageType;
    template_name?: string;
    template_language?: string;
    template_variables?: string[];
    body_text?: string;
  }): Promise<{ success: boolean; wamid?: string; error?: string }> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        return { success: false, error: 'جلسة المشرف غير نشطة' };
      }

      const res = await fetch(
        'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/whatsapp-send-message',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      await loadData(true);

      if (res.ok && json.success) {
        return { success: true, wamid: json.wamid };
      } else {
        return {
          success: false,
          error: json.error || 'رفضت Meta إرسال الرسالة',
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'خطأ في شبكة الاتصال' };
    }
  };

  // ── Handler: Retry Failed Message ──
  const handleRetryMessage = async (msg: WhatsAppMessage) => {
    toast.info('جارٍ إعادة محاولة الإرسال...');
    const res = await handleSendMessage({
      recipient_phone: msg.recipient_phone,
      message_type: msg.message_type,
      template_name: msg.template_name || undefined,
      template_language: msg.template_language || undefined,
      template_variables: msg.template_variables,
      body_text: msg.body_text || undefined,
    });

    if (res.success) {
      toast.success(`تمت إعادة الإرسال بنجاح! WAMID: ${res.wamid}`);
    } else {
      toast.error(res.error || 'فشلت إعادة الإرسال');
    }
  };

  // ── Handler: Webhook Reachability Self-Check ──
  const handleReachabilityCheck = async () => {
    setCheckingReachability(true);
    try {
      const targetUrl = 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/whatsapp-webhook';
      // Simulate challenge test
      const res = await fetch(`${targetUrl}?hub.mode=subscribe&hub.challenge=test_reachability_123`, {
        method: 'GET',
      });

      // 403 or 200 means function is deployed, reached, and responding with logic
      if (res.status === 200 || res.status === 403) {
        toast.success('تم التحقق: نقطة النهاية (Webhook Endpoint) نشطة وتستجيب لخوادم Meta بصورة سليمة!');
      } else {
        toast.warning(`نقطة النهاية استجابت بالرمز ${res.status}`);
      }
    } catch (err: any) {
      toast.error('فشل الوصول إلى Webhook Endpoint: ' + err?.message);
    } finally {
      setCheckingReachability(false);
    }
  };

  // ── Handler: Full Audit ──
  const handleRunAudit = async () => {
    setAuditing(true);
    await loadData(true);
    await handleTestConnection();
    setAuditing(false);
    toast.success('تم اكتمال الفحص الشامل للجاهزية');
  };

  const tabs = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'automation_rules', label: 'قواعد الإشعارات التلقائية', icon: Sliders },
    { id: 'templates', label: 'قوالب Meta والمعاينة', icon: FileCheck2 },
    { id: 'customer_prefs', label: 'تفضيلات العملاء', icon: Users },
    { id: 'queue', label: 'طابور الأتمتة', icon: Clock },
    { id: 'connection', label: 'إعدادات الاتصال مع Meta', icon: KeyRound },
    { id: 'send_settings', label: 'إرسال واختبار يدوي', icon: Send },
    { id: 'webhook', label: 'إعدادات Webhook', icon: Radio },
    { id: 'messages', label: `سجل الرسائل (${messages.length})`, icon: MessageSquare },
    { id: 'webhook_logs', label: `سجل Webhooks (${webhookEvents.length})`, icon: ShieldCheck },
    { id: 'readiness', label: 'فحص الجاهزية', icon: FileCheck2 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-12" dir="rtl">
      {/* Top Header */}
      <div className="border-b border-border/80 bg-card sticky top-0 z-30 shadow-sm backdrop-blur-md">
        <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin')}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-9 px-2.5"
            >
              <ArrowRight className="w-4 h-4" />
              العودة للوحة الإدارة
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <MessageSquareCode className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">إدارة WhatsApp Business</h1>
                <p className="text-[11px] text-muted-foreground">
                  المرحلة الأولى والثانية: أتمتة إشعارات فودافون RED، تذكيرات التجديد، الفواتير، والجدولة السحابية
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {config?.last_connection_status === 'success' ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs gap-1 hidden sm:flex">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Meta API: متصل
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs gap-1 hidden sm:flex">
                <AlertTriangle className="w-3.5 h-3.5" />
                Meta API: غير متصل
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData()}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </div>
        </div>

        {/* Tab Navigation (Scrollable on Mobile) */}
        <div className="container max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="container max-w-7xl mx-auto px-4 pt-6">
        {activeTab === 'dashboard' && (
          <WhatsAppDashboardTab
            config={config}
            messages={messages}
            loading={loading}
            onRefresh={() => loadData(true)}
            onTestConnection={handleTestConnection}
            testingConnection={testingConnection}
            onSwitchTab={setActiveTab}
          />
        )}

        {activeTab === 'connection' && (
          <WhatsAppConnectionTab
            config={config}
            onSaveConfig={handleSaveConfig}
            onTestConnection={handleTestConnection}
            testingConnection={testingConnection}
          />
        )}

        {activeTab === 'send_settings' && (
          <WhatsAppSendSettingsTab
            config={config}
            onSendMessage={handleSendMessage}
            onViewLogs={() => setActiveTab('messages')}
          />
        )}

        {activeTab === 'webhook' && (
          <WhatsAppWebhookTab
            config={config}
            onRefresh={() => loadData(true)}
            onReachabilityCheck={handleReachabilityCheck}
            checkingReachability={checkingReachability}
          />
        )}

        {activeTab === 'messages' && (
          <WhatsAppMessageLogTab
            messages={messages}
            loading={loading}
            onRefresh={() => loadData(true)}
            onRetryMessage={handleRetryMessage}
          />
        )}

        {activeTab === 'webhook_logs' && (
          <WhatsAppWebhookLogTab
            events={webhookEvents}
            loading={loading}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === 'automation_rules' && (
          <WhatsAppAutomationRulesTab />
        )}

        {activeTab === 'templates' && (
          <WhatsAppTemplatesTab config={config} />
        )}

        {activeTab === 'customer_prefs' && (
          <WhatsAppCustomerPreferencesTab />
        )}

        {activeTab === 'queue' && (
          <WhatsAppSchedulerQueueTab />
        )}

        {activeTab === 'readiness' && (
          <WhatsAppReadinessTab
            config={config}
            messages={messages}
            webhookEvents={webhookEvents}
            onRefresh={() => loadData(true)}
            onRunAudit={handleRunAudit}
            auditing={auditing}
          />
        )}
      </main>
    </div>
  );
}
