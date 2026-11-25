export interface WorldCountryCode {
  code: string; // Digits only, e.g. "66", "351", "1"
  iso: string; // ISO 3166-1 alpha-2, e.g. "TH", "PT", "US"
  name: string;
  aliases?: string[];
}

/**
 * Complete ITU-T E.164 world calling codes (~235 countries/territories).
 * Thailand (+66) is pinned first as the default, followed by common tourist/expat countries,
 * then the rest of the world alphabetically.
 */
export const WORLD_COUNTRY_CODES: WorldCountryCode[] = [
  // Pinned top: Thailand + frequent tourist/expat origins
  { code: '66', iso: 'TH', name: 'Thailand', aliases: ['ไทย', 'thai', 'bkk', 'bangkok'] },
  { code: '1', iso: 'US', name: 'United States / Canada', aliases: ['usa', 'america', 'canada', 'ca'] },
  { code: '44', iso: 'GB', name: 'United Kingdom', aliases: ['uk', 'britain', 'england', 'london'] },
  { code: '65', iso: 'SG', name: 'Singapore', aliases: ['สิงคโปร์'] },
  { code: '61', iso: 'AU', name: 'Australia', aliases: ['aus', 'ออสเตรเลีย'] },
  { code: '81', iso: 'JP', name: 'Japan', aliases: ['ญี่ปุ่น'] },
  { code: '82', iso: 'KR', name: 'South Korea', aliases: ['korea', 'เกาหลี'] },
  { code: '86', iso: 'CN', name: 'China', aliases: ['จีน', 'prc'] },
  { code: '852', iso: 'HK', name: 'Hong Kong', aliases: ['ฮ่องกง'] },
  { code: '886', iso: 'TW', name: 'Taiwan', aliases: ['ไต้หวัน'] },
  { code: '60', iso: 'MY', name: 'Malaysia', aliases: ['มาเลเซีย'] },
  { code: '62', iso: 'ID', name: 'Indonesia', aliases: ['อินโดนีเซีย'] },
  { code: '84', iso: 'VN', name: 'Vietnam', aliases: ['เวียดนาม'] },
  { code: '63', iso: 'PH', name: 'Philippines', aliases: ['ฟิลิปปินส์'] },
  { code: '91', iso: 'IN', name: 'India', aliases: ['อินเดีย'] },
  { code: '971', iso: 'AE', name: 'United Arab Emirates', aliases: ['uae', 'dubai', 'abu dhabi', 'ดูไบ'] },
  { code: '33', iso: 'FR', name: 'France', aliases: ['ฝรั่งเศส'] },
  { code: '49', iso: 'DE', name: 'Germany', aliases: ['เยอรมัน', 'deutschland'] },
  { code: '7', iso: 'RU', name: 'Russia / Kazakhstan', aliases: ['รัสเซีย', 'kz'] },
  { code: '39', iso: 'IT', name: 'Italy', aliases: ['อิตาลี'] },
  { code: '34', iso: 'ES', name: 'Spain', aliases: ['สเปน'] },
  { code: '351', iso: 'PT', name: 'Portugal', aliases: ['โปรตุเกส'] },
  { code: '31', iso: 'NL', name: 'Netherlands', aliases: ['holland', 'dutch', 'เนเธอร์แลนด์'] },
  { code: '41', iso: 'CH', name: 'Switzerland', aliases: ['swiss', 'สวิตเซอร์แลนด์'] },
  { code: '46', iso: 'SE', name: 'Sweden', aliases: ['สวีเดน'] },
  { code: '47', iso: 'NO', name: 'Norway', aliases: ['นอร์เวย์'] },
  { code: '45', iso: 'DK', name: 'Denmark', aliases: ['เดนมาร์ก'] },
  { code: '64', iso: 'NZ', name: 'New Zealand', aliases: ['นิวซีแลนด์'] },
  { code: '972', iso: 'IL', name: 'Israel', aliases: ['อิสราเอล'] },
  { code: '966', iso: 'SA', name: 'Saudi Arabia', aliases: ['ซาอุดีอาระเบีย', 'ksa'] },

  // Complete world list (A–Z)
  { code: '93', iso: 'AF', name: 'Afghanistan' },
  { code: '355', iso: 'AL', name: 'Albania' },
  { code: '213', iso: 'DZ', name: 'Algeria' },
  { code: '1684', iso: 'AS', name: 'American Samoa' },
  { code: '376', iso: 'AD', name: 'Andorra' },
  { code: '244', iso: 'AO', name: 'Angola' },
  { code: '1264', iso: 'AI', name: 'Anguilla' },
  { code: '1268', iso: 'AG', name: 'Antigua and Barbuda' },
  { code: '54', iso: 'AR', name: 'Argentina' },
  { code: '374', iso: 'AM', name: 'Armenia' },
  { code: '297', iso: 'AW', name: 'Aruba' },
  { code: '43', iso: 'AT', name: 'Austria' },
  { code: '994', iso: 'AZ', name: 'Azerbaijan' },
  { code: '1242', iso: 'BS', name: 'Bahamas' },
  { code: '973', iso: 'BH', name: 'Bahrain' },
  { code: '880', iso: 'BD', name: 'Bangladesh' },
  { code: '1246', iso: 'BB', name: 'Barbados' },
  { code: '375', iso: 'BY', name: 'Belarus' },
  { code: '32', iso: 'BE', name: 'Belgium' },
  { code: '501', iso: 'BZ', name: 'Belize' },
  { code: '229', iso: 'BJ', name: 'Benin' },
  { code: '1441', iso: 'BM', name: 'Bermuda' },
  { code: '975', iso: 'BT', name: 'Bhutan' },
  { code: '591', iso: 'BO', name: 'Bolivia' },
  { code: '387', iso: 'BA', name: 'Bosnia and Herzegovina' },
  { code: '267', iso: 'BW', name: 'Botswana' },
  { code: '55', iso: 'BR', name: 'Brazil' },
  { code: '1284', iso: 'VG', name: 'British Virgin Islands' },
  { code: '673', iso: 'BN', name: 'Brunei' },
  { code: '359', iso: 'BG', name: 'Bulgaria' },
  { code: '226', iso: 'BF', name: 'Burkina Faso' },
  { code: '257', iso: 'BI', name: 'Burundi' },
  { code: '855', iso: 'KH', name: 'Cambodia', aliases: ['กัมพูชา'] },
  { code: '237', iso: 'CM', name: 'Cameroon' },
  { code: '238', iso: 'CV', name: 'Cape Verde' },
  { code: '1345', iso: 'KY', name: 'Cayman Islands' },
  { code: '236', iso: 'CF', name: 'Central African Republic' },
  { code: '235', iso: 'TD', name: 'Chad' },
  { code: '56', iso: 'CL', name: 'Chile' },
  { code: '57', iso: 'CO', name: 'Colombia' },
  { code: '269', iso: 'KM', name: 'Comoros' },
  { code: '242', iso: 'CG', name: 'Congo (Republic)' },
  { code: '243', iso: 'CD', name: 'Congo (DR)' },
  { code: '682', iso: 'CK', name: 'Cook Islands' },
  { code: '506', iso: 'CR', name: 'Costa Rica' },
  { code: '225', iso: 'CI', name: "Cote d'Ivoire", aliases: ['ivory coast'] },
  { code: '385', iso: 'HR', name: 'Croatia' },
  { code: '53', iso: 'CU', name: 'Cuba' },
  { code: '599', iso: 'CW', name: 'Curacao' },
  { code: '357', iso: 'CY', name: 'Cyprus' },
  { code: '420', iso: 'CZ', name: 'Czech Republic', aliases: ['czechia'] },
  { code: '253', iso: 'DJ', name: 'Djibouti' },
  { code: '1767', iso: 'DM', name: 'Dominica' },
  { code: '1809', iso: 'DO', name: 'Dominican Republic' },
  { code: '593', iso: 'EC', name: 'Ecuador' },
  { code: '20', iso: 'EG', name: 'Egypt' },
  { code: '503', iso: 'SV', name: 'El Salvador' },
  { code: '240', iso: 'GQ', name: 'Equatorial Guinea' },
  { code: '291', iso: 'ER', name: 'Eritrea' },
  { code: '372', iso: 'EE', name: 'Estonia' },
  { code: '268', iso: 'SZ', name: 'Eswatini', aliases: ['swaziland'] },
  { code: '251', iso: 'ET', name: 'Ethiopia' },
  { code: '500', iso: 'FK', name: 'Falkland Islands' },
  { code: '298', iso: 'FO', name: 'Faroe Islands' },
  { code: '679', iso: 'FJ', name: 'Fiji' },
  { code: '358', iso: 'FI', name: 'Finland' },
  { code: '594', iso: 'GF', name: 'French Guiana' },
  { code: '689', iso: 'PF', name: 'French Polynesia' },
  { code: '241', iso: 'GA', name: 'Gabon' },
  { code: '220', iso: 'GM', name: 'Gambia' },
  { code: '995', iso: 'GE', name: 'Georgia' },
  { code: '233', iso: 'GH', name: 'Ghana' },
  { code: '350', iso: 'GI', name: 'Gibraltar' },
  { code: '30', iso: 'GR', name: 'Greece' },
  { code: '299', iso: 'GL', name: 'Greenland' },
  { code: '1473', iso: 'GD', name: 'Grenada' },
  { code: '590', iso: 'GP', name: 'Guadeloupe' },
  { code: '1671', iso: 'GU', name: 'Guam' },
  { code: '502', iso: 'GT', name: 'Guatemala' },
  { code: '224', iso: 'GN', name: 'Guinea' },
  { code: '245', iso: 'GW', name: 'Guinea-Bissau' },
  { code: '592', iso: 'GY', name: 'Guyana' },
  { code: '509', iso: 'HT', name: 'Haiti' },
  { code: '504', iso: 'HN', name: 'Honduras' },
  { code: '36', iso: 'HU', name: 'Hungary' },
  { code: '354', iso: 'IS', name: 'Iceland' },
  { code: '98', iso: 'IR', name: 'Iran' },
  { code: '964', iso: 'IQ', name: 'Iraq' },
  { code: '353', iso: 'IE', name: 'Ireland' },
  { code: '1876', iso: 'JM', name: 'Jamaica' },
  { code: '962', iso: 'JO', name: 'Jordan' },
  { code: '254', iso: 'KE', name: 'Kenya' },
  { code: '686', iso: 'KI', name: 'Kiribati' },
  { code: '383', iso: 'XK', name: 'Kosovo' },
  { code: '965', iso: 'KW', name: 'Kuwait' },
  { code: '996', iso: 'KG', name: 'Kyrgyzstan' },
  { code: '856', iso: 'LA', name: 'Laos', aliases: ['ลาว'] },
  { code: '371', iso: 'LV', name: 'Latvia' },
  { code: '961', iso: 'LB', name: 'Lebanon' },
  { code: '266', iso: 'LS', name: 'Lesotho' },
  { code: '231', iso: 'LR', name: 'Liberia' },
  { code: '218', iso: 'LY', name: 'Libya' },
  { code: '423', iso: 'LI', name: 'Liechtenstein' },
  { code: '370', iso: 'LT', name: 'Lithuania' },
  { code: '352', iso: 'LU', name: 'Luxembourg' },
  { code: '853', iso: 'MO', name: 'Macau', aliases: ['มาเก๊า'] },
  { code: '261', iso: 'MG', name: 'Madagascar' },
  { code: '265', iso: 'MW', name: 'Malawi' },
  { code: '960', iso: 'MV', name: 'Maldives' },
  { code: '223', iso: 'ML', name: 'Mali' },
  { code: '356', iso: 'MT', name: 'Malta' },
  { code: '692', iso: 'MH', name: 'Marshall Islands' },
  { code: '596', iso: 'MQ', name: 'Martinique' },
  { code: '222', iso: 'MR', name: 'Mauritania' },
  { code: '230', iso: 'MU', name: 'Mauritius' },
  { code: '52', iso: 'MX', name: 'Mexico' },
  { code: '691', iso: 'FM', name: 'Micronesia' },
  { code: '373', iso: 'MD', name: 'Moldova' },
  { code: '377', iso: 'MC', name: 'Monaco' },
  { code: '976', iso: 'MN', name: 'Mongolia' },
  { code: '382', iso: 'ME', name: 'Montenegro' },
  { code: '1664', iso: 'MS', name: 'Montserrat' },
  { code: '212', iso: 'MA', name: 'Morocco' },
  { code: '258', iso: 'MZ', name: 'Mozambique' },
  { code: '95', iso: 'MM', name: 'Myanmar', aliases: ['burma', 'พม่า', 'เมียนมา'] },
  { code: '264', iso: 'NA', name: 'Namibia' },
  { code: '674', iso: 'NR', name: 'Nauru' },
  { code: '977', iso: 'NP', name: 'Nepal' },
  { code: '687', iso: 'NC', name: 'New Caledonia' },
  { code: '505', iso: 'NI', name: 'Nicaragua' },
  { code: '227', iso: 'NE', name: 'Niger' },
  { code: '234', iso: 'NG', name: 'Nigeria' },
  { code: '683', iso: 'NU', name: 'Niue' },
  { code: '850', iso: 'KP', name: 'North Korea' },
  { code: '389', iso: 'MK', name: 'North Macedonia' },
  { code: '1670', iso: 'MP', name: 'Northern Mariana Islands' },
  { code: '968', iso: 'OM', name: 'Oman' },
  { code: '92', iso: 'PK', name: 'Pakistan' },
  { code: '680', iso: 'PW', name: 'Palau' },
  { code: '970', iso: 'PS', name: 'Palestine' },
  { code: '507', iso: 'PA', name: 'Panama' },
  { code: '675', iso: 'PG', name: 'Papua New Guinea' },
  { code: '595', iso: 'PY', name: 'Paraguay' },
  { code: '51', iso: 'PE', name: 'Peru' },
  { code: '48', iso: 'PL', name: 'Poland' },
  { code: '1787', iso: 'PR', name: 'Puerto Rico' },
  { code: '974', iso: 'QA', name: 'Qatar', aliases: ['กาตาร์', 'doha'] },
  { code: '262', iso: 'RE', name: 'Reunion' },
  { code: '40', iso: 'RO', name: 'Romania' },
  { code: '250', iso: 'RW', name: 'Rwanda' },
  { code: '1869', iso: 'KN', name: 'Saint Kitts and Nevis' },
  { code: '1758', iso: 'LC', name: 'Saint Lucia' },
  { code: '1784', iso: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: '685', iso: 'WS', name: 'Samoa' },
  { code: '378', iso: 'SM', name: 'San Marino' },
  { code: '239', iso: 'ST', name: 'Sao Tome and Principe' },
  { code: '221', iso: 'SN', name: 'Senegal' },
  { code: '381', iso: 'RS', name: 'Serbia' },
  { code: '248', iso: 'SC', name: 'Seychelles' },
  { code: '232', iso: 'SL', name: 'Sierra Leone' },
  { code: '1721', iso: 'SX', name: 'Sint Maarten' },
  { code: '421', iso: 'SK', name: 'Slovakia' },
  { code: '386', iso: 'SI', name: 'Slovenia' },
  { code: '677', iso: 'SB', name: 'Solomon Islands' },
  { code: '252', iso: 'SO', name: 'Somalia' },
  { code: '27', iso: 'ZA', name: 'South Africa' },
  { code: '211', iso: 'SS', name: 'South Sudan' },
  { code: '94', iso: 'LK', name: 'Sri Lanka' },
  { code: '249', iso: 'SD', name: 'Sudan' },
  { code: '597', iso: 'SR', name: 'Suriname' },
  { code: '963', iso: 'SY', name: 'Syria' },
  { code: '992', iso: 'TJ', name: 'Tajikistan' },
  { code: '255', iso: 'TZ', name: 'Tanzania' },
  { code: '670', iso: 'TL', name: 'Timor-Leste' },
  { code: '228', iso: 'TG', name: 'Togo' },
  { code: '690', iso: 'TK', name: 'Tokelau' },
  { code: '676', iso: 'TO', name: 'Tonga' },
  { code: '1868', iso: 'TT', name: 'Trinidad and Tobago' },
  { code: '216', iso: 'TN', name: 'Tunisia' },
  { code: '90', iso: 'TR', name: 'Turkey', aliases: ['turkiye', 'ตุรกี'] },
  { code: '993', iso: 'TM', name: 'Turkmenistan' },
  { code: '1649', iso: 'TC', name: 'Turks and Caicos Islands' },
  { code: '688', iso: 'TV', name: 'Tuvalu' },
  { code: '256', iso: 'UG', name: 'Uganda' },
  { code: '380', iso: 'UA', name: 'Ukraine' },
  { code: '598', iso: 'UY', name: 'Uruguay' },
  { code: '998', iso: 'UZ', name: 'Uzbekistan' },
  { code: '678', iso: 'VU', name: 'Vanuatu' },
  { code: '379', iso: 'VA', name: 'Vatican City' },
  { code: '58', iso: 'VE', name: 'Venezuela' },
  { code: '681', iso: 'WF', name: 'Wallis and Futuna' },
  { code: '967', iso: 'YE', name: 'Yemen' },
  { code: '260', iso: 'ZM', name: 'Zambia' },
  { code: '263', iso: 'ZW', name: 'Zimbabwe' },
];

