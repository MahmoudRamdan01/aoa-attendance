# تفعيل موديل Qwen المحلي (Ollama) للمساعد — خطوات على جهازك

المساعد شغّال دلوقتي بـ **Dahl السحابي** للكل. عشان تفعّل اختيار **Qwen المحلي (qwen3:8b)**
للـ Owner/HR، محتاج تعمل ٤ خطوات على جهاز الـ Owner (RTX 5060). الكود كله جاهز ومستني بس
الإعداد ده؛ ولحد ما تعمله، لو حد اختار Qwen بيرجع تلقائيًا لـ Dahl.

## 1) Ollama (localhost فقط)
```powershell
ollama pull qwen3:8b
# خلّي الموديل محمّل دائمًا (أسرع أول رد)
setx OLLAMA_KEEP_ALIVE -1
# مهم: سيبه على 127.0.0.1 بس — النفق هو المنفذ الوحيد للخارج
# (متعملش OLLAMA_ORIGINS=* ومتفتحش 11434 للنت)
```
شغّل `ollama serve` (أو خدمة Ollama) وتأكد إنه على `http://127.0.0.1:11434`.

## 2) Cloudflare Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create aoa-ollama
# اربطه بـ subdomain عندك، مثلاً ollama.yourdomain.com، يوجّه لـ:
#   service: http://127.0.0.1:11434
cloudflared tunnel route dns aoa-ollama ollama.yourdomain.com
cloudflared tunnel run aoa-ollama
```

## 3) Cloudflare Access + Service Token
- في Cloudflare Zero Trust → Access → Applications: أضف الـ hostname بتاع النفق.
- أنشئ **Service Token** (Access → Service Auth) → هياخد **Client ID** و**Client Secret**.
- اعمل Policy تسمح بالـ Service Token ده بس. كده الرابط مش مكشوف علنًا.

## 4) أسرار Supabase + تفعيل المزوّد
عيّن الأسرار للـ Edge Function (مش في الداتابيز — في الـ env):
```bash
supabase secrets set \
  OLLAMA_BASE_URL="https://ollama.yourdomain.com/v1" \
  CF_ACCESS_CLIENT_ID="<Client-ID>.access" \
  CF_ACCESS_CLIENT_SECRET="<Client-Secret>"
```
وبعدين فعّل صف المزوّد في الداتابيز:
```sql
update assistant_providers set enabled = true where key = 'ollama';
```

بعد كده الـ Owner/HR هيلاقوا **مبدّل الموديل** (Dahl Cloud / Qwen Local) فوق في الشات،
والاختيار بيتحفظ لكل مستخدم. الموظفين دايمًا Dahl. أي فشل في المحلي = رجوع تلقائي لـ Dahl.

**ملاحظات:**
- qwen3:8b على 8GB VRAM يسع بالكاد (Q4) — لو تقيل قلّل `num_ctx`.
- Qwen في الإصدار ده معاه **أدوات قراءة فقط** (تقارير/شرح/ملخصات) — الكتابة الحساسة
  بتفضل عبر Dahl + زر التأكيد. تقدر توسّع ده لاحقًا في `tool_scope`.
- لازم جهاز الـ Owner + النفق يكونوا شغّالين عشان Qwen يشتغل لأي حد.
