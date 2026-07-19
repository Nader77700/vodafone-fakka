import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, CreditCard, Lock, AlertTriangle, Eye, EyeOff, Send, Clock, Loader2 } from 'lucide-react';
import { VodafoneCashService } from '../../services/vodafone-cash/VodafoneCashService';
import { fetchSeamlessToken } from '../../lib/seamless';
import { toast } from 'sonner';

export default function MoneyTransferPage() {
  const navigate = useNavigate();
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReceiverValid = receiver.startsWith('010') || receiver.startsWith('011') || receiver.startsWith('012') || receiver.startsWith('015');
  const isReceiverLengthValid = receiver.length === 11;
  const isAmountValid = amount !== '' && Number(amount) >= 2;
  const isPinValid = pin.length >= 4;

  const canSubmit = isReceiverValid && isReceiverLengthValid && isAmountValid && isPinValid && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    
    // 1. Get Seamless Token
    const toastId = toast.loading('جاري التحقق من فودافون كاش...');
    const seamless = await fetchSeamlessToken('cash-app');
    
    if (!seamless.token) {
      toast.error(`فشل التعرف التلقائي على المحفظة: ${seamless.error || 'تأكد من تفعيل بيانات فودافون وإغلاق الـ WiFi'}`, { id: toastId, duration: 6000 });
      setIsSubmitting(false);
      return;
    }

    toast.loading('جاري تنفيذ التحويل...', { id: toastId });

    // 2. Execute Transfer
    const res = await VodafoneCashService.initiateMoneyTransfer({
      receiver_number: receiver,
      amount: Number(amount),
      pin: pin,
      seamless_token: seamless.token,
      msisdn: seamless.msisdn
    });

    if (res.success) {
      toast.success(res.message || 'تم التحويل بنجاح', { id: toastId });
      setReceiver('');
      setAmount('');
      setPin('');
      // Optionally navigate to history or show success dialog
    } else {
      toast.error(res.message || 'فشلت العملية', { id: toastId, duration: 5000 });
    }
    
    setIsSubmitting(false);
  };

  const handleReceiverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (val.length <= 11) setReceiver(val);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    setAmount(val);
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    setPin(val);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo selection:bg-[#E60000]/30 selection:text-white">
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate(-1)} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">تحويل الأموال</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash</p>
          </div>
          <button onClick={() => navigate('/vodafone-cash-center/history/transfer')} className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors text-white/70">
            <Clock className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* Form Container */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#E60000]/5 rounded-full blur-3xl" />
          
          <div className="space-y-5 relative z-10">
            {/* Receiver Field */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/80">رقم المستفيد</label>
              <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${receiver && (!isReceiverValid || !isReceiverLengthValid) ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                <div className="pl-3 pr-2 text-white/40">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  value={receiver}
                  onChange={handleReceiverChange}
                  placeholder="01xxxxxxxxx"
                  className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20"
                />
              </div>
              {receiver.length > 0 && !isReceiverValid && (
                <p className="text-xs text-red-500 font-medium">يجب أن يبدأ الرقم بـ 010 أو 011 أو 012 أو 015</p>
              )}
              {receiver.length > 0 && isReceiverValid && !isReceiverLengthValid && (
                <p className="text-xs text-red-500 font-medium">الرقم يجب أن يتكون من 11 رقماً</p>
              )}
            </div>

            {/* Amount Field */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/80">المبلغ</label>
              <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${amount !== '' && !isAmountValid ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                <div className="pl-3 pr-2 text-white/40">
                  <span className="text-sm font-bold">EGP</span>
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0"
                  className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20"
                />
              </div>
              {amount !== '' && !isAmountValid && (
                <p className="text-xs text-red-500 font-medium">الحد الأدنى للتحويل هو 2 جنيه</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/80">كلمة سر Vodafone Cash</label>
              <div className="flex items-center bg-[#1A1A1A] border border-white/10 rounded-xl overflow-hidden transition-colors focus-within:border-[#E60000]">
                <div className="pl-3 pr-2 text-white/40">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPin ? "text" : "password"}
                  dir="ltr"
                  value={pin}
                  onChange={handlePinChange}
                  placeholder="****"
                  className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20"
                />
                <button onClick={() => setShowPin(!showPin)} className="px-3 text-white/40 hover:text-white/80">
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notes Box */}
        <div className="bg-[#1A1A1A] border border-[#E60000]/20 rounded-xl p-4 shadow-[0_0_15px_rgba(230,0,0,0.05)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[#E60000]">ملاحظات هامة:</h4>
              <ul className="text-xs text-white/70 space-y-1.5 list-disc list-inside pr-1">
                <li>يجب تشغيل بيانات فودافون (Vodafone Data).</li>
                <li>يجب أن تكون محفظتك مفعلة.</li>
                <li>يجب توفر رصيد كافٍ في المحفظة.</li>
                <li>سيتم عرض النتيجة الحقيقية القادمة من السيرفر بعد الربط.</li>
                <li>لن يتم خصم أي عملية عند فشل التنفيذ.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all duration-300
            ${canSubmit 
              ? 'bg-[#E60000] text-white shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]' 
              : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}`}
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
          {isSubmitting ? 'جاري التحويل...' : 'تحويل الآن'}
        </button>
      </div>
    </div>
  );
}
