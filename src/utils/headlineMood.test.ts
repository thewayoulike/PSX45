import { describe, expect, it } from 'vitest';
import { buildMatchers, buildMoodIndex, coreName, matchCompanies, moodLabel, scoreHeadline } from './headlineMood';

const companies = [
  { symbol: 'OGDC', name: 'Oil &amp; Gas Development Company Limited' },
  { symbol: 'HUBC', name: 'The Hub Power Company Limited' },
  { symbol: 'PIOC', name: 'Pioneer Cement Limited' },
  { symbol: 'SYS', name: 'Systems Limited' },
  { symbol: 'HBL', name: 'Habib Bank Limited' },
  { symbol: 'PSEL', name: 'Pakistan Services Limited' },
  { symbol: 'PPP', name: 'Pakistan Paper Products Limited' },
  { symbol: 'ENGROH', name: 'Engro Holdings Limited' },
  { symbol: 'EFERT', name: 'Engro Fertilizers Limited' },
];
const matchers = buildMatchers(companies);
const match = (title: string) => matchCompanies(title, matchers);

describe('company matching', () => {
  it('strips legal suffixes from names', () => {
    expect(coreName('The Hub Power Company Limited')).toBe('Hub Power');
    expect(coreName('Oil &amp; Gas Development Company Limited')).toBe('Oil & Gas Development');
  });
  it('finds tickers, names and known short names', () => {
    expect(match('OGDCL profit surges 53% to Rs58.5bn')).toEqual(['OGDC']);
    expect(match('HUBCO to commence local BYD vehicle production')).toEqual(['HUBC']);
    expect(match('Pioneer Cement commissions 28MW solar power plant')).toEqual(['PIOC']);
    expect(match('Fauji Foundation acquires stake in Pearl Continental owner')).toEqual(['PSEL']);
    expect(match('Engro Fertilizers, partner sign MoU')).toEqual(['EFERT']);
  });
  it('ignores common words, acronyms and survey names', () => {
    expect(match('Payment systems upgrade planned by SBP')).toEqual([]);
    expect(match('Saeed says PPP yet to receive draft')).toEqual([]);
    expect(match('HBL manufacturing PMI edges down to a six-month low')).toEqual([]);
    expect(match('HBL posts record profit')).toEqual(['HBL']);
  });
});

describe('headline scoring', () => {
  const label = (t: string) => scoreHeadline(t).sentiment;
  it('reads good news', () => {
    expect(label('PSO profit jump 172% to Rs25.6bn in 1QFY27')).toBe('positive');
    expect(label('Lucky Cement approves 3.2 million-tonne capacity expansion')).toBe('positive');
    expect(label('Pakistan Petroleum earns Rs99bn profit, makes 11 discoveries')).toBe('positive');
    expect(label('Company announces 25% cash dividend')).toBe('positive');
    expect(label('Engro wins Rs5bn contract for LNG terminal')).toBe('positive');
  });
  it('reads bad news', () => {
    expect(label('Cement maker posts net loss in first quarter')).toBe('negative');
    expect(label('Refinery profit falls 40% on lower margins')).toBe('negative');
    expect(label('Plant shut down after gas supply suspended')).toBe('negative');
    expect(label('Regulator fines bank Rs50m')).toBe('negative');
    expect(label('Loss widens to Rs2bn as sales slump')).toBe('negative');
  });
  it('understands turning phrases', () => {
    expect(label('Steel maker loss narrows to Rs1bn')).toBe('positive');
    expect(label('Automaker returns to profit')).toBe('positive');
  });
  it('leaves plain announcements neutral', () => {
    expect(label('PSO board approves renewal of SPA with ARL for 5 years')).toBe('neutral');
    expect(label('KE seeks cabinet approval for coal conversion')).toBe('neutral');
    expect(label('Board meeting to consider accounts on 12 November')).toBe('neutral');
  });
});

describe('mood index', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const item = (id: string, title: string, daysAgo: number, region = 'Pakistan') => ({
    id, title, url: `https://example.pk/${id}`, source: 'Dawn', region, indexedAt: new Date(now - daysAgo * 86400000).toISOString(),
  });
  it('groups the past week of Pakistani headlines by company', () => {
    const index = buildMoodIndex([
      item('a', 'OGDCL profit surges 53%', 1),
      item('b', 'OGDCL posts net loss on write-off', 2),
      item('c', 'OGDCL profit rises again', 3),
      item('d', 'OGDCL profit jumps', 9),
      item('e', 'OGDC record output', 1, 'Global'),
    ], companies, now);
    const ogdc = index.get('OGDC')!;
    expect(ogdc.headlines.map((h) => h.id)).toEqual(['a', 'b', 'c']);
    expect(ogdc).toMatchObject({ positive: 2, negative: 1, neutral: 0, mood: 'positive', label: 'Mostly positive' });
  });
  it('labels the overall mood', () => {
    expect(moodLabel(0, 0, 0).label).toBe('No news');
    expect(moodLabel(3, 0, 1).label).toBe('Positive');
    expect(moodLabel(0, 2, 0).label).toBe('Negative');
    expect(moodLabel(1, 1, 0).label).toBe('Mixed');
    expect(moodLabel(0, 0, 3).label).toBe('Mostly neutral');
  });
});
