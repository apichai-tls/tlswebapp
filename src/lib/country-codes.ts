export interface CountryCodeItem {
  code: string;       // e.g. "+66", "+1", "+44"
  country: string;    // e.g. "Thailand", "United States", "United Kingdom"
  flag: string;       // Flag emoji
  iso: string;        // 2-letter ISO country code
  priority?: number;  // 1 = top priority/frequent in Thailand POS
}

export const COUNTRY_CODES: CountryCodeItem[] = [
  // Top Frequent Countries (Thailand Tourism, Business, Expats)
  { code: "+66", country: "Thailand", flag: "🇹🇭", iso: "TH", priority: 1 },
  { code: "+1", country: "United States / Canada", flag: "🇺🇸", iso: "US", priority: 1 },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧", iso: "GB", priority: 1 },
  { code: "+852", country: "Hong Kong", flag: "🇭🇰", iso: "HK", priority: 1 },
  { code: "+65", country: "Singapore", flag: "🇸🇬", iso: "SG", priority: 1 },
  { code: "+81", country: "Japan", flag: "🇯🇵", iso: "JP", priority: 1 },
  { code: "+82", country: "South Korea", flag: "🇰🇷", iso: "KR", priority: 1 },
  { code: "+86", country: "China", flag: "🇨🇳", iso: "CN", priority: 1 },
  { code: "+61", country: "Australia", flag: "🇦🇺", iso: "AU", priority: 1 },
  { code: "+49", country: "Germany", flag: "🇩🇪", iso: "DE", priority: 1 },
  { code: "+33", country: "France", flag: "🇫🇷", iso: "FR", priority: 1 },
  { code: "+7", country: "Russia / Kazakhstan", flag: "🇷🇺", iso: "RU", priority: 1 },
  { code: "+91", country: "India", flag: "🇮🇳", iso: "IN", priority: 1 },
  { code: "+886", country: "Taiwan", flag: "🇹🇼", iso: "TW", priority: 1 },
  { code: "+60", country: "Malaysia", flag: "🇲🇾", iso: "MY", priority: 1 },
  { code: "+971", country: "United Arab Emirates", flag: "🇦🇪", iso: "AE", priority: 1 },
  { code: "+41", country: "Switzerland", flag: "🇨🇭", iso: "CH", priority: 1 },
  { code: "+39", country: "Italy", flag: "🇮🇹", iso: "IT", priority: 1 },
  { code: "+31", country: "Netherlands", flag: "🇳🇱", iso: "NL", priority: 1 },
  { code: "+62", country: "Indonesia", flag: "🇮🇩", iso: "ID", priority: 1 },
  { code: "+63", country: "Philippines", flag: "🇵🇭", iso: "PH", priority: 1 },
  { code: "+84", country: "Vietnam", flag: "🇻🇳", iso: "VN", priority: 1 },
  { code: "+46", country: "Sweden", flag: "🇸🇪", iso: "SE", priority: 1 },
  { code: "+34", country: "Spain", flag: "🇪🇸", iso: "ES", priority: 1 },
  { code: "+95", country: "Myanmar", flag: "🇲🇲", iso: "MM", priority: 1 },
  { code: "+855", country: "Cambodia", flag: "🇰🇭", iso: "KH", priority: 1 },
  { code: "+856", country: "Laos", flag: "🇱🇦", iso: "LA", priority: 1 },
  { code: "+853", country: "Macau", flag: "🇲🇴", iso: "MO", priority: 1 },
  { code: "+64", country: "New Zealand", flag: "🇳🇿", iso: "NZ", priority: 1 },
  { code: "+974", country: "Qatar", flag: "🇶🇦", iso: "QA", priority: 1 },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦", iso: "SA", priority: 1 },
  { code: "+972", country: "Israel", flag: "🇮🇱", iso: "IL", priority: 1 },

  // All World Countries & Territories (Alphabetical order)
  { code: "+93", country: "Afghanistan", flag: "🇦🇫", iso: "AF" },
  { code: "+355", country: "Albania", flag: "🇦🇱", iso: "AL" },
  { code: "+213", country: "Algeria", flag: "🇩🇿", iso: "DZ" },
  { code: "+1684", country: "American Samoa", flag: "🇦🇸", iso: "AS" },
  { code: "+376", country: "Andorra", flag: "🇦🇩", iso: "AD" },
  { code: "+244", country: "Angola", flag: "🇦🇴", iso: "AO" },
  { code: "+1264", country: "Anguilla", flag: "🇦🇮", iso: "AI" },
  { code: "+1268", country: "Antigua and Barbuda", flag: "🇦🇬", iso: "AG" },
  { code: "+54", country: "Argentina", flag: "🇦🇷", iso: "AR" },
  { code: "+374", country: "Armenia", flag: "🇦🇲", iso: "AM" },
  { code: "+297", country: "Aruba", flag: "🇦🇼", iso: "AW" },
  { code: "+247", country: "Ascension Island", flag: "🇦🇨", iso: "AC" },
  { code: "+43", country: "Austria", flag: "🇦🇹", iso: "AT" },
  { code: "+994", country: "Azerbaijan", flag: "🇦🇿", iso: "AZ" },
  { code: "+1242", country: "Bahamas", flag: "🇧🇸", iso: "BS" },
  { code: "+973", country: "Bahrain", flag: "🇧🇭", iso: "BH" },
  { code: "+880", country: "Bangladesh", flag: "🇧🇩", iso: "BD" },
  { code: "+1246", country: "Barbados", flag: "🇧🇧", iso: "BB" },
  { code: "+375", country: "Belarus", flag: "🇧🇾", iso: "BY" },
  { code: "+32", country: "Belgium", flag: "🇧🇪", iso: "BE" },
  { code: "+501", country: "Belize", flag: "🇧🇿", iso: "BZ" },
  { code: "+229", country: "Benin", flag: "🇧🇯", iso: "BJ" },
  { code: "+1441", country: "Bermuda", flag: "🇧🇲", iso: "BM" },
  { code: "+975", country: "Bhutan", flag: "🇧🇹", iso: "BT" },
  { code: "+591", country: "Bolivia", flag: "🇧🇴", iso: "BO" },
  { code: "+599", country: "Bonaire, Sint Eustatius and Saba", flag: "🇧🇶", iso: "BQ" },
  { code: "+387", country: "Bosnia and Herzegovina", flag: "🇧🇦", iso: "BA" },
  { code: "+267", country: "Botswana", flag: "🇧🇼", iso: "BW" },
  { code: "+55", country: "Brazil", flag: "🇧🇷", iso: "BR" },
  { code: "+246", country: "British Indian Ocean Territory", flag: "🇮🇴", iso: "IO" },
  { code: "+1284", country: "British Virgin Islands", flag: "🇻🇬", iso: "VG" },
  { code: "+673", country: "Brunei", flag: "🇧🇳", iso: "BN" },
  { code: "+359", country: "Bulgaria", flag: "🇧🇬", iso: "BG" },
  { code: "+226", country: "Burkina Faso", flag: "🇧🇫", iso: "BF" },
  { code: "+257", country: "Burundi", flag: "🇧🇮", iso: "BI" },
  { code: "+238", country: "Cape Verde", flag: "🇨🇻", iso: "CV" },
  { code: "+1345", country: "Cayman Islands", flag: "🇰🇾", iso: "KY" },
  { code: "+236", country: "Central African Republic", flag: "🇨🇫", iso: "CF" },
  { code: "+235", country: "Chad", flag: "🇹🇩", iso: "TD" },
  { code: "+56", country: "Chile", flag: "🇨🇱", iso: "CL" },
  { code: "+57", country: "Colombia", flag: "🇨🇴", iso: "CO" },
  { code: "+269", country: "Comoros", flag: "🇰🇲", iso: "KM" },
  { code: "+242", country: "Congo (Republic)", flag: "🇨🇬", iso: "CG" },
  { code: "+243", country: "Congo (DRC)", flag: "🇨🇩", iso: "CD" },
  { code: "+682", country: "Cook Islands", flag: "🇨🇰", iso: "CK" },
  { code: "+506", country: "Costa Rica", flag: "🇨🇷", iso: "CR" },
  { code: "+385", country: "Croatia", flag: "🇭🇷", iso: "HR" },
  { code: "+53", country: "Cuba", flag: "🇨🇺", iso: "CU" },
  { code: "+599", country: "Curaçao", flag: "🇨🇼", iso: "CW" },
  { code: "+357", country: "Cyprus", flag: "🇨🇾", iso: "CY" },
  { code: "+420", country: "Czech Republic", flag: "🇨🇿", iso: "CZ" },
  { code: "+45", country: "Denmark", flag: "🇩🇰", iso: "DK" },
  { code: "+253", country: "Djibouti", flag: "🇩🇯", iso: "DJ" },
  { code: "+1767", country: "Dominica", flag: "🇩🇲", iso: "DM" },
  { code: "+1809", country: "Dominican Republic", flag: "🇩🇴", iso: "DO" },
  { code: "+670", country: "East Timor (Timor-Leste)", flag: "🇹🇱", iso: "TL" },
  { code: "+593", country: "Ecuador", flag: "🇪🇨", iso: "EC" },
  { code: "+20", country: "Egypt", flag: "🇪🇬", iso: "EG" },
  { code: "+503", country: "El Salvador", flag: "🇸🇻", iso: "SV" },
  { code: "+240", country: "Equatorial Guinea", flag: "🇬🇶", iso: "GQ" },
  { code: "+291", country: "Eritrea", flag: "🇪🇷", iso: "ER" },
  { code: "+372", country: "Estonia", flag: "🇪🇪", iso: "EE" },
  { code: "+268", country: "Eswatini", flag: "🇸🇿", iso: "SZ" },
  { code: "+251", country: "Ethiopia", flag: "🇪🇹", iso: "ET" },
  { code: "+500", country: "Falkland Islands", flag: "🇫🇰", iso: "FK" },
  { code: "+298", country: "Faroe Islands", flag: "🇫🇴", iso: "FO" },
  { code: "+679", country: "Fiji", flag: "🇫🇯", iso: "FJ" },
  { code: "+358", country: "Finland", flag: "🇫🇮", iso: "FI" },
  { code: "+594", country: "French Guiana", flag: "🇬🇫", iso: "GF" },
  { code: "+689", country: "French Polynesia", flag: "🇵🇫", iso: "PF" },
  { code: "+241", country: "Gabon", flag: "🇬🇦", iso: "GA" },
  { code: "+220", country: "Gambia", flag: "🇬🇲", iso: "GM" },
  { code: "+995", country: "Georgia", flag: "🇬🇪", iso: "GE" },
  { code: "+233", country: "Ghana", flag: "🇬🇭", iso: "GH" },
  { code: "+350", country: "Gibraltar", flag: "🇬🇮", iso: "GI" },
  { code: "+30", country: "Greece", flag: "🇬🇷", iso: "GR" },
  { code: "+299", country: "Greenland", flag: "🇬🇱", iso: "GL" },
  { code: "+1473", country: "Grenada", flag: "🇬🇩", iso: "GD" },
  { code: "+590", country: "Guadeloupe", flag: "🇬🇵", iso: "GP" },
  { code: "+1671", country: "Guam", flag: "🇬🇺", iso: "GU" },
  { code: "+502", country: "Guatemala", flag: "🇬🇹", iso: "GT" },
  { code: "+441481", country: "Guernsey", flag: "🇬🇬", iso: "GG" },
  { code: "+224", country: "Guinea", flag: "🇬🇳", iso: "GN" },
  { code: "+245", country: "Guinea-Bissau", flag: "🇬🇼", iso: "GW" },
  { code: "+592", country: "Guyana", flag: "🇬🇾", iso: "GY" },
  { code: "+509", country: "Haiti", flag: "🇭🇹", iso: "HT" },
  { code: "+504", country: "Honduras", flag: "🇭🇳", iso: "HN" },
  { code: "+36", country: "Hungary", flag: "🇭🇺", iso: "HU" },
  { code: "+354", country: "Iceland", flag: "🇮🇸", iso: "IS" },
  { code: "+98", country: "Iran", flag: "🇮🇷", iso: "IR" },
  { code: "+964", country: "Iraq", flag: "🇮🇶", iso: "IQ" },
  { code: "+353", country: "Ireland", flag: "🇮🇪", iso: "IE" },
  { code: "+441624", country: "Isle of Man", flag: "🇮🇲", iso: "IM" },
  { code: "+225", country: "Ivory Coast", flag: "🇨🇮", iso: "CI" },
  { code: "+1876", country: "Jamaica", flag: "🇯🇲", iso: "JM" },
  { code: "+441534", country: "Jersey", flag: "🇯🇪", iso: "JE" },
  { code: "+962", country: "Jordan", flag: "🇯🇴", iso: "JO" },
  { code: "+254", country: "Kenya", flag: "🇰🇪", iso: "KE" },
  { code: "+686", country: "Kiribati", flag: "🇰🇮", iso: "KI" },
  { code: "+383", country: "Kosovo", flag: "🇽🇰", iso: "XK" },
  { code: "+965", country: "Kuwait", flag: "🇰🇼", iso: "KW" },
  { code: "+996", country: "Kyrgyzstan", flag: "🇰🇬", iso: "KG" },
  { code: "+371", country: "Latvia", flag: "🇱🇻", iso: "LV" },
  { code: "+961", country: "Lebanon", flag: "🇱🇧", iso: "LB" },
  { code: "+266", country: "Lesotho", flag: "🇱🇸", iso: "LS" },
  { code: "+231", country: "Liberia", flag: "🇱🇷", iso: "LR" },
  { code: "+218", country: "Libya", flag: "🇱🇾", iso: "LY" },
  { code: "+423", country: "Liechtenstein", flag: "🇱🇮", iso: "LI" },
  { code: "+370", country: "Lithuania", flag: "🇱🇹", iso: "LT" },
  { code: "+352", country: "Luxembourg", flag: "🇱🇺", iso: "LU" },
  { code: "+261", country: "Madagascar", flag: "🇲🇬", iso: "MG" },
  { code: "+265", country: "Malawi", flag: "🇲🇼", iso: "MW" },
  { code: "+960", country: "Maldives", flag: "🇲🇻", iso: "MV" },
  { code: "+223", country: "Mali", flag: "🇲🇱", iso: "ML" },
  { code: "+356", country: "Malta", flag: "🇲🇹", iso: "MT" },
  { code: "+692", country: "Marshall Islands", flag: "🇲🇭", iso: "MH" },
  { code: "+596", country: "Martinique", flag: "🇲🇶", iso: "MQ" },
  { code: "+222", country: "Mauritania", flag: "🇲🇷", iso: "MR" },
  { code: "+230", country: "Mauritius", flag: "🇲🇺", iso: "MU" },
  { code: "+262", country: "Mayotte", flag: "🇾🇹", iso: "YT" },
  { code: "+52", country: "Mexico", flag: "🇲🇽", iso: "MX" },
  { code: "+691", country: "Micronesia", flag: "🇫🇲", iso: "FM" },
  { code: "+373", country: "Moldova", flag: "🇲🇩", iso: "MD" },
  { code: "+377", country: "Monaco", flag: "🇲🇨", iso: "MC" },
  { code: "+976", country: "Mongolia", flag: "🇲🇳", iso: "MN" },
  { code: "+382", country: "Montenegro", flag: "🇲🇪", iso: "ME" },
  { code: "+1664", country: "Montserrat", flag: "🇲🇸", iso: "MS" },
  { code: "+212", country: "Morocco", flag: "🇲🇦", iso: "MA" },
  { code: "+258", country: "Mozambique", flag: "🇲🇿", iso: "MZ" },
  { code: "+264", country: "Namibia", flag: "🇳🇦", iso: "NA" },
  { code: "+674", country: "Nauru", flag: "🇳🇷", iso: "NR" },
  { code: "+977", country: "Nepal", flag: "🇳🇵", iso: "NP" },
  { code: "+687", country: "New Caledonia", flag: "🇳🇨", iso: "NC" },
  { code: "+505", country: "Nicaragua", flag: "🇳🇮", iso: "NI" },
  { code: "+227", country: "Niger", flag: "🇳🇪", iso: "NE" },
  { code: "+234", country: "Nigeria", flag: "🇳🇬", iso: "NG" },
  { code: "+683", country: "Niue", flag: "🇳🇺", iso: "NU" },
  { code: "+672", country: "Norfolk Island", flag: "🇳🇫", iso: "NF" },
  { code: "+850", country: "North Korea", flag: "🇰🇵", iso: "KP" },
  { code: "+389", country: "North Macedonia", flag: "🇲🇰", iso: "MK" },
  { code: "+1670", country: "Northern Mariana Islands", flag: "🇲🇵", iso: "MP" },
  { code: "+47", country: "Norway", flag: "🇳🇴", iso: "NO" },
  { code: "+968", country: "Oman", flag: "🇴🇲", iso: "OM" },
  { code: "+92", country: "Pakistan", flag: "🇵🇰", iso: "PK" },
  { code: "+680", country: "Palau", flag: "🇵🇼", iso: "PW" },
  { code: "+970", country: "Palestine", flag: "🇵🇸", iso: "PS" },
  { code: "+507", country: "Panama", flag: "🇵🇦", iso: "PA" },
  { code: "+675", country: "Papua New Guinea", flag: "🇵🇬", iso: "PG" },
  { code: "+595", country: "Paraguay", flag: "🇵🇾", iso: "PY" },
  { code: "+51", country: "Peru", flag: "🇵🇪", iso: "PE" },
  { code: "+48", country: "Poland", flag: "🇵🇱", iso: "PL" },
  { code: "+351", country: "Portugal", flag: "🇵🇹", iso: "PT" },
  { code: "+1787", country: "Puerto Rico", flag: "🇵🇷", iso: "PR" },
  { code: "+262", country: "Reunion", flag: "🇷🇪", iso: "RE" },
  { code: "+40", country: "Romania", flag: "🇷🇴", iso: "RO" },
  { code: "+250", country: "Rwanda", flag: "🇷🇼", iso: "RW" },
  { code: "+290", country: "Saint Helena", flag: "🇸🇭", iso: "SH" },
  { code: "+1869", country: "Saint Kitts and Nevis", flag: "🇰🇳", iso: "KN" },
  { code: "+1758", country: "Saint Lucia", flag: "🇱🇨", iso: "LC" },
  { code: "+590", country: "Saint Martin", flag: "🇲🇫", iso: "MF" },
  { code: "+508", country: "Saint Pierre and Miquelon", flag: "🇵🇲", iso: "PM" },
  { code: "+1784", country: "Saint Vincent and the Grenadines", flag: "🇻🇨", iso: "VC" },
  { code: "+685", country: "Samoa", flag: "🇼🇸", iso: "WS" },
  { code: "+378", country: "San Marino", flag: "🇸🇲", iso: "SM" },
  { code: "+239", country: "Sao Tome and Principe", flag: "🇸🇹", iso: "ST" },
  { code: "+221", country: "Senegal", flag: "🇸🇳", iso: "SN" },
  { code: "+381", country: "Serbia", flag: "🇷🇸", iso: "RS" },
  { code: "+248", country: "Seychelles", flag: "🇸🇨", iso: "SC" },
  { code: "+232", country: "Sierra Leone", flag: "🇸🇱", iso: "SL" },
  { code: "+1721", country: "Sint Maarten", flag: "🇸🇽", iso: "SX" },
  { code: "+421", country: "Slovakia", flag: "🇸🇰", iso: "SK" },
  { code: "+386", country: "Slovenia", flag: "🇸🇮", iso: "SI" },
  { code: "+677", country: "Solomon Islands", flag: "🇸🇧", iso: "SB" },
  { code: "+252", country: "Somalia", flag: "🇸🇴", iso: "SO" },
  { code: "+27", country: "South Africa", flag: "🇿🇦", iso: "ZA" },
  { code: "+211", country: "South Sudan", flag: "🇸🇸", iso: "SS" },
  { code: "+94", country: "Sri Lanka", flag: "🇱🇰", iso: "LK" },
  { code: "+249", country: "Sudan", flag: "🇸🇩", iso: "SD" },
  { code: "+597", country: "Suriname", flag: "🇸🇷", iso: "SR" },
  { code: "+4779", country: "Svalbard and Jan Mayen", flag: "🇸🇯", iso: "SJ" },
  { code: "+963", country: "Syria", flag: "🇸🇾", iso: "SY" },
  { code: "+992", country: "Tajikistan", flag: "🇹🇯", iso: "TJ" },
  { code: "+255", country: "Tanzania", flag: "🇹🇿", iso: "TZ" },
  { code: "+228", country: "Togo", flag: "🇹🇬", iso: "TG" },
  { code: "+690", country: "Tokelau", flag: "🇹🇰", iso: "TK" },
  { code: "+676", country: "Tonga", flag: "🇹🇴", iso: "TO" },
  { code: "+1868", country: "Trinidad and Tobago", flag: "🇹🇹", iso: "TT" },
  { code: "+216", country: "Tunisia", flag: "🇹🇳", iso: "TN" },
  { code: "+90", country: "Turkey", flag: "🇹🇷", iso: "TR" },
  { code: "+993", country: "Turkmenistan", flag: "🇹🇲", iso: "TM" },
  { code: "+1649", country: "Turks and Caicos Islands", flag: "🇹🇨", iso: "TC" },
  { code: "+688", country: "Tuvalu", flag: "🇹🇻", iso: "TV" },
  { code: "+256", country: "Uganda", flag: "🇺🇬", iso: "UG" },
  { code: "+380", country: "Ukraine", flag: "🇺🇦", iso: "UA" },
  { code: "+598", country: "Uruguay", flag: "🇺🇾", iso: "UY" },
  { code: "+1340", country: "US Virgin Islands", flag: "🇻🇮", iso: "VI" },
  { code: "+998", country: "Uzbekistan", flag: "🇺🇿", iso: "UZ" },
  { code: "+678", country: "Vanuatu", flag: "🇻🇺", iso: "VU" },
  { code: "+379", country: "Vatican City", flag: "🇻🇦", iso: "VA" },
  { code: "+58", country: "Venezuela", flag: "🇻🇪", iso: "VE" },
  { code: "+681", country: "Wallis and Futuna", flag: "🇼🇫", iso: "WF" },
  { code: "+967", country: "Yemen", flag: "🇾🇪", iso: "YE" },
  { code: "+260", country: "Zambia", flag: "🇿🇲", iso: "ZM" },
  { code: "+263", country: "Zimbabwe", flag: "🇿🇼", iso: "ZW" }
];

