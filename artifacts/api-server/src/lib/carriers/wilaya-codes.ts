// Official 58-wilaya numeric codes. Several couriers (Maystro, Ecotrack family,
// ZR Express) require the numeric code, not the wilaya name.
const WILAYA_CODES: Record<string, number> = {
  "Adrar": 1, "Chlef": 2, "Laghouat": 3, "Oum El Bouaghi": 4, "Batna": 5,
  "Béjaïa": 6, "Bejaia": 6, "Biskra": 7, "Béchar": 8, "Bechar": 8, "Blida": 9,
  "Bouira": 10, "Tamanrasset": 11, "Tébessa": 12, "Tebessa": 12, "Tlemcen": 13,
  "Tiaret": 14, "Tizi Ouzou": 15, "Alger": 16, "Djelfa": 17, "Jijel": 18,
  "Sétif": 19, "Setif": 19, "Saïda": 20, "Saida": 20, "Skikda": 21,
  "Sidi Bel Abbès": 22, "Sidi Bel Abbes": 22, "Annaba": 23, "Guelma": 24,
  "Constantine": 25, "Médéa": 26, "Medea": 26, "Mostaganem": 27, "M'Sila": 28,
  "Msila": 28, "Mascara": 29, "Ouargla": 30, "Oran": 31, "El Bayadh": 32,
  "Illizi": 33, "Bordj Bou Arréridj": 34, "Bordj Bou Arreridj": 34,
  "Boumerdès": 35, "Boumerdes": 35, "El Tarf": 36, "Tindouf": 37,
  "Tissemsilt": 38, "El Oued": 39, "Khenchela": 40, "Souk Ahras": 41,
  "Tipaza": 42, "Mila": 43, "Aïn Defla": 44, "Ain Defla": 44, "Naâma": 45,
  "Naama": 45, "Aïn Témouchent": 46, "Ain Temouchent": 46, "Ghardaïa": 47,
  "Ghardaia": 47, "Relizane": 48, "Timimoun": 49, "Bordj Badji Mokhtar": 50,
  "Ouled Djellal": 51, "Béni Abbès": 52, "Beni Abbes": 52, "In Salah": 53,
  "In Guezzam": 54, "Touggourt": 55, "Djanet": 56, "El M'Ghair": 57,
  "El Meniaa": 58, "El Méniaa": 58,
};

// Falls back to 16 (Alger) when a name can't be resolved — callers should
// prefer collecting a real wilaya code from the store/order when possible.
export function getWilayaCode(wilayaName: string): number {
  if (WILAYA_CODES[wilayaName]) return WILAYA_CODES[wilayaName];
  const normalized = wilayaName.trim().toLowerCase();
  for (const [name, code] of Object.entries(WILAYA_CODES)) {
    if (name.toLowerCase() === normalized) return code;
  }
  return 16;
}
