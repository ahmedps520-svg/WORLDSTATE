// Baseline nation data (approx. 2025-26 figures).
// code|name|pop(M)|GDP($B)|active(k)|reserve(k)|mil%GDP|gov|tech|region|align|nukes|title
// gov: fdem full democracy, dem flawed democracy, hyb hybrid, auth authoritarian, one one-party,
//      mon absolute monarchy, jun military junta, theo theocracy, tran transitional
// align: W western core, w west-leaning, N non-aligned, r russia-leaning, R russia core,
//        c china-leaning, C china core, X anti-western independent
const RAW = `
US|United States|342|30500|1320|800|3.4|dem|10|NA|W|5200|P
CA|Canada|41.5|2250|68|37|1.4|fdem|8.8|NA|W|0|PM
MX|Mexico|132|1850|216|82|0.7|dem|6|NA|N|0|P
GT|Guatemala|18.7|113|18|64|0.4|hyb|4.5|CAm|w|0|P
BZ|Belize|0.42|3.3|1.5|0.7|1.2|dem|4|CAm|w|0|PM
SV|El Salvador|6.3|36|25|10|1.2|hyb|4.5|CAm|w|0|P
HN|Honduras|10.8|37|15|60|1.5|hyb|4|CAm|w|0|P
NI|Nicaragua|7|19|12|0|0.6|auth|3.5|CAm|r|0|P
CR|Costa Rica|5.2|95|5|0|0.1|fdem|6|CAm|W|0|P
PA|Panama|4.5|87|5|0|0.1|dem|5.5|CAm|w|0|P
CU|Cuba|10.9|107|49|39|2.9|one|4.5|CAm|r|0|P
JM|Jamaica|2.8|20|6|1|1.4|dem|5|CAm|w|0|PM
HT|Haiti|11.8|26|1|0|0.1|tran|2.5|CAm|w|0|P
DO|Dominican Republic|11.4|130|56|0|0.6|dem|5|CAm|w|0|P
BS|Bahamas|0.41|15|1.6|0|0.9|fdem|6|CAm|W|0|PM
TT|Trinidad and Tobago|1.5|28|4|0|0.9|dem|5.5|CAm|w|0|PM
BB|Barbados|0.28|7|0.6|0.4|0.8|fdem|5.5|CAm|w|0|PM
AG|Antigua and Barbuda|0.1|2.2|0.2|0|0.5|dem|5|CAm|w|0|PM
DM|Dominica|0.07|0.7|0|0|0|dem|4.5|CAm|w|0|PM
GD|Grenada|0.13|1.4|0|0|0|dem|4.5|CAm|w|0|PM
KN|Saint Kitts and Nevis|0.05|1.1|0.3|0|0.5|dem|5|CAm|w|0|PM
LC|Saint Lucia|0.18|2.6|0|0|0|dem|5|CAm|w|0|PM
VC|Saint Vincent|0.1|1.1|0|0|0|dem|4.5|CAm|w|0|PM
CO|Colombia|53|420|260|35|3.0|dem|5.5|SAm|w|0|P
VE|Venezuela|28.5|95|123|8|0.5|auth|4.5|SAm|r|0|P
GY|Guyana|0.83|26|4|0.7|1.3|dem|4.5|SAm|w|0|P
SR|Suriname|0.63|4.5|2|0|0.8|dem|4.5|SAm|w|0|P
EC|Ecuador|18|125|41|118|2.0|dem|5|SAm|w|0|P
PE|Peru|34.5|300|81|188|1.1|hyb|5|SAm|w|0|P
BR|Brazil|212|2200|366|1340|1.1|dem|6|SAm|N|0|P
BO|Bolivia|12.4|52|34|0|1.4|hyb|4|SAm|N|0|P
PY|Paraguay|6.9|45|14|165|1.0|dem|4.5|SAm|w|0|P
CL|Chile|19.8|340|69|19|1.6|fdem|6.5|SAm|w|0|P
AR|Argentina|46|640|72|0|0.5|dem|6|SAm|w|0|P
UY|Uruguay|3.4|83|21|0|1.9|fdem|6|SAm|w|0|P
GB|United Kingdom|69.3|3800|138|73|2.4|fdem|9|WEu|W|225|PM
IE|Ireland|5.4|600|7.5|1.5|0.2|fdem|8|WEu|w|0|PM
FR|France|68.6|3250|203|41|2.1|dem|9|WEu|W|290|P
BE|Belgium|11.9|680|23|5|1.3|dem|8.5|WEu|W|0|PM
NL|Netherlands|18|1250|34|5|2.0|fdem|8.8|WEu|W|0|PM
LU|Luxembourg|0.67|95|0.4|0|0.7|fdem|8.5|WEu|W|0|PM
DE|Germany|84|4750|182|34|2.1|fdem|9|WEu|W|0|C
CH|Switzerland|9|950|20|123|0.7|fdem|9|WEu|N|0|P
AT|Austria|9.2|540|23|125|0.9|fdem|8.5|WEu|w|0|C
IT|Italy|59|2450|165|18|1.5|fdem|8.5|WEu|W|0|PM
ES|Spain|48.7|1850|122|15|1.3|fdem|8.3|WEu|W|0|PM
PT|Portugal|10.6|320|24|210|1.5|fdem|8|WEu|W|0|PM
MT|Malta|0.56|25|1.7|0.2|0.5|fdem|7.5|WEu|w|0|PM
AD|Andorra|0.08|4|0|0|0|fdem|8|WEu|w|0|PM
MC|Monaco|0.04|10|0|0|0|dem|8|WEu|w|0|K
SM|San Marino|0.034|2|0|0|0|fdem|8|WEu|w|0|P
VA|Vatican City|0.001|0.3|0.1|0|0|theo|7|WEu|N|0|PO
LI|Liechtenstein|0.04|8|0|0|0|fdem|9|WEu|w|0|PM
DK|Denmark|6|430|15|44|2.4|fdem|9|WEu|W|0|PM
NO|Norway|5.6|500|25|40|2.2|fdem|9|WEu|W|0|PM
SE|Sweden|10.6|620|15|10|2.4|fdem|9|WEu|W|0|PM
FI|Finland|5.6|310|24|238|2.4|fdem|9|WEu|W|0|P
IS|Iceland|0.39|33|0.2|0|0.1|fdem|8.5|WEu|W|0|PM
EE|Estonia|1.37|45|7|18|3.4|fdem|8.5|EEu|W|0|PM
LV|Latvia|1.86|45|7|16|3.4|fdem|8|EEu|W|0|PM
LT|Lithuania|2.89|85|23|7|3.0|fdem|8|EEu|W|0|P
PL|Poland|37.4|980|216|350|4.4|dem|8|EEu|W|0|P
CZ|Czechia|10.9|360|27|3|2.1|fdem|8.3|EEu|W|0|PM
SK|Slovakia|5.4|145|17|0|2.0|dem|7.8|EEu|W|0|PM
HU|Hungary|9.6|230|32|20|2.1|hyb|7.5|EEu|w|0|PM
SI|Slovenia|2.1|75|7|0|1.4|fdem|8|EEu|W|0|PM
HR|Croatia|3.85|95|14|21|1.8|dem|7.5|EEu|W|0|PM
BA|Bosnia and Herzegovina|3.2|30|10|0|0.8|hyb|5.5|EEu|N|0|P
RS|Serbia|6.6|90|28|50|2.2|hyb|6.5|EEu|r|0|P
ME|Montenegro|0.62|8|1.5|0|1.6|dem|6|EEu|W|0|PM
XK|Kosovo|1.6|11|2.5|0.8|1.2|dem|5|EEu|w|0|PM
AL|Albania|2.7|27|7|0|2.0|hyb|6|EEu|W|0|PM
MK|North Macedonia|1.8|17|8|4.9|2.0|dem|6|EEu|W|0|PM
GR|Greece|10.3|260|132|221|3.1|dem|8|EEu|W|0|PM
BG|Bulgaria|6.4|115|37|3|2.2|dem|7|EEu|W|0|PM
RO|Romania|19|410|71|53|2.3|dem|7.3|EEu|W|0|P
MD|Moldova|2.4|19|5|58|0.6|dem|5|EEu|w|0|P
UA|Ukraine|33|205|900|1200|26|hyb|6.8|EEu|w|0|P
BY|Belarus|9.1|80|48|290|1.5|auth|6|EEu|R|0|P
RU|Russia|143|2150|1320|2000|6.3|auth|7.5|EEu|R|5500|P
CY|Cyprus|1.35|40|12|50|1.6|fdem|7.5|MEa|w|0|P
GE|Georgia|3.7|35|20|0|1.6|hyb|5.5|CAs|N|0|PM
AM|Armenia|3|26|42|210|5|dem|5.5|CAs|N|0|PM
AZ|Azerbaijan|10.2|75|64|300|4.5|auth|6|CAs|N|0|P
KZ|Kazakhstan|20.3|290|39|0|1.0|auth|5.5|CAs|r|0|P
UZ|Uzbekistan|37|115|48|0|1.0|auth|5|CAs|N|0|P
TM|Turkmenistan|7.2|85|36|0|1.0|auth|4.5|CAs|N|0|P
KG|Kyrgyzstan|7.2|16|11|0|1.5|auth|4.5|CAs|r|0|P
TJ|Tajikistan|10.6|14|9|0|1.2|auth|4|CAs|r|0|P
AF|Afghanistan|42|17|150|0|5|theo|2.5|SAs|N|0|SL
MN|Mongolia|3.5|24|10|137|0.7|dem|5|EAs|N|0|P
TR|Turkey|86|1450|355|380|2.1|hyb|7.2|MEa|w|0|P
SY|Syria|25|25|60|0|3|tran|3|MEa|N|0|P
LB|Lebanon|5.8|28|60|0|3|hyb|4.5|MEa|N|0|P
IL|Israel|10|580|170|465|7.5|dem|9.2|MEa|W|90|PM
PS|Palestine|5.5|17|0|0|0|tran|3|MEa|N|0|P
JO|Jordan|11.5|55|100|65|4.8|auth|5.5|MEa|w|0|K
IQ|Iraq|46|265|193|0|2.0|hyb|4.5|MEa|N|0|PM
IR|Iran|91|400|610|350|2.5|theo|5.5|MEa|X|0|SL
SA|Saudi Arabia|35|1100|257|0|6.5|mon|6.5|MEa|w|0|K
KW|Kuwait|5|160|17|24|4.8|mon|6|MEa|w|0|E
BH|Bahrain|1.6|47|8|0|3.5|mon|6|MEa|w|0|K
QA|Qatar|3|220|17|0|4|mon|7|MEa|w|0|E
AE|United Arab Emirates|10.2|540|63|0|5|mon|7.5|MEa|w|0|E
OM|Oman|5.3|105|43|0|5.5|mon|6|MEa|N|0|S
YE|Yemen|40|19|40|0|4|tran|2.5|MEa|X|0|P
EG|Egypt|116|390|440|480|1.2|auth|5|NAf|w|0|P
LY|Libya|7.4|48|30|0|3|tran|3.5|NAf|N|0|P
TN|Tunisia|12.3|52|36|0|2.5|auth|5|NAf|w|0|P
DZ|Algeria|47|270|139|150|8|auth|5|NAf|r|0|P
MA|Morocco|38|160|196|150|4|hyb|5|NAf|w|0|K
MR|Mauritania|5|11|16|0|2.5|hyb|3.5|SSA|N|0|P
ML|Mali|24|27|21|0|4|jun|2.5|SSA|r|0|P
NE|Niger|27|20|10|0|2.5|jun|2.5|SSA|r|0|P
TD|Chad|19.3|21|33|0|2.5|auth|2.5|SSA|N|0|P
SD|Sudan|50|32|100|0|4|jun|3|SSA|N|0|P
SS|South Sudan|11.9|5|53|0|3|auth|2|SSA|N|0|P
ER|Eritrea|3.6|2.7|200|120|10|one|2.5|SSA|N|0|P
ET|Ethiopia|132|150|160|0|1.0|auth|3.5|SSA|N|0|PM
DJ|Djibouti|1.17|4.5|10|0|3.5|auth|4|SSA|N|0|P
SO|Somalia|19|12|20|0|1|tran|2|SSA|N|0|P
KE|Kenya|56|135|24|0|1.0|hyb|4.5|SSA|w|0|P
UG|Uganda|50|60|45|10|2.0|auth|3.5|SSA|N|0|P
RW|Rwanda|14.3|15|33|0|1.5|auth|4|SSA|N|0|P
BI|Burundi|14|3|30|0|2.5|auth|2.5|SSA|N|0|P
TZ|Tanzania|68|85|27|80|1.1|hyb|3.5|SSA|N|0|P
CD|DR Congo|110|72|134|0|1.5|auth|2.5|SSA|N|0|P
CG|Republic of the Congo|6.3|15|10|0|2.0|auth|3|SSA|N|0|P
GA|Gabon|2.5|21|5|0|1.4|auth|3.5|SSA|N|0|P
GQ|Equatorial Guinea|1.9|13|1.5|0|1|auth|3|SSA|N|0|P
CM|Cameroon|29|55|25|0|1|auth|3|SSA|N|0|P
CF|Central African Republic|5.5|3|9|0|2|auth|2|SSA|r|0|P
NG|Nigeria|230|260|143|0|0.6|hyb|4|SSA|N|0|P
BJ|Benin|14.5|23|12|0|0.9|hyb|3.5|SSA|N|0|P
TG|Togo|9.5|10|13|0|2.5|auth|3.5|SSA|N|0|P
GH|Ghana|34.4|85|16|0|0.4|dem|4.5|SSA|w|0|P
BF|Burkina Faso|23.5|23|12|0|4.5|jun|2.5|SSA|r|0|P
CI|Ivory Coast|31.9|90|27|0|1|hyb|4|SSA|w|0|P
LR|Liberia|5.6|5|2|0|0.6|dem|3|SSA|w|0|P
SL|Sierra Leone|8.6|7|8.5|0|0.6|hyb|3|SSA|w|0|P
GN|Guinea|14.5|25|10|0|2|jun|3|SSA|N|0|P
GW|Guinea-Bissau|2.2|2.2|4.5|0|1.5|hyb|2.5|SSA|N|0|P
SN|Senegal|18.5|33|14|0|1.5|dem|4|SSA|w|0|P
GM|Gambia|2.8|2.5|1|0|0.6|hyb|3|SSA|w|0|P
CV|Cape Verde|0.53|2.7|1.2|0|0.5|fdem|4.5|SSA|w|0|PM
ST|Sao Tome and Principe|0.23|0.7|0.3|0|0.5|dem|3|SSA|N|0|PM
AO|Angola|37.9|110|107|0|1.3|auth|3.5|SSA|N|0|P
ZM|Zambia|21|28|15|0|1.2|hyb|3.5|SSA|N|0|P
MW|Malawi|21.6|11|11|0|0.7|dem|3|SSA|w|0|P
MZ|Mozambique|34.6|23|11|0|1.3|auth|3|SSA|N|0|P
ZW|Zimbabwe|16.6|36|29|22|1.4|auth|3.5|SSA|r|0|P
BW|Botswana|2.5|20|9|0|2.6|dem|4.5|SSA|w|0|P
NA|Namibia|3|13|10|0|3.2|dem|4.5|SSA|N|0|P
ZA|South Africa|63.6|410|74|15|0.7|dem|6|SSA|N|0|P
LS|Lesotho|2.3|2.3|2|0|2.0|dem|3|SSA|N|0|PM
SZ|Eswatini|1.2|5|3|0|2|mon|3.5|SSA|N|0|K
MG|Madagascar|31.9|17|13|0|0.6|jun|3|SSA|N|0|P
MU|Mauritius|1.26|15|2.5|0|0.2|fdem|5.5|SSA|w|0|PM
KM|Comoros|0.85|1.4|0.6|0|0.5|auth|2.5|SSA|N|0|P
SC|Seychelles|0.12|2.2|0.4|0|1.4|dem|5.5|SSA|w|0|P
IN|India|1455|4200|1475|1155|2.3|dem|6.5|SAs|N|180|PM
PK|Pakistan|251|410|660|550|2.7|hyb|5.2|SAs|c|170|PM
BD|Bangladesh|175|470|163|0|1.0|tran|4|SAs|N|0|PM
LK|Sri Lanka|22|99|255|6|1.8|dem|4.5|SAs|N|0|P
NP|Nepal|29.6|44|96|0|1.2|tran|3.5|SAs|N|0|PM
BT|Bhutan|0.79|3.4|8|0|1|dem|4|SAs|N|0|PM
MV|Maldives|0.53|7|4|0|1.5|hyb|4.5|SAs|N|0|P
CN|China|1409|19500|2035|510|2.2|one|8.5|EAs|C|600|P
TW|Taiwan|23.3|820|169|1657|2.5|fdem|8.6|EAs|W|0|P
JP|Japan|123.8|4200|247|56|1.6|fdem|9|EAs|W|0|PM
KR|South Korea|51.6|1800|500|3100|2.6|fdem|8.8|EAs|W|0|P
KP|North Korea|26.2|28|1280|600|24|one|4|EAs|C|50|SL
VN|Vietnam|101|490|482|5000|2.3|one|5.5|SEA|N|0|P
LA|Laos|7.8|16|29|100|0.2|one|3|SEA|c|0|P
KH|Cambodia|17.6|46|124|0|2.3|auth|3.5|SEA|c|0|PM
TH|Thailand|71.6|545|361|200|1.3|hyb|6|SEA|w|0|PM
MM|Myanmar|54.5|65|150|0|3|jun|3.5|SEA|c|0|P
MY|Malaysia|35.6|440|113|51|1.0|dem|6|SEA|N|0|PM
SG|Singapore|6|560|51|253|2.8|dem|8.5|SEA|w|0|PM
ID|Indonesia|284|1450|400|400|0.8|dem|5.5|SEA|N|0|P
BN|Brunei|0.46|15|7|0.7|2.5|mon|6|SEA|N|0|S
PH|Philippines|116|500|146|131|1.3|dem|5|SEA|W|0|P
TL|Timor-Leste|1.4|2|2|0|1.2|dem|3|SEA|N|0|P
PG|Papua New Guinea|10.6|33|4|0|0.4|hyb|3|OCE|w|0|PM
AU|Australia|27.3|1800|58|30|2.0|fdem|9|OCE|W|0|PM
NZ|New Zealand|5.3|260|9|3|1.2|fdem|8.5|OCE|W|0|PM
FJ|Fiji|0.93|6|3.5|6|1.4|hyb|4.5|OCE|w|0|PM
SB|Solomon Islands|0.73|1.7|0.1|0|0.1|dem|3|OCE|c|0|PM
VU|Vanuatu|0.33|1.1|0.1|0|0.1|dem|3|OCE|N|0|PM
WS|Samoa|0.22|1|0.1|0|0.1|dem|3.5|OCE|w|0|PM
TO|Tonga|0.1|0.55|0.6|0|1|dem|3.5|OCE|w|0|PM
KI|Kiribati|0.13|0.3|0|0|0|dem|3|OCE|c|0|P
FM|Micronesia|0.11|0.5|0|0|0|dem|3.5|OCE|W|0|P
MH|Marshall Islands|0.04|0.3|0|0|0|dem|3.5|OCE|W|0|P
PW|Palau|0.018|0.3|0|0|0|dem|4|OCE|W|0|P
NR|Nauru|0.012|0.15|0|0|0|dem|3|OCE|w|0|P
`;

