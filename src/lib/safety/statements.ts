// Chem+ app: GHS hazard (H) and precautionary (P) statements, Turkish and English.
//
// The chemical records carry only the codes; the wording lives here once so the same statement
// cannot drift between two chemicals. Turkish wording follows the SEA yönetmeliği (Turkey's CLP
// equivalent), which is why it reads like the official text rather than a loose translation.

export interface Statement {
  tr: string;
  en: string;
}

/** Hazard statements, by code. */
export const HAZARD_STATEMENTS: Record<string, Statement> = {
  // Physical hazards
  H220: { tr: "Çok kolay alevlenir gaz.", en: "Extremely flammable gas." },
  H224: { tr: "Çok kolay alevlenir sıvı ve buhar.", en: "Extremely flammable liquid and vapour." },
  H225: { tr: "Kolay alevlenir sıvı ve buhar.", en: "Highly flammable liquid and vapour." },
  H226: { tr: "Alevlenir sıvı ve buhar.", en: "Flammable liquid and vapour." },
  H228: { tr: "Alevlenir katı.", en: "Flammable solid." },
  H242: { tr: "Isıtma yangına neden olabilir.", en: "Heating may cause a fire." },
  H250: { tr: "Havayla temas ettiğinde kendiliğinden tutuşur.", en: "Catches fire spontaneously if exposed to air." },
  H260: {
    tr: "Suyla temas ettiğinde kendiliğinden tutuşabilen alevlenir gazlar açığa çıkarır.",
    en: "In contact with water releases flammable gases which may ignite spontaneously.",
  },
  H261: { tr: "Suyla temas ettiğinde alevlenir gazlar açığa çıkarır.", en: "In contact with water releases flammable gas." },
  H271: { tr: "Yangına veya patlamaya yol açabilir; güçlü oksitleyici.", en: "May cause fire or explosion; strong oxidiser." },
  H272: { tr: "Yangını şiddetlendirebilir; oksitleyici.", en: "May intensify fire; oxidiser." },
  H290: { tr: "Metalleri aşındırabilir.", en: "May be corrosive to metals." },

  // Health hazards
  H300: { tr: "Yutulması halinde öldürücüdür.", en: "Fatal if swallowed." },
  H301: { tr: "Yutulması halinde toksiktir.", en: "Toxic if swallowed." },
  H302: { tr: "Yutulması halinde zararlıdır.", en: "Harmful if swallowed." },
  H304: {
    tr: "Solunum yollarına nüfuzu ve yutulması halinde öldürücüdür.",
    en: "May be fatal if swallowed and enters airways.",
  },
  H310: { tr: "Cilt ile teması halinde öldürücüdür.", en: "Fatal in contact with skin." },
  H311: { tr: "Cilt ile teması halinde toksiktir.", en: "Toxic in contact with skin." },
  H312: { tr: "Cilt ile teması halinde zararlıdır.", en: "Harmful in contact with skin." },
  H314: { tr: "Ciddi cilt yanıklarına ve göz hasarına yol açar.", en: "Causes severe skin burns and eye damage." },
  H315: { tr: "Cilt tahrişine yol açar.", en: "Causes skin irritation." },
  H317: { tr: "Alerjik cilt reaksiyonlarına yol açar.", en: "May cause an allergic skin reaction." },
  H318: { tr: "Ciddi göz hasarına yol açar.", en: "Causes serious eye damage." },
  H319: { tr: "Ciddi göz tahrişine yol açar.", en: "Causes serious eye irritation." },
  H330: { tr: "Solunması halinde öldürücüdür.", en: "Fatal if inhaled." },
  H331: { tr: "Solunması halinde toksiktir.", en: "Toxic if inhaled." },
  H332: { tr: "Solunması halinde zararlıdır.", en: "Harmful if inhaled." },
  H334: {
    tr: "Solunması halinde alerji, astım belirtileri veya nefes alma zorluklarına yol açabilir.",
    en: "May cause allergy or asthma symptoms or breathing difficulties if inhaled.",
  },
  H335: { tr: "Solunum yolu tahrişine yol açabilir.", en: "May cause respiratory irritation." },
  H336: { tr: "Rehavete veya baş dönmesine yol açabilir.", en: "May cause drowsiness or dizziness." },
  H340: { tr: "Genetik hasara yol açabilir.", en: "May cause genetic defects." },
  H341: { tr: "Genetik hasara yol açma şüphesi var.", en: "Suspected of causing genetic defects." },
  H350: { tr: "Kansere yol açabilir.", en: "May cause cancer." },
  H351: { tr: "Kansere yol açma şüphesi var.", en: "Suspected of causing cancer." },
  H360: { tr: "Üremeye veya doğmamış çocuğa zarar verebilir.", en: "May damage fertility or the unborn child." },
  H361: {
    tr: "Üremeye veya doğmamış çocuğa zarar verme şüphesi var.",
    en: "Suspected of damaging fertility or the unborn child.",
  },
  H370: { tr: "Organlarda hasara yol açar.", en: "Causes damage to organs." },
  H372: {
    tr: "Uzun süreli veya tekrarlı maruz kalma sonucu organlarda hasara yol açar.",
    en: "Causes damage to organs through prolonged or repeated exposure.",
  },
  H373: {
    tr: "Uzun süreli veya tekrarlı maruz kalma sonucu organlarda hasara yol açabilir.",
    en: "May cause damage to organs through prolonged or repeated exposure.",
  },

  // Environmental hazards
  H400: { tr: "Sucul ortamda çok toksiktir.", en: "Very toxic to aquatic life." },
  H410: { tr: "Sucul ortamda uzun süre kalıcı, çok toksik etki.", en: "Very toxic to aquatic life with long lasting effects." },
  H411: { tr: "Sucul ortamda uzun süre kalıcı, toksik etki.", en: "Toxic to aquatic life with long lasting effects." },
  H412: { tr: "Sucul ortamda uzun süre kalıcı, zararlı etki.", en: "Harmful to aquatic life with long lasting effects." },
};

