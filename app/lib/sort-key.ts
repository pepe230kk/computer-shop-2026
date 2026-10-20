/**
 * Wspólna funkcja obliczania klucza sortowania nazw (Lab 06/07/08).
 * W połączeniu z kolumną bazy danych TEXT COLLATE "C" zapewnia deterministyczne
 * porównywanie bajtów UTF-8 (zgodne z Buffer.compare z Lab 06).
 */
export function calculateNameSortKey(name: string): string {
  return name;
}