export interface NationSeed {
  code: string; name: string; pop: number; gdp: number; active: number; reserve: number; milPct: number;
  gov: string; tech: number; region: string; align: string; nukes: number; title: string;
}
export const NATION_SEEDS: NationSeed[] = RAW.trim().split('\n').map((l) => {
  const [code, name, pop, gdp, active, reserve, milPct, gov, tech, region, align, nukes, title] = l.split('|');
  return { code, name, pop: +pop, gdp: +gdp, active: +active, reserve: +reserve, milPct: +milPct, gov, tech: +tech, region, align, nukes: +nukes, title };
});

// [tanks, artillery, combat aircraft, air-defence index, naval index]
export const MIL_OVERRIDE: Record<string, [number, number, number, number, number]> = {
  US: [2600, 1500, 2700, 100, 450], CN: [5000, 9000, 2000, 90, 230], RU: [2100, 5200, 1100, 100, 190],
  IN: [4600, 9700, 600, 50, 55], GB: [213, 150, 180, 20, 65], FR: [215, 140, 230, 25, 45],
  DE: [300, 120, 225, 22, 25], JP: [450, 500, 330, 50, 65], KR: [2200, 6000, 410, 50, 32],
  IT: [200, 150, 180, 20, 32], TR: [2400, 2800, 300, 25, 25], PK: [2500, 4600, 400, 25, 9],
  IR: [1500, 6800, 300, 45, 15], IL: [1300, 1000, 330, 70, 6], EG: [3500, 4400, 500, 40, 18],
  SA: [1000, 800, 450, 45, 9], UA: [1000, 2200, 120, 45, 2], PL: [650, 900, 90, 25, 4],
  BR: [400, 600, 120, 10, 20], ID: [400, 600, 100, 10, 18], VN: [1300, 3000, 75, 30, 10],
  TW: [900, 2000, 400, 45, 20], KP: [4300, 21000, 450, 35, 8], AU: [60, 100, 100, 15, 20],
  CA: [80, 160, 80, 5, 12], ES: [330, 300, 140, 15, 25], TH: [400, 1600, 100, 10, 10],
  GR: [1300, 1100, 230, 25, 15], DZ: [1400, 1200, 200, 35, 10], MA: [900, 800, 90, 10, 4],
  AZ: [600, 500, 40, 10, 1], AM: [100, 150, 15, 6, 0], SY: [400, 300, 10, 2, 0], IQ: [400, 400, 80, 5, 1],
  AE: [400, 300, 150, 30, 5], SG: [170, 250, 100, 25, 7], MY: [50, 200, 40, 5, 6], PH: [10, 200, 30, 4, 5],
  MX: [0, 200, 40, 3, 10], CO: [0, 200, 25, 2, 6], VE: [200, 200, 30, 10, 2], CL: [250, 300, 50, 5, 8],
  AR: [200, 200, 20, 3, 5], ZA: [100, 300, 25, 5, 4], NG: [150, 400, 30, 3, 4], ET: [400, 500, 25, 5, 0],
  KZ: [350, 500, 100, 15, 1], BY: [500, 600, 60, 15, 0], RS: [250, 300, 30, 10, 0], RO: [300, 500, 50, 8, 4],
  HU: [50, 100, 14, 5, 0], CZ: [30, 100, 14, 5, 0], SE: [110, 50, 95, 10, 6], FI: [200, 700, 60, 15, 3],
  NO: [70, 50, 50, 8, 5], NL: [20, 50, 45, 8, 8], BE: [0, 20, 45, 2, 2], PT: [30, 50, 20, 3, 4],
  DK: [40, 30, 30, 5, 4], QA: [60, 80, 90, 10, 2], KW: [300, 150, 40, 10, 1], JO: [600, 500, 50, 10, 0],
  OM: [120, 150, 30, 5, 3], CU: [600, 1000, 20, 10, 1], LY: [200, 300, 15, 2, 1], AF: [100, 150, 5, 1, 0],
  ER: [250, 300, 10, 2, 0], SD: [300, 400, 40, 3, 0], MM: [400, 800, 120, 8, 4], BD: [300, 500, 80, 5, 6],
  LK: [60, 300, 20, 2, 2], UZ: [300, 400, 50, 10, 0], TM: [600, 500, 50, 8, 1], GE: [120, 200, 10, 4, 0],
};