// Sorted longest-first for unambiguous prefix extraction (e.g. +351 before +3, +971 before +9)
const CODES_BY_LENGTH_DESC = [...WORLD_COUNTRY_CODES].sort(
  (a, b) => b.code.length - a.code.length
);

export function findCountryByDialCode(code?: string | null): WorldCountryCode | undefined {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return undefined;
  return WORLD_COUNTRY_CODES.find((c) => c.code === digits);
}

export function filterWorldCountryCodes(query: string, limit = 40): WorldCountryCode[] {
  const q = query.trim().toLowerCase();
  if (!q || q === '+') {
    return WORLD_COUNTRY_CODES.slice(0, limit);
  }
  const qDigits = q.replace(/^\+/, '').replace(/\D/g, '');
  const isPureCodeQuery = /^\+?\d+$/.test(q);

  const scored: Array<{ item: WorldCountryCode; rank: number }> = [];
  for (const item of WORLD_COUNTRY_CODES) {
    if (isPureCodeQuery && qDigits) {
      if (item.code === qDigits) {
        scored.push({ item, rank: 0 });
      } else if (item.code.startsWith(qDigits)) {
        scored.push({ item, rank: 1 });
      }
      continue;
    }
    const isoLower = item.iso.toLowerCase();
    const nameLower = item.name.toLowerCase();
    const aliasMatch = item.aliases?.some((a) => a.toLowerCase().includes(q));
    if (isoLower === q || (qDigits && item.code === qDigits)) {
      scored.push({ item, rank: 0 });
    } else if (nameLower.startsWith(q) || (qDigits && item.code.startsWith(qDigits))) {
      scored.push({ item, rank: 1 });
    } else if (nameLower.includes(q) || aliasMatch || isoLower.startsWith(q)) {
      scored.push({ item, rank: 2 });
    }
  }

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Extracts country calling code + local number when a phone starts with `+` (e.g. "+351 918 421 092").
 * Uses longest-prefix matching across all ITU-T codes so "+351" matches Portugal, "+971" matches UAE, etc.
 */
export function extractDialCodeFromInternationalPhone(
  rawPhone: string
): { dialCode: string; localNumber: string } | null {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed.startsWith('+')) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return null;

  for (const entry of CODES_BY_LENGTH_DESC) {
    if (digits.startsWith(entry.code) && digits.length - entry.code.length >= 5) {
      return {
        dialCode: entry.code,
        localNumber: digits.slice(entry.code.length),
      };
    }
  }
  return null;
}
