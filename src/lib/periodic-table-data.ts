import { textFor } from "@/mobile/i18n";
import { getLanguage } from "@/mobile/preferences";

export type ElementCategory =
  | "alkali"
  | "alkaline"
  | "lanthanide"
  | "actinide"
  | "transition"
  | "post-transition"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble"
  | "unknown";

export interface PeriodicElement {
  number: number;
  symbol: string;
  nameTr: string;
  nameEn: string;
  mass: string;
  category: ElementCategory;
  period: number;
  group: number | null; // null for lanthanides/actinides shown in the footer rows
  configuration: string; // ground-state electron configuration, noble-gas shorthand
}

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  alkali: "Alkali Metal",
  alkaline: "Toprak Alkali Metal",
  lanthanide: "Lantanit & Aktinit",
  actinide: "Lantanit & Aktinit",
  transition: "Geçiş Metali",
  "post-transition": "Post-Geçiş Metali",
  metalloid: "Yarı Metal",
  nonmetal: "Ametal",
  halogen: "Halojen",
  noble: "Soy Gaz",
  unknown: "Bilinmiyor",
};

const CATEGORY_LABELS_EN: Record<ElementCategory, string> = {
  alkali: "Alkali Metal",
  alkaline: "Alkaline Earth Metal",
  lanthanide: "Lanthanide & Actinide",
  actinide: "Lanthanide & Actinide",
  transition: "Transition Metal",
  "post-transition": "Post-Transition Metal",
  metalloid: "Metalloid",
  nonmetal: "Nonmetal",
  halogen: "Halogen",
  noble: "Noble Gas",
  unknown: "Unknown",
};

/** Chem+ app: the category name in the app language. */
export function categoryLabel(category: ElementCategory): string {
  return textFor(CATEGORY_LABELS[category], CATEGORY_LABELS_EN[category]);
}

/** Chem+ app: the element name in the app language, and the name in the other language. */
export function elementName(el: PeriodicElement): string {
  return getLanguage() === "en" ? el.nameEn : el.nameTr;
}

export function elementOtherName(el: PeriodicElement): string {
  return getLanguage() === "en" ? el.nameTr : el.nameEn;
}

