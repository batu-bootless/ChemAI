# ChemAI Android uygulaması

ChemPlus'ın yapay zekâ asistanı **İris**'in kendi uygulaması. ChemPlus mobil uygulamasının (`D:\targa\chemplus-mobil-app`) kopyasından türetildi; o uygulamaya dokunulmadı. ChemAI'da yalnızca şunlar var:

- **İris** (uygulamanın ana ekranı, `/dashboard/`): sohbet, fotoğraftan soru, veri tablosu (CSV), sesli sohbet, cihazdaki hesap motoru (RDKit, kompleksler, VSEPR, 3B yapı...) ve sohbet kartı olarak eylemler (zamanlayıcı, not, protokol, envanter, rapor/PDF, grafik).
- **Giriş / kayıt** (`/login`, `/register`): e-posta ve Google ile giriş (ChemPlus ile aynı hesap sistemi, Supabase).
- **Hesap** (`/dashboard/account/`): profil, güvenlik, bildirimler, tercihler (tema, dil), veri (indir, hesabı sil), çıkış.
- **Gizlilik politikası** (`/gizlilik/`).

Uygulama ücretsizdir; ödeme ve reklam yoktur. Her sayfa hesap ister (İris sitenin API'sini kullanıcının oturumuyla çağırır), bu yüzden oturum yoksa uygulama giriş ekranında açılır.

## Nasıl çalışır

| Parça | Açıklama |
| --- | --- |
| Arayüz | `src/` - Next.js statik dışa aktarımı (`output: export`, `trailingSlash`) → `out/`. |
| Android kabuğu | `android/` - Capacitor 8; `out/` uygulamanın içinden `https://localhost` adresinde sunulur, açılış sayfası `/dashboard/`. |
| Yapay zekâ | Sitenin `/api/ai/chat` ve `/api/ai/tts` uçları (chemplus.com.tr). Site bot korumasının arkasında olduğu için çağrılar telefonda gizli bir WebView'den yapılır (`ApiBridge.java`, `src/mobile/bridges.ts`). |
| İris kodu | `src/mobile/ai/` (ekran, ses modu), `src/components/ai/` (kartlar, sohbet kancası), `src/lib/ai/` (planlayıcı `assistant.ts`, kılavuz `guide.ts`, ses), `src/lib/chem-engine/` (hesap motoru), `src/lib/agent/` (eylemler). |
| Hesap | `src/lib/auth.ts`, `src/lib/AuthContext.tsx`, `src/mobile/auth/AuthScreen.tsx`, `src/components/account/AccountSettings.tsx`, `src/mobile/preferences.ts`. |
| Yerel kod | `android/app/src/main/java/tr/com/chemplus/app/` (Java paket adı kopyadan kaldı; Play kimliği `applicationId` ile ayrı). |

Önemli sınır: sitenin `/api/ai/chat` ucu `context` alanını 8000 karakterde keser, bu yüzden `PLANNER` metni (assistant.ts) ~7800 karakterin altında kalmalı.

### Kart yanıtlar

Yazılı sohbette İris yanıtını kartlarla verir: sonuç, soru-cevap, molekül, tepkime, formül, adımlar, not. Uygulama her soruya kart biçimini (`CARD_RULES`, `src/lib/ai/answerCards.ts`) ekler; yapay zekâ yanıtı bir ` ```iris ` JSON bloğunda döndürür. `src/components/ai/AnswerCards.tsx` kartları çizer. Molekül kartları hesap motorunun `molecule` aracından (RDKit; ad verilmişse PubChem), tepkimeler denkleştirme motorundan geçer (`src/lib/ai/cardChecks.ts`). Motor İris'in katsayılarını düzeltirse kartta "Motor düzeltti" yazar. Sesli sohbette kart yoktur; dinle/kopyala ve sohbet geçmişi kartların düz metnini kullanır (`answerText`).

### Görsel yapay zekâ (fotoğraftan yapı ve tepkime okuma)

Telefonun metin okuyucusu (ML Kit) yapı çizimlerini ve tepkime oklarını okuyamaz. Fotoğraf bu yüzden, ayarlarda "Görsel yapay zekâ ile oku" açıksa, `supabase/functions/iris-vision` işlevine gider. İşlev fotoğrafı Gemini'nin görsel modeline gösterir ve soruları, yapıları (SMILES), tepkimeleri ve formülleri okur; soruyu çözmez. Uygulama bu okumayla soruyu her zamanki gibi çözer; yapılar ve denklemler cihazda doğrulanır. İşlev kurulu değilse uygulama eskisi gibi yalnızca telefonda okur (6 saat sonra yeniden dener).

Bir kez kurulum (bilgisayarda, proje klasöründe):

```powershell
npx supabase login
npx supabase link --project-ref cgdwufmxbyhoypbcxgfw
npx supabase secrets set GEMINI_API_KEY=<Gemini API anahtarı>
npx supabase functions deploy iris-vision --no-verify-jwt
```

`--no-verify-jwt`: işlev çağıranın oturumunu kendisi denetler (yalnızca giriş yapmış kullanıcılar). İşlev modelleri sırayla dener: biri yoğunsa (429/503) ya da yoksa (404) sıradakine geçer. İsteğe bağlı: `GEMINI_MODELS`, virgülle ayrılmış model listesi (varsayılan `gemini-flash-latest,gemini-flash-lite-latest`). Görsel okuma Gemini kotasından yer; fotoğraf Google'a gider (gizlilik politikası ve Play Console'daki veri güvenliği formu buna göre güncellenmeli).

### Yoğunluk ve ücretsiz Gemini kotası

Gemini'nin ücretsiz katmanında her modelin dakikalık (RPM) ve günlük (RPD) istek sınırı düşüktür ve bütün kullanıcılar aynı sınırı paylaşır. Sınır dolunca site `429` döndürür. Uygulama bu durumda (`src/lib/ai/client.ts`, `busy.ts`):

- Hemen **yedek yapay zekâya** geçer (aşağıda). Site çalışmıyorsa (5xx, bağlantı yok) da aynısını yapar.
- Yedek de doluysa ya da kurulu değilse, birkaç saniye bekleyip en fazla iki kez yeniden sorar (sitenin ya da Gemini'nin söylediği bekleme süresine uyar). Beklerken yanıt balonunda "İris çok yoğun · N sn sonra yeniden soruyorum…" yazar.
- Sonraki 5 dakika daha az çağrı harcar: planlayıcı çağrısı atlanır, cihazdaki kurallar planlar (soru başına 2 yerine 1 çağrı); belgeler üç bölüm yerine birer birer okunur.
- Günlük sınır dolmuşsa yeniden denemez; kullanıcıya sınırın her gün yenilendiğini söyler (hesap motoru çalışmaya devam eder).

Sitenin tarafında (bu repoda değil) yapılması gerekenler: kişi başına dakikalık/günlük soru sınırı ve modeller arasında sırayla deneme.

### Yedek yapay zekâ (NVIDIA ve Gemma)

`supabase/functions/iris-chat` sitenin yerine yanıt veren bir işlevdir; model zinciri `supabase/functions/_shared/router.ts` içindedir. İlk boş model yanıtlar:

- **Zincir:** önce hızlı modeller: `nemotron-3-super` (düşünme kapalı), `gpt-oss-20b` (düşük akıl yürütme), Gemini anahtarıyla `gemma-4-31b-it`, `diffusiongemma-26b`. Sonra yavaş olanlar. En sonda `nvidia:auto`: NVIDIA'nın listesindeki diğer bütün sohbet modelleri; NVIDIA yeni bir model açarsa kendiliğinden kullanılır.
- **Dolan model dinlenir:** 429'da 1 dakika (ya da API'nin söylediği kadar), 5xx ve zaman aşımında 30 sn–2 dk, hesapta olmayan model (404) 12 saat.
- **Eşzamanlı istek sınırı:** Her modelde aynı anda en fazla 6–8 istek olur; fazlası sıradakine gider. Hızlı modellerin hepsi doluysa istek 20 saniyeye kadar yer açılmasını bekler, zinciri yeniden dolaşır; sonra yavaş modellere geçer. Hepsi doluysa 429 döner ve uygulama biraz sonra yeniden sorar.
- **Yanıtın toparlanması:** Düşünme (`<think>`), modelin kopyaladığı ⟦CHEMPLUS-…⟧ işaretleri temizlenir. Çıplak kart JSON'u ` ```iris ` bloğuna alınır.
- **Sınır ve kayıt:** Yalnızca giriş yapmış kullanıcılar kullanabilir; kişi başı dakikada 30 istek. Sohbet turu kullanıcının kendi oturumuyla geçmişe kaydedilir (tablolar izin vermezse uygulama "kaydedilemedi" der).

Ölçüm (30 Eylül 2026, NVIDIA ücretsiz API, İris'in gerçek kılavuzuyla): aynı anda 30 soru → 30'u da yanıtlandı, çoğu 2–13 sn, en yavaşı 26 sn. NVIDIA'nın listelediği 81 modelden bu hesapta metin için çalışan ~10 tane var; kalanlar 404 ya da sohbet modeli değil.

Bir kez kurulum (bilgisayarda, proje klasöründe; anahtar yalnızca Supabase'e girilir, koda ya da uygulamaya değil):

```powershell
npx supabase secrets set NVIDIA_API_KEY=<build.nvidia.com'dan alınan anahtar>
npx supabase functions deploy iris-chat --no-verify-jwt
```

`GEMINI_API_KEY` (görsel okuma için girilmişse) Gemma'yı da zincire ekler. İsteğe bağlı: `IRIS_CHAT_MODELS` ile zincir değiştirilebilir (ör. `nvidia:openai/gpt-oss-20b,nvidia:auto`). Dikkat:
- NVIDIA'nın ücretsiz API'si geliştirme ve deneme için sunuluyor; yayındaki bir uygulamada kullanmadan önce kullanım koşullarına bakın.
- Yedek modeller Gemini'den zayıf olabilir. Molekül ve tepkime kartlarını hesap motoru yine doğrular, ama açıklama metinlerini doğrulamaz.

## Android kimliği

- `applicationId`: **`com.chemai.app`** (`android/app/build.gradle`, `capacitor.config.ts`).
- `versionCode 1`, `versionName 1.0.0` - yalnızca yeni bir Play yüklemesinde artırılır.
- İmzalama: ChemAI'ın **kendi yükleme anahtarı** (ChemPlus'ınki değil), 27 Eylül 2026'da oluşturuldu: `keystore/chemai-upload.jks` + `keystore.properties` (ikisi de git dışı, **mutlaka yedekleyin**). SHA-1: `B2:6F:FF:FE:F2:2C:EB:84:69:0E:B5:E1:23:4B:D7:01:A7:E7:43:68`.
- Google ile giriş için Google Cloud'da paket `com.chemai.app` ve yeni anahtarın SHA-1'iyle (`.\scripts\print-fingerprints.ps1`) bir Android OAuth istemcisi gerekir; Play App Signing anahtarının SHA-1'i için ikinci bir istemci. Supabase'de değişiklik gerekmez.

## Derleme

Gerekenler: Node.js 24, JDK 21, Android SDK (`D:\android-sdk`). `scripts\env.ps1` bu makinenin ayarlarını yapar (C: dolu olduğu için her şey D: diskinde).

```powershell
npm run build:web                 # yalnızca web (out\), tarayıcıda incelemek için
.\scripts\build.ps1               # web + test APK'sı
.\scripts\build.ps1 release       # web + imzalı AAB/APK -> dist\chemai-<sürüm>.*
.\scripts\build.ps1 -SkipWeb      # son web derlemesini kullan
```

Sayfa eklenip çıkarıldıktan sonra `.next` ve `out` silinip yeniden derlenmeli; önizleme sunucusu sayfa listesini açılışta okuduğu için yeniden başlatılmalı.

## İnceleme

```powershell
node scripts/preview/web-server.mjs
```

→ http://localhost:5182/dashboard/ (`D:\targa\.claude\launch.json` içinde `chem-ai-web`). E-posta ile giriş, hesap ayarları, İris'in çevrimdışı planlayıcısı ve hesap motoru çalışır; yapay zekâ yanıtları, hesap silme ve Google ile giriş yalnızca telefonda çalışır.

Test telefonu: `.\scripts\emulator.ps1`, ardından `node scripts/preview/server.mjs` → http://localhost:5183.

### Telefonda canlı önizleme (APK'sız)

```powershell
npm run dev:mobile
```

Telefon bilgisayarla aynı Wi-Fi'deyken, ekrana yazılan adresi (ör. `http://192.168.1.23:3001/dashboard/`) telefonun tarayıcısında açın; kod değiştikçe sayfa kendiliğinden yenilenir. `scripts/dev-mobile.mjs` bilgisayarın Wi-Fi adresini bulur ve Next.js'in yalnızca o adrese izin vermesi için `next.config.ts`'e iletir (`CHEMAI_DEV_ORIGINS` → `allowedDevOrigins`). İlk açılışta Windows Güvenlik Duvarı sorarsa "Özel ağlar"a izin verin.

Tarayıcıda yerel köprü olmadığından yapay zekâ yanıtları ve Google ile giriş burada da çalışmaz; tarayıcılar mikrofonu yalnızca https'te ya da localhost'ta açtığı için sesli giriş de çalışmaz. Bunlar için APK gerekir.
