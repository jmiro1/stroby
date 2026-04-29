/**
 * Phone-number sanitization for use in PostgREST `.or()` filters.
 *
 * Returning an unsanitized phone string into a filter template like
 * `phone.eq.${phone}` is a query-injection sink — a value of "1,id.not.is.null"
 * turns into `phone.eq.1,id.not.is.null` which PostgREST parses as
 * "phone=1 OR id IS NOT NULL". Service-role queries (which most of these
 * paths use) skip RLS, so the injection matches every row.
 *
 * `cleanPhoneStrict` strips ALL non-digit characters and validates the
 * resulting length. Callers must check for null before using the value.
 */

/** Min/max digits in a valid international phone number (E.164: 8-15 digits). */
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

export function cleanPhoneStrict(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return null;
  return digits;
}

/** Build the `.or()` filter "phone.eq.X,phone.eq.+X" from a cleaned phone. */
export function phoneOrFilter(cleanedPhone: string): string {
  return `phone.eq.${cleanedPhone},phone.eq.+${cleanedPhone}`;
}