/** Precautionary statements, by code (combined codes keep their "+" form). */
export const PRECAUTIONARY_STATEMENTS: Record<string, Statement> = {
  P201: { tr: "Kullanmadan önce özel talimatları okuyun.", en: "Obtain special instructions before use." },
  P210: {
    tr: "Isıdan, sıcak yüzeylerden, kıvılcımdan, açık alevden ve diğer tutuşturucu kaynaklardan uzak tutun. Sigara içmeyin.",
    en: "Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.",
  },
  P223: { tr: "Su ile temas ettirmeyin.", en: "Do not allow contact with water." },
  "P231+P232": { tr: "İnert gaz altında elleçleyin. Nemden koruyun.", en: "Handle under inert gas. Protect from moisture." },
  P233: { tr: "Kabı sıkıca kapalı tutun.", en: "Keep container tightly closed." },
  P240: { tr: "Kabı ve alıcı ekipmanı topraklayın ve bağlayın.", en: "Ground and bond container and receiving equipment." },
  P241: { tr: "Patlama korumalı ekipman kullanın.", en: "Use explosion-proof equipment." },
  P260: { tr: "Tozunu / dumanını / buharını solumayın.", en: "Do not breathe dust / fume / vapours." },
  P261: { tr: "Tozunu / dumanını / buharını solumaktan kaçının.", en: "Avoid breathing dust / fume / vapours." },
  P262: { tr: "Göz, cilt veya kıyafetle temas ettirmeyin.", en: "Do not get in eyes, on skin, or on clothing." },
  P264: { tr: "Elleçlemeden sonra ellerinizi iyice yıkayın.", en: "Wash hands thoroughly after handling." },
  P270: { tr: "Bu ürünü kullanırken hiçbir şey yemeyin, içmeyin veya sigara içmeyin.", en: "Do not eat, drink or smoke when using this product." },
  P271: { tr: "Sadece dışarıda veya iyi havalandırılan bir alanda kullanın.", en: "Use only outdoors or in a well-ventilated area." },
  P273: { tr: "Çevreye verilmesinden kaçının.", en: "Avoid release to the environment." },
  P280: {
    tr: "Koruyucu eldiven / koruyucu kıyafet / göz koruyucu / yüz koruyucu kullanın.",
    en: "Wear protective gloves / protective clothing / eye protection / face protection.",
  },
  P284: { tr: "Solunum koruyucu kullanın.", en: "Wear respiratory protection." },
  "P301+P310": {
    tr: "YUTULDUĞUNDA: Hemen ZEHİR MERKEZİNİ veya doktoru arayın.",
    en: "IF SWALLOWED: Immediately call a POISON CENTER or doctor.",
  },
  "P301+P330+P331": {
    tr: "YUTULDUĞUNDA: Ağzı çalkalayın. Kusturmaya ÇALIŞMAYIN.",
    en: "IF SWALLOWED: Rinse mouth. Do NOT induce vomiting.",
  },
  "P302+P352": { tr: "DERİ İLE TEMAS HALİNDE: Bol su ile yıkayın.", en: "IF ON SKIN: Wash with plenty of water." },
  "P303+P361+P353": {
    tr: "DERİ (veya saç) İLE TEMAS HALİNDE: Kirlenmiş tüm giysilerinizi hemen kaldırın. Cildinizi durulayın.",
    en: "IF ON SKIN (or hair): Take off immediately all contaminated clothing. Rinse skin with water.",
  },
  "P304+P340": {
    tr: "SOLUNDUĞUNDA: Kişiyi temiz havaya çıkarın ve rahat nefes alması için uygun pozisyonda tutun.",
    en: "IF INHALED: Remove person to fresh air and keep comfortable for breathing.",
  },
  "P305+P351+P338": {
    tr: "GÖZ İLE TEMASI HALİNDE: Su ile birkaç dakika dikkatlice durulayın. Varsa ve çıkarması kolaysa kontak lensleri çıkarın. Durulamaya devam edin.",
    en: "IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses if present and easy to do. Continue rinsing.",
  },
  "P308+P313": {
    tr: "Maruz kalınması veya etkilenmeniz halinde: Tıbbi yardım alın.",
    en: "IF exposed or concerned: Get medical advice.",
  },
  P310: { tr: "Hemen ZEHİR MERKEZİNİ veya doktoru arayın.", en: "Immediately call a POISON CENTER or doctor." },
  "P337+P313": { tr: "Göz tahrişi kalıcı ise: Tıbbi yardım alın.", en: "If eye irritation persists: Get medical advice." },
  "P342+P311": {
    tr: "Solunum semptomları varsa: ZEHİR MERKEZİNİ veya doktoru arayın.",
    en: "If experiencing respiratory symptoms: Call a POISON CENTER or doctor.",
  },
  "P370+P378": {
    tr: "Yangın durumunda: Söndürmek için uygun söndürücü kullanın; su kullanmayın.",
    en: "In case of fire: Use a suitable extinguishing agent; do not use water.",
  },
  "P403+P233": {
    tr: "İyi havalandırılan bir alanda depolayın. Kabı sıkıca kapalı tutun.",
    en: "Store in a well-ventilated place. Keep container tightly closed.",
  },
  "P403+P235": { tr: "İyi havalandırılan bir alanda depolayın. Serin tutun.", en: "Store in a well-ventilated place. Keep cool." },
  P405: { tr: "Kilit altında saklayın.", en: "Store locked up." },
  "P422": { tr: "İçeriği inert gaz altında saklayın.", en: "Store contents under inert gas." },
  P501: {
    tr: "İçeriği / kabı onaylı bir atık bertaraf tesisine gönderin.",
    en: "Dispose of contents / container to an approved waste disposal plant.",
  },
};

export function hazardText(code: string): Statement | undefined {
  return HAZARD_STATEMENTS[code];
}

export function precautionText(code: string): Statement | undefined {
  return PRECAUTIONARY_STATEMENTS[code];
}
