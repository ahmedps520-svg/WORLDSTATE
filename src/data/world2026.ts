// Starting geopolitical configuration: organisations, treaties, relationships,
// territorial claims and the conflicts already burning in late 2026.

export interface OrgSeed { id: string; name: string; kind: 'defense' | 'economic' | 'political'; leader: string; members: string[]; commitment: number; color: string }

export const ORGS: OrgSeed[] = [
  { id: 'NATO', name: 'North Atlantic Treaty Organization', kind: 'defense', leader: 'US', commitment: 0.85, color: '#4c8dff',
    members: 'US CA GB FR DE IT ES PT NL BE LU DK NO IS PL CZ SK HU RO BG GR TR HR SI AL ME MK EE LV LT FI SE'.split(' ') },
  { id: 'CSTO', name: 'Collective Security Treaty Organization', kind: 'defense', leader: 'RU', commitment: 0.55, color: '#e0524b',
    members: 'RU BY KZ KG TJ'.split(' ') },
  { id: 'GCC', name: 'Gulf Cooperation Council', kind: 'defense', leader: 'SA', commitment: 0.5, color: '#2fb889',
    members: 'SA AE QA KW BH OM'.split(' ') },
  { id: 'AES', name: 'Alliance of Sahel States', kind: 'defense', leader: 'ML', commitment: 0.8, color: '#c9a23a',
    members: 'ML BF NE'.split(' ') },
  { id: 'USTATE', name: 'Union State', kind: 'defense', leader: 'RU', commitment: 0.95, color: '#b03a3a', members: ['RU', 'BY'] },
  { id: 'EU', name: 'European Union', kind: 'economic', leader: 'DE', commitment: 0.4, color: '#3b6fd8',
    members: 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ') },
  { id: 'SCO', name: 'Shanghai Cooperation Organisation', kind: 'political', leader: 'CN', commitment: 0.15, color: '#d8733b',
    members: 'CN RU IN PK IR KZ KG TJ UZ BY'.split(' ') },
  { id: 'BRICS', name: 'BRICS', kind: 'economic', leader: 'CN', commitment: 0.1, color: '#e3a33b',
    members: 'BR RU IN CN ZA EG ET IR AE ID'.split(' ') },
  { id: 'ASEAN', name: 'Association of Southeast Asian Nations', kind: 'political', leader: 'ID', commitment: 0.1, color: '#29a3a3',
    members: 'ID MY PH SG TH VN LA KH MM BN TL'.split(' ') },
  { id: 'AL', name: 'Arab League', kind: 'political', leader: 'EG', commitment: 0.1, color: '#3a9a5b',
    members: 'EG SA AE QA KW BH OM YE IQ SY LB JO PS LY TN DZ MA MR SD SO DJ KM'.split(' ') },
  { id: 'AU', name: 'African Union', kind: 'political', leader: 'ZA', commitment: 0.05, color: '#6aa84f',
    members: 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD DJ EG GQ ER SZ ET GA GM GH GN GW CI KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(' ') },
];

// bilateral treaties: [a, b, type, commitment]
export const TREATIES: [string, string, 'defense' | 'nap' | 'partnership', number][] = [
  ['US', 'JP', 'defense', 0.85], ['US', 'KR', 'defense', 0.85], ['US', 'PH', 'defense', 0.65], ['US', 'AU', 'defense', 0.75],
  ['US', 'NZ', 'defense', 0.5], ['AU', 'NZ', 'defense', 0.7], ['US', 'TW', 'defense', 0.5], ['US', 'IL', 'defense', 0.6],
  ['CN', 'KP', 'defense', 0.55], ['RU', 'KP', 'defense', 0.6], ['SA', 'PK', 'defense', 0.55], ['TR', 'AZ', 'defense', 0.65],
  ['FR', 'GR', 'defense', 0.55], ['US', 'XK', 'defense', 0.4], ['US', 'GY', 'defense', 0.35], ['IT', 'XK', 'defense', 0.3], ['RU', 'IR', 'partnership', 0], ['CN', 'PK', 'partnership', 0], ['CN', 'RU', 'partnership', 0],
  ['US', 'SA', 'partnership', 0], ['IN', 'US', 'partnership', 0], ['IN', 'RU', 'partnership', 0], ['US', 'SG', 'partnership', 0],
  ['GB', 'UA', 'partnership', 0], ['US', 'UA', 'partnership', 0], ['FR', 'UA', 'partnership', 0], ['DE', 'UA', 'partnership', 0],
  ['RU', 'VE', 'partnership', 0], ['CU', 'VE', 'partnership', 0], ['IR', 'YE', 'partnership', 0], ['US', 'QA', 'partnership', 0],
  ['AE', 'IL', 'partnership', 0], ['EG', 'SA', 'partnership', 0], ['TR', 'PK', 'partnership', 0], ['JP', 'AU', 'partnership', 0],
];

// curated relationship values (-100..100)
export const RELATIONS: [string, string, number][] = [
  ['RU', 'UA', -95], ['RU', 'US', -55], ['RU', 'GB', -65], ['RU', 'PL', -70], ['RU', 'EE', -70], ['RU', 'LV', -70], ['RU', 'LT', -70],
  ['RU', 'FI', -55], ['RU', 'SE', -50], ['RU', 'DE', -45], ['RU', 'FR', -45], ['RU', 'MD', -45], ['RU', 'GE', -35], ['RU', 'NO', -40],
  ['RU', 'CZ', -45], ['RU', 'RO', -45], ['RU', 'DK', -45], ['RU', 'NL', -45], ['RU', 'CA', -50], ['RU', 'JP', -40],
  ['CN', 'TW', -70], ['CN', 'US', -40], ['CN', 'JP', -40], ['CN', 'IN', -30], ['CN', 'PH', -45], ['CN', 'VN', -10], ['CN', 'KR', -5],
  ['CN', 'AU', -15], ['KP', 'KR', -85], ['KP', 'US', -80], ['KP', 'JP', -70], ['IN', 'PK', -80], ['IL', 'IR', -95], ['US', 'IR', -80],
  ['SA', 'IR', -30], ['IL', 'PS', -80], ['IL', 'LB', -60], ['IL', 'SY', -35], ['IL', 'YE', -80], ['US', 'YE', -60], ['SA', 'YE', -50],
  ['AE', 'YE', -40], ['IR', 'AE', -20], ['AM', 'AZ', -30], ['GR', 'TR', -25], ['CY', 'TR', -50], ['RS', 'XK', -70], ['MA', 'DZ', -60],
  ['ET', 'ER', -60], ['ET', 'EG', -40], ['SD', 'AE', -40], ['CD', 'RW', -60], ['VE', 'GY', -60], ['VE', 'US', -85], ['CU', 'US', -60],
  ['AF', 'PK', -50], ['TH', 'KH', -50], ['US', 'NI', -40], ['IR', 'SY', -30], ['IL', 'TR', -40], ['GB', 'AR', -20], ['ET', 'SO', -25],
  ['US', 'GB', 85], ['US', 'JP', 80], ['US', 'KR', 75], ['US', 'IL', 82], ['US', 'AU', 85], ['US', 'CA', 62], ['US', 'TW', 60],
  ['US', 'PH', 60], ['US', 'PL', 75], ['US', 'SA', 55], ['US', 'UA', 40], ['US', 'DE', 60], ['US', 'FR', 55], ['US', 'MX', 35],
  ['RU', 'BY', 90], ['RU', 'KP', 70], ['RU', 'IR', 55], ['RU', 'CN', 65], ['CN', 'PK', 80], ['CN', 'KP', 55], ['CN', 'KH', 60],
  ['CN', 'LA', 60], ['CN', 'MM', 40], ['IN', 'RU', 45], ['IN', 'US', 40], ['IN', 'IL', 45], ['IN', 'FR', 50], ['TR', 'AZ', 85],
  ['PK', 'SA', 70], ['SY', 'TR', 60], ['PK', 'TR', 60], ['RS', 'RU', 50], ['RS', 'HU', 50], ['HU', 'RU', 15], ['VE', 'CU', 80],
  ['VE', 'RU', 50], ['VE', 'CN', 50], ['NI', 'RU', 40], ['JP', 'KR', 35], ['GB', 'UA', 75], ['PL', 'UA', 60], ['DE', 'UA', 60],
  ['FR', 'UA', 60], ['EE', 'UA', 75], ['LT', 'UA', 75], ['LV', 'UA', 75], ['FI', 'UA', 65], ['SE', 'UA', 65], ['CA', 'UA', 65],
  ['IR', 'YE', 70], ['IR', 'IQ', 40], ['AZ', 'IL', 50], ['EG', 'SA', 60], ['AE', 'SA', 55], ['AE', 'IL', 30], ['GR', 'CY', 85],
  ['AU', 'JP', 60], ['AU', 'GB', 80], ['AU', 'NZ', 85], ['IN', 'JP', 50], ['IN', 'AE', 50], ['DZ', 'RU', 45], ['ML', 'RU', 50],
  ['BF', 'RU', 50], ['NE', 'RU', 45], ['CF', 'RU', 55], ['KZ', 'RU', 45], ['KZ', 'CN', 45], ['MN', 'CN', 20], ['MN', 'RU', 30],
  ['CU', 'RU', 55], ['CU', 'CN', 50], ['BY', 'CN', 50], ['IR', 'CN', 50], ['SY', 'SA', 40], ['QA', 'TR', 60], ['IL', 'EG', 15],
];

// claims: [claimant, target owner, selector] where selector is 'all' or [lon, lat, radiusKm] or 'w<lon' / 'feature:Name'
export const CLAIMS: [string, string, 'all' | [number, number, number] | string][] = [
  ['RU', 'UA', [37.8, 48.0, 150]], ['RU', 'UA', [39.3, 48.6, 150]], ['RU', 'UA', [35.2, 47.8, 110]], ['RU', 'UA', [33.0, 46.6, 110]],
  ['RU', 'UA', [35.4, 46.8, 110]], ['CN', 'TW', 'all'], ['CN', 'IN', [93.6, 27.8, 260]], ['IN', 'CN', [79.5, 35.2, 200]],
  ['IN', 'PK', [74.5, 35.9, 200]], ['PK', 'IN', [74.8, 34.1, 160]], ['KP', 'KR', 'all'], ['KR', 'KP', 'all'], ['VE', 'GY', 'w<-58.3'],
  ['RS', 'XK', 'all'], ['AR', 'GB', 'feature:Falkland Is.'], ['ET', 'ER', [42.7, 13.0, 160]], ['AF', 'PK', [71.5, 34.0, 160]],
  ['BO', 'CL', [-70.4, -23.6, 200]], ['GT', 'BZ', 'all'], ['SO', 'ET', [43.5, 7.0, 300]],
];

// cores: provinces whose national identity differs from the de-jure owner at start
export const EXTRA_CORES: [string, string, [number, number, number]][] = [
  ['UA', 'RU', [34.1, 44.9, 220]], // Crimea
];

// Present-day frontline: Russian-controlled districts of Ukraine
export const OCCUPATIONS: [string, string, [number, number, number]][] = [
  ['RU', 'UA', [37.8, 48.0, 90]], ['RU', 'UA', [39.3, 48.6, 120]], ['RU', 'UA', [35.4, 46.85, 70]], ['RU', 'UA', [37.55, 47.1, 60]],
];

export interface FactionSeed { id: string; name: string; short: string; parent: string; kind: 'insurgent' | 'separatist'; select: [number, number, number][] | { lonLt?: number; latGt?: number; lonGt?: number }; colors: string[]; backers: string[] }
export const FACTIONS: FactionSeed[] = [
  { id: 'RSF', name: 'Rapid Support Forces', short: 'RSF', parent: 'SD', kind: 'insurgent', select: { lonLt: 28.6 }, colors: ['#c9a227', '#1b1b1b', '#8a1c1c'], backers: ['AE'] },
  { id: 'NUG', name: 'Myanmar Resistance Coalition', short: 'MRC', parent: 'MM', kind: 'insurgent', select: [[97.8, 25.4, 260], [97.9, 21.5, 160], [93.9, 21.9, 150]], colors: ['#c8102e', '#ffffff', '#1f4fa8'], backers: [] },
  { id: 'M23', name: 'Congo River Alliance', short: 'AFC/M23', parent: 'CD', kind: 'insurgent', select: [[29.2, -1.7, 140], [28.85, -2.5, 90]], colors: ['#2a6b3a', '#e8c547', '#1b1b1b'], backers: ['RW'] },
];
