// Chem+ app: the built-in laboratory protocols.
//
// A protocol is a list of steps, and a step may carry a duration. That duration is the whole
// point of putting procedures in the app rather than on paper: the step that says "stir for 15
// minutes" can start the clock itself, so nobody has to remember when they started.
//
// The wording is deliberately imperative and short. A protocol read with gloves on, one line at a
// time, is not the place for prose.

export type ProtocolCategory = "prep" | "analysis" | "separation" | "synthesis" | "bio";

export const PROTOCOL_CATEGORIES: Record<ProtocolCategory, { tr: string; en: string }> = {
  prep: { tr: "Hazırlık", en: "Preparation" },
  analysis: { tr: "Analiz", en: "Analysis" },
  separation: { tr: "Ayırma", en: "Separation" },
  synthesis: { tr: "Sentez", en: "Synthesis" },
  bio: { tr: "Biyoloji", en: "Biology" },
};

export interface ProtocolStep {
  text: { tr: string; en: string };
  /** Seconds, when the step is a wait the app can time. */
  seconds?: number;
  /** The thing that goes wrong here if it is going to. */
  caution?: { tr: string; en: string };
}

export interface Protocol {
  id: string;
  name: { tr: string; en: string };
  category: ProtocolCategory;
  summary: { tr: string; en: string };
  steps: ProtocolStep[];
  /** Safety card ids worth opening before starting. */
  chemicals?: string[];
}

const MIN = 60;