/**
 * Normalizes user typed country code (e.g. "44" -> "+44", "+44" -> "+44")
 */
export function normalizeCountryCode(code: string): string {
  const cleaned = code.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

/**
 * Finds matching country by exact dial code (e.g. "+852") or ISO ("HK")
 */
export function findCountryByCode(code: string): CountryCodeItem | undefined {
  const norm = normalizeCountryCode(code);
  return COUNTRY_CODES.find(c => c.code === norm) || COUNTRY_CODES.find(c => c.iso.toUpperCase() === code.trim().toUpperCase());
}

/**
 * Search countries by dial code, country name, or ISO code
 */
export function searchCountries(query: string): CountryCodeItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // Return all, with priority items first
    return [...COUNTRY_CODES].sort((a, b) => {
      const pA = a.priority ?? 99;
      const pB = b.priority ?? 99;
      if (pA !== pB) return pA - pB;
      return a.country.localeCompare(b.country);
    });
  }

  const cleanNum = q.replace(/[^\d]/g, "");

  return COUNTRY_CODES.filter(item => {
    // Match dial code (with or without '+')
    if (cleanNum && item.code.replace(/[^\d]/g, "").includes(cleanNum)) {
      return true;
    }
    // Match country name
    if (item.country.toLowerCase().includes(q)) {
      return true;
    }
    // Match ISO code
    if (item.iso.toLowerCase() === q) {
      return true;
    }
    return false;
  }).sort((a, b) => {
    // Exact code match first
    const normQ = normalizeCountryCode(q);
    if (a.code === normQ) return -1;
    if (b.code === normQ) return 1;

    // Starts with country name
    const aStarts = a.country.toLowerCase().startsWith(q);
    const bStarts = b.country.toLowerCase().startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const pA = a.priority ?? 99;
    const pB = b.priority ?? 99;
    if (pA !== pB) return pA - pB;

    return a.country.localeCompare(b.country);
  });
}

/**
 * Parses full phone string (e.g. "+44 7911 123456" or "+85291234567") into code and national number
 */
export function parseFullPhone(fullPhone: string): { countryCode: string; nationalNumber: string } {
  const raw = fullPhone.trim();
  if (!raw.startsWith("+")) {
    return { countryCode: "+1", nationalNumber: raw };
  }

  // If there is an explicit space after the code
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx > 1) {
    const candidateCode = raw.substring(0, spaceIdx);
    const remaining = raw.substring(spaceIdx + 1).trim();
    return { countryCode: candidateCode, nationalNumber: remaining };
  }

  // Otherwise, match longest country code prefix
  const digitsOnly = raw.replace(/[^\d]/g, "");
  // Check lengths 4 down to 1
  for (let len = 4; len >= 1; len--) {
    const prefix = `+${digitsOnly.substring(0, len)}`;
    const matched = COUNTRY_CODES.find(c => c.code === prefix);
    if (matched) {
      return {
        countryCode: matched.code,
        nationalNumber: digitsOnly.substring(len),
      };
    }
  }

  return { countryCode: "+1", nationalNumber: raw.replace(/^\+/, "") };
}