export const CATEGORY_COLORS: Record<ElementCategory, { bg: string; text: string; border: string }> = {
  alkali: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  alkaline: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  lanthanide: { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-300" },
  actinide: { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-300" },
  transition: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  "post-transition": { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
  metalloid: { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300" },
  nonmetal: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  halogen: { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" },
  noble: { bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-300" },
  unknown: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" },
};

export const PERIODIC_ELEMENTS: PeriodicElement[] = [
  { number: 1, symbol: "H", nameTr: "Hidrojen", nameEn: "Hydrogen", mass: "1.01", category: "nonmetal", period: 1, group: 1, configuration: "1s¹" },
  { number: 2, symbol: "He", nameTr: "Helyum", nameEn: "Helium", mass: "4.00", category: "noble", period: 1, group: 18, configuration: "1s²" },
  { number: 3, symbol: "Li", nameTr: "Lityum", nameEn: "Lithium", mass: "6.94", category: "alkali", period: 2, group: 1, configuration: "[He] 2s¹" },
  { number: 4, symbol: "Be", nameTr: "Berilyum", nameEn: "Beryllium", mass: "9.01", category: "alkaline", period: 2, group: 2, configuration: "[He] 2s²" },
  { number: 5, symbol: "B", nameTr: "Bor", nameEn: "Boron", mass: "10.81", category: "metalloid", period: 2, group: 13, configuration: "[He] 2s² 2p¹" },
  { number: 6, symbol: "C", nameTr: "Karbon", nameEn: "Carbon", mass: "12.01", category: "nonmetal", period: 2, group: 14, configuration: "[He] 2s² 2p²" },
  { number: 7, symbol: "N", nameTr: "Azot", nameEn: "Nitrogen", mass: "14.01", category: "nonmetal", period: 2, group: 15, configuration: "[He] 2s² 2p³" },
  { number: 8, symbol: "O", nameTr: "Oksijen", nameEn: "Oxygen", mass: "16.00", category: "nonmetal", period: 2, group: 16, configuration: "[He] 2s² 2p⁴" },
  { number: 9, symbol: "F", nameTr: "Flor", nameEn: "Fluorine", mass: "19.00", category: "halogen", period: 2, group: 17, configuration: "[He] 2s² 2p⁵" },
  { number: 10, symbol: "Ne", nameTr: "Neon", nameEn: "Neon", mass: "20.18", category: "noble", period: 2, group: 18, configuration: "[He] 2s² 2p⁶" },
  { number: 11, symbol: "Na", nameTr: "Sodyum", nameEn: "Sodium", mass: "22.99", category: "alkali", period: 3, group: 1, configuration: "[Ne] 3s¹" },
  { number: 12, symbol: "Mg", nameTr: "Magnezyum", nameEn: "Magnesium", mass: "24.30", category: "alkaline", period: 3, group: 2, configuration: "[Ne] 3s²" },
  { number: 13, symbol: "Al", nameTr: "Alüminyum", nameEn: "Aluminium", mass: "26.98", category: "post-transition", period: 3, group: 13, configuration: "[Ne] 3s² 3p¹" },
  { number: 14, symbol: "Si", nameTr: "Silisyum", nameEn: "Silicon", mass: "28.09", category: "metalloid", period: 3, group: 14, configuration: "[Ne] 3s² 3p²" },
  { number: 15, symbol: "P", nameTr: "Fosfor", nameEn: "Phosphorus", mass: "30.97", category: "nonmetal", period: 3, group: 15, configuration: "[Ne] 3s² 3p³" },
  { number: 16, symbol: "S", nameTr: "Kükürt", nameEn: "Sulfur", mass: "32.06", category: "nonmetal", period: 3, group: 16, configuration: "[Ne] 3s² 3p⁴" },
  { number: 17, symbol: "Cl", nameTr: "Klor", nameEn: "Chlorine", mass: "35.45", category: "halogen", period: 3, group: 17, configuration: "[Ne] 3s² 3p⁵" },
  { number: 18, symbol: "Ar", nameTr: "Argon", nameEn: "Argon", mass: "39.95", category: "noble", period: 3, group: 18, configuration: "[Ne] 3s² 3p⁶" },
  { number: 19, symbol: "K", nameTr: "Potasyum", nameEn: "Potassium", mass: "39.10", category: "alkali", period: 4, group: 1, configuration: "[Ar] 4s¹" },
  { number: 20, symbol: "Ca", nameTr: "Kalsiyum", nameEn: "Calcium", mass: "40.08", category: "alkaline", period: 4, group: 2, configuration: "[Ar] 4s²" },
  { number: 21, symbol: "Sc", nameTr: "Skandiyum", nameEn: "Scandium", mass: "44.96", category: "transition", period: 4, group: 3, configuration: "[Ar] 3d¹ 4s²" },
  { number: 22, symbol: "Ti", nameTr: "Titanyum", nameEn: "Titanium", mass: "47.87", category: "transition", period: 4, group: 4, configuration: "[Ar] 3d² 4s²" },
  { number: 23, symbol: "V", nameTr: "Vanadyum", nameEn: "Vanadium", mass: "50.94", category: "transition", period: 4, group: 5, configuration: "[Ar] 3d³ 4s²" },
  { number: 24, symbol: "Cr", nameTr: "Krom", nameEn: "Chromium", mass: "52.00", category: "transition", period: 4, group: 6, configuration: "[Ar] 3d⁵ 4s¹" },
  { number: 25, symbol: "Mn", nameTr: "Manganez", nameEn: "Manganese", mass: "54.94", category: "transition", period: 4, group: 7, configuration: "[Ar] 3d⁵ 4s²" },
  { number: 26, symbol: "Fe", nameTr: "Demir", nameEn: "Iron", mass: "55.84", category: "transition", period: 4, group: 8, configuration: "[Ar] 3d⁶ 4s²" },
  { number: 27, symbol: "Co", nameTr: "Kobalt", nameEn: "Cobalt", mass: "58.93", category: "transition", period: 4, group: 9, configuration: "[Ar] 3d⁷ 4s²" },
  { number: 28, symbol: "Ni", nameTr: "Nikel", nameEn: "Nickel", mass: "58.69", category: "transition", period: 4, group: 10, configuration: "[Ar] 3d⁸ 4s²" },
  { number: 29, symbol: "Cu", nameTr: "Bakır", nameEn: "Copper", mass: "63.55", category: "transition", period: 4, group: 11, configuration: "[Ar] 3d¹⁰ 4s¹" },
  { number: 30, symbol: "Zn", nameTr: "Çinko", nameEn: "Zinc", mass: "65.38", category: "transition", period: 4, group: 12, configuration: "[Ar] 3d¹⁰ 4s²" },
  { number: 31, symbol: "Ga", nameTr: "Galyum", nameEn: "Gallium", mass: "69.72", category: "post-transition", period: 4, group: 13, configuration: "[Ar] 3d¹⁰ 4s² 4p¹" },
  { number: 32, symbol: "Ge", nameTr: "Germanyum", nameEn: "Germanium", mass: "72.63", category: "metalloid", period: 4, group: 14, configuration: "[Ar] 3d¹⁰ 4s² 4p²" },
  { number: 33, symbol: "As", nameTr: "Arsenik", nameEn: "Arsenic", mass: "74.92", category: "metalloid", period: 4, group: 15, configuration: "[Ar] 3d¹⁰ 4s² 4p³" },
  { number: 34, symbol: "Se", nameTr: "Selenyum", nameEn: "Selenium", mass: "78.97", category: "nonmetal", period: 4, group: 16, configuration: "[Ar] 3d¹⁰ 4s² 4p⁴" },
  { number: 35, symbol: "Br", nameTr: "Brom", nameEn: "Bromine", mass: "79.90", category: "halogen", period: 4, group: 17, configuration: "[Ar] 3d¹⁰ 4s² 4p⁵" },
  { number: 36, symbol: "Kr", nameTr: "Kripton", nameEn: "Krypton", mass: "83.80", category: "noble", period: 4, group: 18, configuration: "[Ar] 3d¹⁰ 4s² 4p⁶" },
  { number: 37, symbol: "Rb", nameTr: "Rubidyum", nameEn: "Rubidium", mass: "85.47", category: "alkali", period: 5, group: 1, configuration: "[Kr] 5s¹" },
  { number: 38, symbol: "Sr", nameTr: "Stronsiyum", nameEn: "Strontium", mass: "87.62", category: "alkaline", period: 5, group: 2, configuration: "[Kr] 5s²" },
  { number: 39, symbol: "Y", nameTr: "İtriyum", nameEn: "Yttrium", mass: "88.91", category: "transition", period: 5, group: 3, configuration: "[Kr] 4d¹ 5s²" },
  { number: 40, symbol: "Zr", nameTr: "Zirkonyum", nameEn: "Zirconium", mass: "91.22", category: "transition", period: 5, group: 4, configuration: "[Kr] 4d² 5s²" },
  { number: 41, symbol: "Nb", nameTr: "Niyobyum", nameEn: "Niobium", mass: "92.91", category: "transition", period: 5, group: 5, configuration: "[Kr] 4d⁴ 5s¹" },
  { number: 42, symbol: "Mo", nameTr: "Molibden", nameEn: "Molybdenum", mass: "95.95", category: "transition", period: 5, group: 6, configuration: "[Kr] 4d⁵ 5s¹" },
  { number: 43, symbol: "Tc", nameTr: "Teknesyum", nameEn: "Technetium", mass: "98.00", category: "transition", period: 5, group: 7, configuration: "[Kr] 4d⁵ 5s²" },
  { number: 44, symbol: "Ru", nameTr: "Rutenyum", nameEn: "Ruthenium", mass: "101.07", category: "transition", period: 5, group: 8, configuration: "[Kr] 4d⁷ 5s¹" },
  { number: 45, symbol: "Rh", nameTr: "Rodyum", nameEn: "Rhodium", mass: "102.91", category: "transition", period: 5, group: 9, configuration: "[Kr] 4d⁸ 5s¹" },
  { number: 46, symbol: "Pd", nameTr: "Paladyum", nameEn: "Palladium", mass: "106.42", category: "transition", period: 5, group: 10, configuration: "[Kr] 4d¹⁰" },
  { number: 47, symbol: "Ag", nameTr: "Gümüş", nameEn: "Silver", mass: "107.87", category: "transition", period: 5, group: 11, configuration: "[Kr] 4d¹⁰ 5s¹" },
  { number: 48, symbol: "Cd", nameTr: "Kadmiyum", nameEn: "Cadmium", mass: "112.41", category: "transition", period: 5, group: 12, configuration: "[Kr] 4d¹⁰ 5s²" },
  { number: 49, symbol: "In", nameTr: "İndiyum", nameEn: "Indium", mass: "114.82", category: "post-transition", period: 5, group: 13, configuration: "[Kr] 4d¹⁰ 5s² 5p¹" },
  { number: 50, symbol: "Sn", nameTr: "Kalay", nameEn: "Tin", mass: "118.71", category: "post-transition", period: 5, group: 14, configuration: "[Kr] 4d¹⁰ 5s² 5p²" },
  { number: 51, symbol: "Sb", nameTr: "Antimon", nameEn: "Antimony", mass: "121.76", category: "metalloid", period: 5, group: 15, configuration: "[Kr] 4d¹⁰ 5s² 5p³" },
  { number: 52, symbol: "Te", nameTr: "Tellür", nameEn: "Tellurium", mass: "127.60", category: "metalloid", period: 5, group: 16, configuration: "[Kr] 4d¹⁰ 5s² 5p⁴" },
  { number: 53, symbol: "I", nameTr: "İyot", nameEn: "Iodine", mass: "126.90", category: "halogen", period: 5, group: 17, configuration: "[Kr] 4d¹⁰ 5s² 5p⁵" },
  { number: 54, symbol: "Xe", nameTr: "Ksenon", nameEn: "Xenon", mass: "131.29", category: "noble", period: 5, group: 18, configuration: "[Kr] 4d¹⁰ 5s² 5p⁶" },
  { number: 55, symbol: "Cs", nameTr: "Sezyum", nameEn: "Cesium", mass: "132.91", category: "alkali", period: 6, group: 1, configuration: "[Xe] 6s¹" },
  { number: 56, symbol: "Ba", nameTr: "Baryum", nameEn: "Barium", mass: "137.33", category: "alkaline", period: 6, group: 2, configuration: "[Xe] 6s²" },
  { number: 57, symbol: "La", nameTr: "Lantan", nameEn: "Lanthanum", mass: "138.91", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 5d¹ 6s²" },
  { number: 58, symbol: "Ce", nameTr: "Seryum", nameEn: "Cerium", mass: "140.12", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹ 5d¹ 6s²" },
  { number: 59, symbol: "Pr", nameTr: "Praseodim", nameEn: "Praseodymium", mass: "140.91", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f³ 6s²" },
  { number: 60, symbol: "Nd", nameTr: "Neodimyum", nameEn: "Neodymium", mass: "144.24", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁴ 6s²" },
  { number: 61, symbol: "Pm", nameTr: "Prometyum", nameEn: "Promethium", mass: "145.00", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁵ 6s²" },
  { number: 62, symbol: "Sm", nameTr: "Samaryum", nameEn: "Samarium", mass: "150.36", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁶ 6s²" },
  { number: 63, symbol: "Eu", nameTr: "Evropiyum", nameEn: "Europium", mass: "151.96", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁷ 6s²" },
  { number: 64, symbol: "Gd", nameTr: "Gadolinyum", nameEn: "Gadolinium", mass: "157.25", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁷ 5d¹ 6s²" },
  { number: 65, symbol: "Tb", nameTr: "Terbiyum", nameEn: "Terbium", mass: "158.93", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f⁹ 6s²" },
  { number: 66, symbol: "Dy", nameTr: "Disprozyum", nameEn: "Dysprosium", mass: "162.50", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹⁰ 6s²" },
  { number: 67, symbol: "Ho", nameTr: "Holmiyum", nameEn: "Holmium", mass: "164.93", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹¹ 6s²" },
  { number: 68, symbol: "Er", nameTr: "Erbiyum", nameEn: "Erbium", mass: "167.26", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹² 6s²" },
  { number: 69, symbol: "Tm", nameTr: "Tulyum", nameEn: "Thulium", mass: "168.93", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹³ 6s²" },
  { number: 70, symbol: "Yb", nameTr: "İterbiyum", nameEn: "Ytterbium", mass: "173.04", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹⁴ 6s²" },
  { number: 71, symbol: "Lu", nameTr: "Lutesyum", nameEn: "Lutetium", mass: "174.97", category: "lanthanide", period: 6, group: null, configuration: "[Xe] 4f¹⁴ 5d¹ 6s²" },
  { number: 72, symbol: "Hf", nameTr: "Hafniyum", nameEn: "Hafnium", mass: "178.49", category: "transition", period: 6, group: 4, configuration: "[Xe] 4f¹⁴ 5d² 6s²" },
  { number: 73, symbol: "Ta", nameTr: "Tantal", nameEn: "Tantalum", mass: "180.95", category: "transition", period: 6, group: 5, configuration: "[Xe] 4f¹⁴ 5d³ 6s²" },
  { number: 74, symbol: "W", nameTr: "Tungsten", nameEn: "Tungsten", mass: "183.84", category: "transition", period: 6, group: 6, configuration: "[Xe] 4f¹⁴ 5d⁴ 6s²" },
  { number: 75, symbol: "Re", nameTr: "Renyum", nameEn: "Rhenium", mass: "186.21", category: "transition", period: 6, group: 7, configuration: "[Xe] 4f¹⁴ 5d⁵ 6s²" },
  { number: 76, symbol: "Os", nameTr: "Osmiyum", nameEn: "Osmium", mass: "190.23", category: "transition", period: 6, group: 8, configuration: "[Xe] 4f¹⁴ 5d⁶ 6s²" },
  { number: 77, symbol: "Ir", nameTr: "İridyum", nameEn: "Iridium", mass: "192.22", category: "transition", period: 6, group: 9, configuration: "[Xe] 4f¹⁴ 5d⁷ 6s²" },
  { number: 78, symbol: "Pt", nameTr: "Platin", nameEn: "Platinum", mass: "195.08", category: "transition", period: 6, group: 10, configuration: "[Xe] 4f¹⁴ 5d⁹ 6s¹" },
  { number: 79, symbol: "Au", nameTr: "Altın", nameEn: "Gold", mass: "196.97", category: "transition", period: 6, group: 11, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s¹" },
  { number: 80, symbol: "Hg", nameTr: "Cıva", nameEn: "Mercury", mass: "201", category: "transition", period: 6, group: 12, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s²" },
  { number: 81, symbol: "Tl", nameTr: "Talyum", nameEn: "Thallium", mass: "204", category: "post-transition", period: 6, group: 13, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹" },
  { number: 82, symbol: "Pb", nameTr: "Kurşun", nameEn: "Lead", mass: "207", category: "post-transition", period: 6, group: 14, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²" },
  { number: 83, symbol: "Bi", nameTr: "Bizmut", nameEn: "Bismuth", mass: "209", category: "post-transition", period: 6, group: 15, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³" },
  { number: 84, symbol: "Po", nameTr: "Polonyum", nameEn: "Polonium", mass: "209", category: "post-transition", period: 6, group: 16, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴" },
  { number: 85, symbol: "At", nameTr: "Astatin", nameEn: "Astatine", mass: "210", category: "halogen", period: 6, group: 17, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵" },
  { number: 86, symbol: "Rn", nameTr: "Radon", nameEn: "Radon", mass: "222", category: "noble", period: 6, group: 18, configuration: "[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶" },
  { number: 87, symbol: "Fr", nameTr: "Fransiyum", nameEn: "Francium", mass: "223", category: "alkali", period: 7, group: 1, configuration: "[Rn] 7s¹" },
  { number: 88, symbol: "Ra", nameTr: "Radyum", nameEn: "Radium", mass: "226", category: "alkaline", period: 7, group: 2, configuration: "[Rn] 7s²" },
  { number: 89, symbol: "Ac", nameTr: "Aktinyum", nameEn: "Actinium", mass: "227", category: "actinide", period: 7, group: null, configuration: "[Rn] 6d¹ 7s²" },
  { number: 90, symbol: "Th", nameTr: "Toryum", nameEn: "Thorium", mass: "232", category: "actinide", period: 7, group: null, configuration: "[Rn] 6d² 7s²" },
  { number: 91, symbol: "Pa", nameTr: "Protaktinyum", nameEn: "Protactinium", mass: "231", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f² 6d¹ 7s²" },
  { number: 92, symbol: "U", nameTr: "Uranyum", nameEn: "Uranium", mass: "238", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f³ 6d¹ 7s²" },
  { number: 93, symbol: "Np", nameTr: "Neptünyum", nameEn: "Neptunium", mass: "237", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f⁴ 6d¹ 7s²" },
  { number: 94, symbol: "Pu", nameTr: "Plütonyum", nameEn: "Plutonium", mass: "244", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f⁶ 7s²" },
  { number: 95, symbol: "Am", nameTr: "Amerikyum", nameEn: "Americium", mass: "243", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f⁷ 7s²" },
  { number: 96, symbol: "Cm", nameTr: "Küriyum", nameEn: "Curium", mass: "247", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f⁷ 6d¹ 7s²" },
  { number: 97, symbol: "Bk", nameTr: "Berkelyum", nameEn: "Berkelium", mass: "247", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f⁹ 7s²" },
  { number: 98, symbol: "Cf", nameTr: "Kaliforniyum", nameEn: "Californium", mass: "251", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹⁰ 7s²" },
  { number: 99, symbol: "Es", nameTr: "Aynştaynyum", nameEn: "Einsteinium", mass: "252", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹¹ 7s²" },
  { number: 100, symbol: "Fm", nameTr: "Fermiyum", nameEn: "Fermium", mass: "257", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹² 7s²" },
  { number: 101, symbol: "Md", nameTr: "Mendelevyum", nameEn: "Mendelevium", mass: "258", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹³ 7s²" },
  { number: 102, symbol: "No", nameTr: "Nobelyum", nameEn: "Nobelium", mass: "259", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹⁴ 7s²" },
  { number: 103, symbol: "Lr", nameTr: "Lavrensiyum", nameEn: "Lawrencium", mass: "262", category: "actinide", period: 7, group: null, configuration: "[Rn] 5f¹⁴ 7s² 7p¹" },
  { number: 104, symbol: "Rf", nameTr: "Rutherfordiyum", nameEn: "Rutherfordium", mass: "267", category: "transition", period: 7, group: 4, configuration: "[Rn] 5f¹⁴ 6d² 7s²" },
  { number: 105, symbol: "Db", nameTr: "Dubniyum", nameEn: "Dubnium", mass: "268", category: "transition", period: 7, group: 5, configuration: "[Rn] 5f¹⁴ 6d³ 7s²" },
  { number: 106, symbol: "Sg", nameTr: "Seaborgiyum", nameEn: "Seaborgium", mass: "271", category: "transition", period: 7, group: 6, configuration: "[Rn] 5f¹⁴ 6d⁴ 7s²" },
  { number: 107, symbol: "Bh", nameTr: "Bohriyum", nameEn: "Bohrium", mass: "270", category: "transition", period: 7, group: 7, configuration: "[Rn] 5f¹⁴ 6d⁵ 7s²" },
  { number: 108, symbol: "Hs", nameTr: "Hassiyum", nameEn: "Hassium", mass: "277", category: "transition", period: 7, group: 8, configuration: "[Rn] 5f¹⁴ 6d⁶ 7s²" },
  { number: 109, symbol: "Mt", nameTr: "Meitneriyum", nameEn: "Meitnerium", mass: "278", category: "unknown", period: 7, group: 9, configuration: "[Rn] 5f¹⁴ 6d⁷ 7s²" },
  { number: 110, symbol: "Ds", nameTr: "Darmstadtiyum", nameEn: "Darmstadtium", mass: "281", category: "unknown", period: 7, group: 10, configuration: "[Rn] 5f¹⁴ 6d⁹ 7s¹" },
  { number: 111, symbol: "Rg", nameTr: "Röntgenyum", nameEn: "Roentgenium", mass: "282", category: "unknown", period: 7, group: 11, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s¹" },
  { number: 112, symbol: "Cn", nameTr: "Kopernikyum", nameEn: "Copernicium", mass: "285", category: "transition", period: 7, group: 12, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s²" },
  { number: 113, symbol: "Nh", nameTr: "Nihonyum", nameEn: "Nihonium", mass: "286", category: "post-transition", period: 7, group: 13, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p¹" },
  { number: 114, symbol: "Fl", nameTr: "Flerovyum", nameEn: "Flerovium", mass: "289", category: "post-transition", period: 7, group: 14, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p²" },
  { number: 115, symbol: "Mc", nameTr: "Moskovyum", nameEn: "Moscovium", mass: "290", category: "post-transition", period: 7, group: 15, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p³" },
  { number: 116, symbol: "Lv", nameTr: "Livermoryum", nameEn: "Livermorium", mass: "293", category: "post-transition", period: 7, group: 16, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁴" },
  { number: 117, symbol: "Ts", nameTr: "Tennesin", nameEn: "Tennessine", mass: "294", category: "halogen", period: 7, group: 17, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁵" },
  { number: 118, symbol: "Og", nameTr: "Oganesson", nameEn: "Oganesson", mass: "294", category: "noble", period: 7, group: 18, configuration: "[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶" },
];

export function groupLabel(el: PeriodicElement): string {
  if (el.category === "lanthanide") return textFor("0. grup (Lantan)", "Group 0 (Lanthanides)");
  if (el.category === "actinide") return textFor("0. grup (Aktinit)", "Group 0 (Actinides)");
  return textFor(`${el.group}. grup (${categoryLabel(el.category)})`, `Group ${el.group} (${categoryLabel(el.category)})`);
}

export function periodLabel(el: PeriodicElement): string {
  return textFor(`${el.period}. periyot`, `Period ${el.period}`);
}

export const LANTHANIDES = PERIODIC_ELEMENTS.filter((e) => e.category === "lanthanide");
export const ACTINIDES = PERIODIC_ELEMENTS.filter((e) => e.category === "actinide");