export const PROTOCOLS: Protocol[] = [
  {
    id: "solution-from-solid",
    name: { tr: "Katıdan çözelti hazırlama", en: "Solution from a solid" },
    category: "prep",
    summary: {
      tr: "Tartılan katıdan belirli derişimde çözelti; balonjojede son hacme tamamlama.",
      en: "A solution of known concentration from a weighed solid, made up to the mark.",
    },
    steps: [
      { text: { tr: "Gereken kütleyi hesapla: m = C × V × M.", en: "Work out the mass needed: m = C × V × M." } },
      { text: { tr: "Terazinin darasını al, katıyı tartım kabında tart.", en: "Tare the balance and weigh the solid in a weighing boat." } },
      {
        text: { tr: "Katıyı behere aktar, son hacmin yarısı kadar saf suda çöz.", en: "Transfer to a beaker and dissolve in about half the final volume of pure water." },
        caution: {
          tr: "NaOH ve H₂SO₄ çözünürken ısı verir; balonjojede değil beherde çöz.",
          en: "NaOH and H₂SO₄ release heat as they dissolve; dissolve in a beaker, never in the volumetric flask.",
        },
      },
      { text: { tr: "Tamamen çözünene kadar karıştır.", en: "Stir until it has completely dissolved." }, seconds: 5 * MIN },
      { text: { tr: "Oda sıcaklığına gelmesini bekle.", en: "Let it come back to room temperature." }, seconds: 10 * MIN },
      { text: { tr: "Balonjojeye aktar, beheri üç kez saf suyla çalkalayıp aktar.", en: "Transfer to the volumetric flask, rinsing the beaker three times into it." } },
      {
        text: { tr: "Çizgiye kadar tamamla; menisküsün altı çizgiye teğet olsun.", en: "Make up to the mark, with the bottom of the meniscus on the line." },
        caution: { tr: "Son damlaları pipetle ekle; çizgiyi geçersen baştan başlamak gerekir.", en: "Add the last drops with a pipette; overshooting means starting again." },
      },
      { text: { tr: "Kapat ve alt üst ederek en az 10 kez karıştır.", en: "Stopper and invert at least ten times to mix." } },
      { text: { tr: "Etiketle: madde, derişim, tarih, hazırlayan.", en: "Label it: substance, concentration, date, who made it." } },
    ],
  },
  {
    id: "dilution",
    name: { tr: "Stoktan seyreltme", en: "Dilution from a stock" },
    category: "prep",
    summary: { tr: "C₁V₁ = C₂V₂ ile derişik çözeltiden çalışma çözeltisi.", en: "A working solution from a concentrate, by C₁V₁ = C₂V₂." },
    steps: [
      { text: { tr: "V₁ = C₂V₂ / C₁ ile alınacak hacmi hesapla.", en: "Work out the volume to take: V₁ = C₂V₂ / C₁." } },
      {
        text: { tr: "Balonjojeye son hacmin yaklaşık yarısı kadar saf su koy.", en: "Put about half the final volume of pure water into the flask first." },
        caution: {
          tr: "Asit seyreltirken suyun üstüne asit eklenir; asla tersi.",
          en: "When diluting acid, acid goes into water - never the other way round.",
        },
      },
      { text: { tr: "Hesaplanan hacmi pipetle al ve suyun içine ekle.", en: "Pipette the calculated volume and add it to the water." } },
      { text: { tr: "Çalkalayarak karıştır, ısındıysa soğumasını bekle.", en: "Swirl to mix; if it warmed up, let it cool." }, seconds: 5 * MIN },
      { text: { tr: "Çizgiye tamamla ve alt üst ederek karıştır.", en: "Make up to the mark and invert to mix." } },
      { text: { tr: "Etiketle ve stok şişesini yerine kaldır.", en: "Label it and put the stock bottle away." } },
    ],
  },
  {
    id: "titration",
    name: { tr: "Asit-baz titrasyonu", en: "Acid-base titration" },
    category: "analysis",
    summary: { tr: "Bilinen derişimli titrantla bilinmeyen derişimin bulunması.", en: "Finding an unknown concentration with a titrant of known concentration." },
    steps: [
      { text: { tr: "Büreti titrantla üç kez çalkala, sonra doldur.", en: "Rinse the burette three times with titrant, then fill it." } },
      { text: { tr: "Ucundaki hava kabarcığını çıkar ve sıfırla.", en: "Clear the air bubble from the tip and set it to zero." } },
      { text: { tr: "Analiti pipetle erlene al, indikatörden 2-3 damla ekle.", en: "Pipette the analyte into a flask and add 2-3 drops of indicator." } },
      { text: { tr: "Sürekli çalkalayarak damla damla titrant ekle.", en: "Add titrant dropwise while swirling continuously." } },
      {
        text: { tr: "Renk 30 saniye kalıcı olduğunda dur; hacmi oku.", en: "Stop when the colour holds for 30 seconds; read the volume." },
        caution: { tr: "Okumayı göz hizasında ve menisküsün altından yap.", en: "Read at eye level, from the bottom of the meniscus." },
      },
      { text: { tr: "En az üç tekrar yap.", en: "Repeat at least three times." } },
      { text: { tr: "Tekrarların ortalamasını ve BSS'sini hesapla.", en: "Work out the mean and RSD of the replicates." } },
    ],
  },
  {
    id: "recrystallisation",
    name: { tr: "Yeniden kristallendirme", en: "Recrystallisation" },
    category: "synthesis",
    summary: { tr: "Katı ürünün sıcak çözücüde çözülüp soğutularak saflaştırılması.", en: "Purifying a solid by dissolving it hot and letting it come back out cold." },
    steps: [
      { text: { tr: "Ürünü erlene al, en az miktarda sıcak çözücü ekle.", en: "Put the product in a flask and add the minimum of hot solvent." } },
      { text: { tr: "Kaynama taşı at ve tamamen çözünene kadar ısıt.", en: "Add a boiling chip and heat until everything dissolves." }, seconds: 10 * MIN },
      { text: { tr: "Çözünmeyen kirlilik varsa sıcakken süz.", en: "If insoluble impurity remains, filter while hot." } },
      { text: { tr: "Yavaşça oda sıcaklığına soğut; sarsma.", en: "Cool slowly to room temperature without disturbing it." }, seconds: 30 * MIN },
      {
        text: { tr: "Buz banyosunda bekleterek kristallenmeyi tamamla.", en: "Finish the crystallisation in an ice bath." },
        seconds: 15 * MIN,
        caution: { tr: "Hızlı soğutma küçük ve kirli kristal verir.", en: "Cooling fast gives small, impure crystals." },
      },
      { text: { tr: "Büchner hunisinde vakumla süz.", en: "Filter under vacuum on a Büchner funnel." } },
      { text: { tr: "Soğuk çözücüyle yıka ve kurut.", en: "Wash with cold solvent and dry." } },
      { text: { tr: "Verimi ve erime noktasını kaydet.", en: "Record the yield and the melting point." } },
    ],
  },
  {
    id: "extraction",
    name: { tr: "Sıvı-sıvı ekstraksiyon", en: "Liquid-liquid extraction" },
    category: "separation",
    summary: { tr: "Ayırma hunisiyle iki faz arasında madde geçişi.", en: "Moving a compound between two phases in a separating funnel." },
    steps: [
      { text: { tr: "Ayırma hunisinin musluğunun kapalı olduğunu kontrol et.", en: "Check that the funnel's tap is closed." } },
      { text: { tr: "Çözeltiyi ve ekstraksiyon çözücüsünü huniye koy.", en: "Add the solution and the extraction solvent to the funnel." } },
      {
        text: { tr: "Tıpayı tak, ters çevir ve musluğu açarak basıncı al.", en: "Stopper, invert and open the tap to vent." },
        caution: {
          tr: "Karbonatlı ekstraksiyonda CO₂ basınç yapar; ilk çalkalamadan önce mutlaka boşalt.",
          en: "A carbonate wash builds CO₂ pressure; vent before the first real shake.",
        },
      },
      { text: { tr: "Kısa kısa çalkala ve her seferinde basıncı al.", en: "Shake in short bursts, venting each time." }, seconds: 2 * MIN },
      { text: { tr: "Sehpaya koy ve fazlar ayrılana kadar bekle.", en: "Stand it in the ring and wait for the phases to separate." }, seconds: 5 * MIN },
      { text: { tr: "Alt fazı musluktan al; hangi fazın hangisi olduğunu yoğunluktan doğrula.", en: "Run off the lower phase; confirm which is which from the densities." } },
      { text: { tr: "Gerekiyorsa ekstraksiyonu iki kez daha tekrarla.", en: "Repeat the extraction twice more if needed." } },
      { text: { tr: "Organik fazı kurutucu tuzla kurut ve süz.", en: "Dry the organic phase over a drying salt and filter." } },
    ],
  },
  {
    id: "tlc",
    name: { tr: "İnce tabaka kromatografisi (TLC)", en: "Thin-layer chromatography (TLC)" },
    category: "analysis",
    summary: { tr: "Tepkimenin ilerleyişini veya karışımın bileşenlerini görmek.", en: "Following a reaction or seeing what is in a mixture." },
    steps: [
      { text: { tr: "Plakanın altından 1 cm yukarıya kurşun kalemle çizgi çek.", en: "Draw a pencil line 1 cm from the bottom of the plate." } },
      { text: { tr: "Kılcal boruyla numuneyi çizgiye küçük bir nokta olarak koy.", en: "Spot the sample on the line with a capillary, keeping it small." } },
      { text: { tr: "Tankı çözücüyle 0,5 cm doldur ve doyur.", en: "Fill the tank with 0.5 cm of solvent and let it saturate." }, seconds: 5 * MIN },
      {
        text: { tr: "Plakayı tanka koy; çözücü seviyesi noktanın altında kalmalı.", en: "Stand the plate in the tank, with the solvent below the spot." },
        caution: { tr: "Nokta çözücünün içinde kalırsa numune tanka yıkanır.", en: "If the spot is under the solvent, the sample just washes off into the tank." },
      },
      { text: { tr: "Çözücü üst çizgiye yaklaşana kadar bekle.", en: "Wait until the solvent front nears the top line." }, seconds: 10 * MIN },
      { text: { tr: "Plakayı çıkar, cephe çizgisini hemen işaretle ve kurut.", en: "Remove the plate, mark the front at once and let it dry." } },
      { text: { tr: "UV lambasında veya boyama banyosunda görüntüle.", en: "Visualise under UV or in a stain bath." } },
      { text: { tr: "R_f = madde mesafesi / cephe mesafesi hesapla.", en: "Work out R_f = distance moved by the spot / distance moved by the front." } },
    ],
  },
  {
    id: "reflux",
    name: { tr: "Geri soğutucuda kaynatma", en: "Heating under reflux" },
    category: "synthesis",
    summary: { tr: "Kaynama sıcaklığında, çözücü kaybetmeden uzun süreli tepkime.", en: "Running a reaction at the boil for a long time without losing solvent." },
    steps: [
      { text: { tr: "Balonu en fazla yarısına kadar doldur, kaynama taşı at.", en: "Fill the flask no more than half full and add a boiling chip." } },
      { text: { tr: "Geri soğutucuyu tak; su alttan girip üstten çıkmalı.", en: "Fit the condenser: water in at the bottom, out at the top." } },
      {
        text: { tr: "Su akışını aç ve hortumların sıkı olduğunu kontrol et.", en: "Start the water and check the hoses are secure." },
        caution: { tr: "Kapalı sistemi asla ısıtma; üst uç açık kalmalı.", en: "Never heat a closed system; the top must stay open." },
      },
      { text: { tr: "Isıtmayı başlat ve kaynama halkasını soğutucunun alt üçte birinde tut.", en: "Start heating and keep the vapour ring in the lower third of the condenser." } },
      { text: { tr: "Belirtilen süre boyunca kaynat.", en: "Reflux for the stated time." }, seconds: 45 * MIN },
      { text: { tr: "Isıtmayı kapat ve balon soğumadan sökme.", en: "Turn off the heat and do not dismantle until the flask has cooled." }, seconds: 15 * MIN },
    ],
  },
  {
    id: "media-autoclave",
    name: { tr: "Besiyeri hazırlama ve otoklav", en: "Preparing medium and autoclaving" },
    category: "bio",
    summary: { tr: "Mikrobiyoloji için steril besiyeri ve dökme plak.", en: "Sterile medium and poured plates for microbiology." },
    steps: [
      { text: { tr: "Tarife göre tozu tart ve saf suda çöz.", en: "Weigh the powder to the recipe and dissolve it in pure water." } },
      { text: { tr: "Agar varsa çözünene kadar karıştırarak ısıt.", en: "If it contains agar, heat with stirring until it dissolves." }, seconds: 10 * MIN },
      { text: { tr: "pH'ı ölç ve gerekirse ayarla.", en: "Measure the pH and adjust it if needed." } },
      { text: { tr: "Şişenin kapağını gevşek bırak ve otoklav bandı yapıştır.", en: "Leave the cap loose and add autoclave tape." } },
      { text: { tr: "121 °C'de, 15 dakika, 1 atm'de otoklavla.", en: "Autoclave at 121 °C for 15 minutes at 1 atm." }, seconds: 15 * MIN },
      {
        text: { tr: "Elle tutulabilecek sıcaklığa (≈50 °C) kadar soğut.", en: "Cool until it is hand-warm (≈50 °C)." },
        seconds: 20 * MIN,
        caution: { tr: "Sıcakken dökersen kapakta yoğuşma olur; ısıya duyarlı katkılar da bozulur.", en: "Pouring hot gives condensation on the lids and destroys heat-sensitive additives." },
      },
      { text: { tr: "Steril kabin veya alev yanında plakalara dök.", en: "Pour the plates in a hood or beside a flame." } },
      { text: { tr: "Donduktan sonra ters çevirerek 4 °C'de sakla.", en: "Once set, invert the plates and store them at 4 °C." } },
    ],
  },
];

export function protocolById(id: string): Protocol | undefined {
  return PROTOCOLS.find((protocol) => protocol.id === id);
}

/** "15 dk" / "1 sa 30 dk" from a number of seconds. */
export function durationText(seconds: number, language: "tr" | "en"): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return language === "en" ? `${minutes} min` : `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (language === "en") return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}