// crude + condensate, million bbl/day
export const OIL: Record<string, number> = {
  US: 13.5, SA: 9.8, RU: 9.4, CA: 5.0, IQ: 4.4, CN: 4.3, AE: 3.5, BR: 3.6, IR: 3.3, KW: 2.5, KZ: 1.9, MX: 1.6, NO: 1.8,
  NG: 1.5, LY: 1.3, QA: 1.3, DZ: 1.0, AO: 1.1, OM: 1.0, GY: 0.7, VE: 0.95, CO: 0.75, AZ: 0.6, EG: 0.55, IN: 0.6,
  ID: 0.6, MY: 0.55, AR: 0.8, EC: 0.47, GB: 0.65, SS: 0.15, TM: 0.2, CG: 0.25, GA: 0.2, GQ: 0.08, TD: 0.12,
  CM: 0.06, VN: 0.2, TH: 0.1, AU: 0.3, BN: 0.1, YE: 0.05, SY: 0.03, BH: 0.2, GH: 0.15, TT: 0.05, PE: 0.04,
};
// natural gas exporters (bonus energy revenue / leverage)
export const GAS: Record<string, number> = { RU: 1.0, QA: 0.9, US: 0.8, NO: 0.6, AU: 0.5, DZ: 0.4, IR: 0.4, TM: 0.4, AZ: 0.2, NG: 0.2, MY: 0.2, ID: 0.15, EG: 0.1, OM: 0.1, AE: 0.15, CA: 0.3 };

