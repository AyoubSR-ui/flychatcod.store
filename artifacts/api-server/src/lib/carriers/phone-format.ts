// Algerian couriers generally expect the local 0XXXXXXXXX format, not the
// +213XXXXXXXXX international format customers' phone numbers are often
// stored in.
export function normalizeAlgerianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("213") && digits.length === 12) {
    return "0" + digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }
  if (digits.length === 9) {
    return "0" + digits;
  }
  return digits;
}
