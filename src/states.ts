// Finds the state a county is in from its Census code.

/** Each US state's and territory's two-digit Census code, then its postal abbreviation. */
const FIPS =
  "01al02ak04az05ar06ca08co09ct10de11dc12fl13ga15hi16id17il18in19ia20ks21ky22la23me24md25ma26mi27mn28ms29mo30mt31ne32nv33nh34nj35nm36ny37nc38nd39oh40ok41or42pa44ri45sc46sd47tn48tx49ut50vt51va53wa54wv55wi56wy60as66gu69mp72pr78vi";

/**
 * The state a US county is in. A county's 5-digit Census code starts with
 * its state's two-digit code.
 *
 * @param county The county's 5-digit Census code, such as `39049`.
 * @returns The state code, such as `us-oh`, or `null` for an unknown code.
 */
export function countyState(county: string): string | null {
  const prefix = county.slice(0, 2);
  for (let i = 0; i < FIPS.length; i += 4) {
    if (FIPS.slice(i, i + 2) === prefix)
      return `us-${FIPS.slice(i + 2, i + 4)}`;
  }
  return null;
}