// grain balance: >1 exporter, <1 importer
export const FOOD: Record<string, number> = {
  US: 1.4, CA: 1.8, AU: 1.8, AR: 2.0, BR: 1.6, UA: 2.2, RU: 1.5, FR: 1.5, KZ: 1.5, RO: 1.4, PL: 1.2, DE: 1.1,
  IN: 1.1, TH: 1.5, VN: 1.4, PK: 1.1, PY: 1.6, UY: 1.6, HU: 1.3, BG: 1.3, MM: 1.2,
  EG: 0.45, DZ: 0.4, SA: 0.25, YE: 0.15, LB: 0.25, LY: 0.2, TN: 0.5, MA: 0.6, IQ: 0.55, IR: 0.7, JO: 0.2,
  SD: 0.7, BD: 0.85, NG: 0.8, KE: 0.75, ET: 0.8, SO: 0.4, ID: 0.85, PH: 0.75, JP: 0.3, KR: 0.25, TW: 0.3,
  AE: 0.1, KW: 0.1, QA: 0.1, OM: 0.2, BH: 0.1, IL: 0.4, SY: 0.6, AF: 0.6, HT: 0.5, CU: 0.5, VE: 0.6, SG: 0.05,
  KP: 0.7, MY: 0.6, GB: 0.85, IT: 0.8, ES: 0.8, NL: 0.9, BE: 0.8, CH: 0.6, NO: 0.6, PS: 0.4, MR: 0.5, NE: 0.8,
};

