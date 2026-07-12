import { type MathLanguage } from "../domain/index.js";

export const localeProfiles = {
  de: { intl: "de-DE", region: "DE" },
  en: { intl: "en-US", region: "US" },
  es: { intl: "es-419", region: "419" },
  fr: { intl: "fr-FR", region: "FR" },
  pt: { intl: "pt-BR", region: "BR" },
} as const satisfies Record<MathLanguage, { intl: string; region: string }>;

const speech = {
  de: {
    minus: "minus",
    decimal: "Komma",
    fraction: "durch",
    plus: "plus",
    times: "mal",
    dividedBy: "geteilt durch",
    power: "hoch",
    equals: "gleich",
    lt: "kleiner als",
    lte: "kleiner oder gleich",
    gt: "größer als",
    gte: "größer oder gleich",
    root: "Wurzel aus",
  },
  en: {
    minus: "minus",
    decimal: "point",
    fraction: "over",
    plus: "plus",
    times: "times",
    dividedBy: "divided by",
    power: "to the power of",
    equals: "equals",
    lt: "less than",
    lte: "less than or equal to",
    gt: "greater than",
    gte: "greater than or equal to",
    root: "root of",
  },
  es: {
    minus: "menos",
    decimal: "coma",
    fraction: "sobre",
    plus: "más",
    times: "por",
    dividedBy: "dividido entre",
    power: "elevado a",
    equals: "igual a",
    lt: "menor que",
    lte: "menor o igual que",
    gt: "mayor que",
    gte: "mayor o igual que",
    root: "raíz de",
  },
  fr: {
    minus: "moins",
    decimal: "virgule",
    fraction: "sur",
    plus: "plus",
    times: "fois",
    dividedBy: "divisé par",
    power: "puissance",
    equals: "égal à",
    lt: "inférieur à",
    lte: "inférieur ou égal à",
    gt: "supérieur à",
    gte: "supérieur ou égal à",
    root: "racine de",
  },
  pt: {
    minus: "menos",
    decimal: "vírgula",
    fraction: "sobre",
    plus: "mais",
    times: "vezes",
    dividedBy: "dividido por",
    power: "elevado a",
    equals: "igual a",
    lt: "menor que",
    lte: "menor ou igual a",
    gt: "maior que",
    gte: "maior ou igual a",
    root: "raiz de",
  },
} as const;

const units: Record<MathLanguage, Record<string, string>> = {
  de: {
    m: "Meter",
    cm: "Zentimeter",
    mm: "Millimeter",
    km: "Kilometer",
    s: "Sekunden",
    kg: "Kilogramm",
    degree: "Grad",
    radian: "Radiant",
  },
  en: {
    m: "meters",
    cm: "centimeters",
    mm: "millimeters",
    km: "kilometers",
    s: "seconds",
    kg: "kilograms",
    degree: "degrees",
    radian: "radians",
  },
  es: {
    m: "metros",
    cm: "centímetros",
    mm: "milímetros",
    km: "kilómetros",
    s: "segundos",
    kg: "kilogramos",
    degree: "grados",
    radian: "radianes",
  },
  fr: {
    m: "mètres",
    cm: "centimètres",
    mm: "millimètres",
    km: "kilomètres",
    s: "secondes",
    kg: "kilogrammes",
    degree: "degrés",
    radian: "radians",
  },
  pt: {
    m: "metros",
    cm: "centímetros",
    mm: "milímetros",
    km: "quilômetros",
    s: "segundos",
    kg: "quilogramas",
    degree: "graus",
    radian: "radianos",
  },
};

export function speechLexicon(language: MathLanguage) {
  return speech[language];
}

export function spokenUnit(symbol: string, language: MathLanguage): string {
  const value = units[language][symbol];
  if (!value) throw new Error(`TTS lexicon has no ${language} unit ${symbol}.`);
  return value;
}
