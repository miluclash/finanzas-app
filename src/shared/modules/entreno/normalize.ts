// Normalización de nombres para emparejar textos escritos de formas distintas ("Ski Erg" y
// "SkiErg", "Fuerza A" y "fuerza-a"): minúsculas, sin tildes y sin espacios ni signos.
// La usan el diccionario de estaciones HYROX y el emparejado de títulos de Hevy con los tipos de
// entreno. No sirve para "contiene": compara nombres enteros.

/** Minúsculas, sin tildes (la ñ queda como n) y solo letras y números (`"Paseo del Granjero!"` → `"paseodelgranjero"`). */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