// annual population growth (%), default derived from region
export const POP_GROWTH: Record<string, number> = {
  JP: -0.5, KR: -0.2, CN: -0.15, TW: -0.1, IT: -0.3, ES: 0.1, DE: 0.0, PL: -0.4, UA: -0.8, RU: -0.3, BY: -0.4,
  GR: -0.4, PT: -0.1, BG: -0.8, RO: -0.6, RS: -0.6, HR: -0.6, LT: -0.5, LV: -0.6, EE: -0.2, HU: -0.3, CZ: 0.0,
  US: 0.5, CA: 0.9, AU: 1.1, GB: 0.4, FR: 0.2, IN: 0.8, BR: 0.5, MX: 0.7, ID: 0.8, IR: 0.7, TR: 0.5, VN: 0.6,
  TH: 0.0, BD: 1.0, PK: 1.9, EG: 1.5, NG: 2.3, ET: 2.4, CD: 3.1, TZ: 2.9, IL: 1.6, SA: 1.5, KP: 0.3, CU: -0.5,
};

// hazard exposure: q quake, s storm, f flood, d drought
export const HAZARDS: Record<string, string> = {
  JP: 'qs', TR: 'q', IR: 'qd', ID: 'qf', CL: 'q', PE: 'q', MX: 'qs', NP: 'q', PK: 'qfd', AF: 'qd', CN: 'qsf',
  PH: 'qs', IT: 'q', GR: 'q', EC: 'q', NZ: 'q', US: 'sqd', CU: 's', HT: 'qs', DO: 's', JM: 's', BS: 's', VN: 'sf',
  BD: 'sf', IN: 'sfd', MM: 'sf', TW: 'qs', KR: 's', SO: 'd', ET: 'd', KE: 'd', SD: 'd', NE: 'd', ML: 'd', TD: 'd',
  BF: 'd', MR: 'd', AU: 'd', BR: 'fd', ZA: 'd', ZW: 'd', MZ: 'sf', MG: 's', NG: 'f', SY: 'qd', IQ: 'd', MA: 'qd',
  DZ: 'q', TJ: 'q', KG: 'q', GT: 'qs', SV: 'q', HN: 's', NI: 's', CR: 'q', CO: 'qf', VE: 'f', AR: 'd', LK: 'f',
};

