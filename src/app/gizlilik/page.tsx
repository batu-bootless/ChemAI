import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "@/mobile/brand/Wordmark";

// ChemAI privacy policy, reachable from the sign-in screen and the account settings (Google Play
// requires it inside the app). The same text should be published at the public URL entered in
// Play Console.
export const metadata: Metadata = { title: "Gizlilik Politikası - ChemAI" };

const UPDATED = "30 Eylül 2026";
const CONTACT = "info@chemplus.com.tr";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <Wordmark height={28} />
          </span>
          <Link href="/dashboard/" className="text-sm font-semibold text-brand-purple hover:underline">
            Uygulamaya dön
          </Link>
        </div>

        <h1 className="mt-8 text-2xl font-bold text-gray-900">Gizlilik Politikası</h1>
        <p className="mt-1 text-sm text-gray-500">Son güncelleme: {UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          Bu politika, yapay zekâ kimya asistanı İris&apos;i sunan ChemAI Android uygulaması (&quot;Uygulama&quot;)
          için geçerlidir. ChemAI, ChemPlus&apos;ın hesap sistemini kullanır: aynı hesapla chemplus.com.tr
          web sitesine de giriş yapabilirsiniz. Sorularınız için{" "}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-brand-purple underline">
            {CONTACT}
          </a>{" "}
          adresine yazabilirsiniz.
        </p>

        <Section title="1. Topladığımız veriler">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Hesap bilgileri:</strong> e-posta adresi, kullanıcı adı ve şifre (şifre düz metin olarak
              saklanmaz). Google ile girişte Google&apos;ın paylaştığı e-posta, ad ve profil görseli.
            </li>
            <li>
              <strong>Profil bilgileri (isteğe bağlı):</strong> profil fotoğrafı, biyografi, konum (serbest metin),
              doğum tarihi, web sitesi ve sosyal medya bağlantıları, tema, dil ve bildirim tercihleri.
            </li>
            <li>
              <strong>Yapay zekâ sohbetleri:</strong> İris&apos;e yazdığınız ya da söylediğiniz sorular, eklediğiniz veri
              tabloları (CSV), İris&apos;in yanıtları ve sohbet geçmişi hesabınızda saklanır.
            </li>
            <li>
              <strong>Bildirimler:</strong> İris&apos;in bir yanıtını uygunsuz diye bildirdiğinizde yanıt metni, seçtiğiniz
              neden ve notunuz.
            </li>
            <li>
              <strong>Teknik veriler:</strong> güvenlik ve oturum yönetimi için IP adresi ile cihaz bilgisi.
            </li>
            <li>
              <strong>Cihazda saklananlar:</strong> oturum çerezleri, tercihler, kapak fotoğrafı, sesli okuma önbelleği
              ve İris&apos;in sizin için oluşturduğu zamanlayıcı, not, protokol, envanter ve rapor kayıtları. İndirdiğiniz
              PDF raporlar telefonunuzun İndirilenler klasörüne kaydedilir.
            </li>
          </ul>
          <p>
            <strong>Kamera ve fotoğraflar:</strong> bir soruyu fotoğrafla sorduğunuzda görüntüdeki metin ve baskın
            renk telefonunuzda okunur. İris ayarlarındaki &quot;Görsel yapay zekâ ile oku&quot; açıksa (varsayılan olarak
            kapalıdır) fotoğraf, içindeki soruların, yapı çizimlerinin ve tepkimelerin okunması için ayrıca
            sunucumuz üzerinden Google Gemini API&apos;ye gönderilir; sunucumuzda saklanmaz. Bu ayar kapalıysa fotoğrafın
            kendisi gönderilmez, yalnızca telefonda okunan metin ve renk sorunuza eklenir.{" "}
            <strong>Mikrofon:</strong> yalnızca sesli sohbeti ya da dikteyi siz başlattığınızda, izninizle kullanılır;
            konuşmanız telefonunuzun konuşma tanıma hizmetiyle metne çevrilir.{" "}
            <strong>Konum, kişiler, takvim:</strong> toplanmaz. Uygulamada reklam yoktur ve uygulama içinde satın
            alma yapılmaz.
          </p>
        </Section>

        <Section title="2. Verileri kullanma amaçlarımız">
          <p>
            Hesabınızı oluşturmak ve yönetmek; İris&apos;in yanıtlarını, hesaplarını ve sesli yanıtlarını sunmak;
            sohbet geçmişinizi saklamak; güvenliği sağlamak ve kötüye kullanımı önlemek (hız sınırları, bildirimler);
            Uygulamayı iyileştirmek.
          </p>
        </Section>

        <Section title="3. Hizmet sağlayıcılarımız">
          <p>Verilerinizi satmayız. Uygulamayı sunmak için şu sağlayıcılarla çalışırız:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Supabase:</strong> veritabanı, kimlik doğrulama, dosya depolama (profil fotoğrafı), fotoğrafları
              görsel yapay zekâya ve soruları yedek yapay zekâya ileten sunucu işlevleri.
            </li>
            <li><strong>Vercel:</strong> chemplus.com.tr sunucuları; yapay zekâ, sesli yanıt ve hesap silme istekleri bu sunucular üzerinden işlenir.</li>
            <li>
              <strong>Google:</strong> Google ile giriş; İris&apos;e gönderdiğiniz metinler yanıt üretilmesi, görsel yapay zekâ
              açıksa fotoğraflarınız okunması için Google Gemini API&apos;ye gönderilir.
            </li>
            <li>
              <strong>Groq ve NVIDIA:</strong> Google Gemini yoğun ya da ulaşılamaz olduğunda İris&apos;e gönderdiğiniz metinler,
              yanıt üretilmesi için Groq ve NVIDIA API&apos;lerindeki yapay zekâ modellerine gönderilir.
            </li>
            <li><strong>Microsoft Azure ve Google:</strong> sesli yanıt açıksa, İris&apos;in yanıt metni sese çevrilmek için bu hizmetlere gönderilir.</li>
            <li>
              <strong>Bilimsel veri kaynakları</strong> (PubChem, NCI CACTUS): yalnızca sorduğunuz madde adları ve
              tanımlayıcıları için gereken istekler.
            </li>
          </ul>
          <p>Veriler Türkiye dışındaki sunucularda işlenebilir. Tüm bağlantılar şifrelidir (HTTPS).</p>
        </Section>

        <Section title="4. Saklama süresi">
          <p>
            Verileriniz hesabınız açık olduğu sürece saklanır. Hesabınızı sildiğinizde hesabınız ve ona bağlı
            veriler silinir; yasal bir zorunluluk varsa ilgili süre boyunca saklanır. Cihazda saklananlar
            uygulamayı kaldırdığınızda silinir.
          </p>
        </Section>

        <Section title="5. Haklarınız ve hesap silme">
          <p>
            KVKK kapsamında verilerinize erişme, düzeltme, silme ve itiraz etme haklarınız vardır. Hesabınızı
            istediğiniz zaman uygulamada <strong>Hesap → Veri → Hesabı Sil</strong> ile, web&apos;de
            chemplus.com.tr/dashboard/account sayfasından silebilirsiniz. Profil ve tercih özetinizi aynı
            sekmeden indirebilirsiniz. Verilerinizin tam bir kopyası ve diğer talepler için {CONTACT} adresine
            yazın.
          </p>
        </Section>

        <Section title="6. Yapay zekâ yanıtları">
          <p>
            İris&apos;in yanıtları yapay zekâ tarafından üretilir ve hatalı olabilir; güvenlik bilgileri için
            üreticinin güncel güvenlik bilgi formunu (SDS) esas alın. Uygunsuz, zararlı ya da yanlış bir yanıtı
            yanıtın yanındaki bayrak düğmesiyle bize bildirebilirsiniz. Bildirimler ekibimiz tarafından incelenir.
          </p>
        </Section>

        <Section title="7. Çocuklar">
          <p>Uygulama 13 yaşından küçük çocuklara yönelik değildir.</p>
        </Section>

        <Section title="8. Değişiklikler">
          <p>Bu politikayı güncellediğimizde yeni sürümü tarihiyle birlikte burada yayınlarız.</p>
        </Section>
      </article>
    </main>
  );
}