// cultural name pools used for fictional leaders
export const CULTURE: Record<string, string> = {
  US: 'anglo', CA: 'anglo', GB: 'anglo', IE: 'anglo', AU: 'anglo', NZ: 'anglo', JM: 'anglo', BS: 'anglo', TT: 'anglo', BB: 'anglo',
  AG: 'anglo', DM: 'anglo', GD: 'anglo', KN: 'anglo', LC: 'anglo', VC: 'anglo', BZ: 'anglo', GY: 'anglo', MT: 'italian',
  MX: 'hispanic', GT: 'hispanic', SV: 'hispanic', HN: 'hispanic', NI: 'hispanic', CR: 'hispanic', PA: 'hispanic', CU: 'hispanic',
  DO: 'hispanic', CO: 'hispanic', VE: 'hispanic', EC: 'hispanic', PE: 'hispanic', BO: 'hispanic', PY: 'hispanic', CL: 'hispanic',
  AR: 'hispanic', UY: 'hispanic', ES: 'hispanic', AD: 'hispanic', PH: 'filipino', GQ: 'hispanic',
  BR: 'luso', PT: 'luso', AO: 'luso', MZ: 'luso', CV: 'luso', GW: 'luso', ST: 'luso', TL: 'luso',
  FR: 'french', BE: 'french', LU: 'french', MC: 'french', HT: 'french', CH: 'german', DE: 'german', AT: 'german', LI: 'german', NL: 'german',
  DK: 'nordic', NO: 'nordic', SE: 'nordic', FI: 'nordic', IS: 'nordic', EE: 'nordic',
  IT: 'italian', SM: 'italian', VA: 'italian', RO: 'italian',
  RU: 'eslav', UA: 'eslav', BY: 'eslav', MD: 'eslav', LV: 'wslav', LT: 'wslav',
  PL: 'wslav', CZ: 'wslav', SK: 'wslav', SI: 'wslav', HR: 'wslav', BA: 'wslav', RS: 'wslav', ME: 'wslav', MK: 'wslav', BG: 'wslav', HU: 'wslav',
  GR: 'greek', CY: 'greek', AL: 'balkan', XK: 'balkan',
  TR: 'turkic', AZ: 'turkic', KZ: 'turkic', UZ: 'turkic', TM: 'turkic', KG: 'turkic', TJ: 'persian', GE: 'caucasus', AM: 'caucasus', MN: 'mongol',
  IR: 'persian', AF: 'persian', IL: 'hebrew',
  SA: 'arab', KW: 'arab', BH: 'arab', QA: 'arab', AE: 'arab', OM: 'arab', YE: 'arab', IQ: 'arab', SY: 'arab', LB: 'arab', JO: 'arab', PS: 'arab',
  EG: 'arab', LY: 'arab', TN: 'arab', DZ: 'arab', MA: 'arab', MR: 'arab', SD: 'arab', KM: 'arab', DJ: 'arab', SO: 'east_af',
  IN: 'sasian', PK: 'sasian_m', BD: 'sasian_m', LK: 'sasian', NP: 'sasian', BT: 'sasian', MV: 'sasian_m',
  CN: 'chinese', TW: 'chinese', SG: 'chinese', JP: 'japanese', KR: 'korean', KP: 'korean',
  VN: 'viet', TH: 'thai', LA: 'thai', KH: 'thai', MM: 'thai', MY: 'malay', ID: 'malay', BN: 'malay',
  PG: 'pacific', FJ: 'pacific', SB: 'pacific', VU: 'pacific', WS: 'pacific', TO: 'pacific', KI: 'pacific', FM: 'pacific', MH: 'pacific', PW: 'pacific', NR: 'pacific',
  ET: 'east_af', ER: 'east_af', KE: 'east_af', UG: 'east_af', TZ: 'east_af', RW: 'east_af', BI: 'east_af', SS: 'east_af',
  ZA: 'south_af', ZW: 'south_af', ZM: 'south_af', MW: 'south_af', BW: 'south_af', NA: 'south_af', LS: 'south_af', SZ: 'south_af', MG: 'french', MU: 'sasian', SC: 'french',
};
