import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  AnalyticsEvents,
  featureUsedBy,
  isMixpanelEvent,
  toGa4EventName,
  TRANSACTION_MILESTONES,
} from '~/services/analytics.shared';

function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replace(/`/g, '')),
    );
}

// The body under `heading` (a full heading line), up to the next heading of the
// same or a higher level.
function section(markdown: string, heading: string): string {
  const level = heading.indexOf(' ');
  const contents = markdown.split(`\n${heading}\n`)[1];
  if (contents == null) throw new Error(`Missing tracking table section: ${heading}`);
  return contents.split(new RegExp(`\n#{1,${level}} `))[0];
}

describe('canonical analytics tracking table', () => {
  // The tables live in the Analytics section of the repository README; reading
  // only that section keeps other tables there from counting as events.
  const readPlan = () =>
    section(readFileSync(resolve(__dirname, '../../../../README.md'), 'utf8'), '## Analytics');

  it('documents every custom event exactly once with its provider names and routing', () => {
    const rows = tableRows(readPlan()).filter((cells) => /^[A-Z][A-Z_]+$/.test(cells[0]));
    expect(rows).toHaveLength(Object.keys(AnalyticsEvents).length);
    expect(new Set(rows.map(([key]) => key)).size).toBe(rows.length);

    const documented = Object.fromEntries(
      rows.map(([key, name, ga4Name, mixpanel]) => [key, { name, ga4Name, mixpanel }]),
    );
    const implemented = Object.fromEntries(
      Object.entries(AnalyticsEvents).map(([key, name]) => [
        key,
        { name, ga4Name: toGa4EventName(name), mixpanel: isMixpanelEvent(name) ? 'Yes' : 'No' },
      ]),
    );
    expect(documented).toEqual(implemented);
  });

  it('keeps the volume summary consistent with the event destinations', () => {
    const rows = tableRows(section(readPlan(), '### Provider coverage'));
    const counts = Object.fromEntries(rows.map(([label, count]) => [label, Number(count)]));
    const events = Object.values(AnalyticsEvents);
    expect(counts['All custom events']).toBe(events.length);
    expect(counts['Mixpanel + GA4 custom events']).toBe(events.filter(isMixpanelEvent).length);
    expect(counts['GA4-only custom events']).toBe(
      events.filter((name) => !isMixpanelEvent(name)).length,
    );
    const features = new Set(
      events
        .map((name) => featureUsedBy(name, { mode: 'time', reimbursable: true, source: 'widget' }))
        .filter((feature) => feature != null),
    );
    expect(counts['Feature first-use definitions']).toBe(features.size);
    expect(counts['Transaction milestone thresholds']).toBe(TRANSACTION_MILESTONES.length);
    expect(counts['Maximum adoption/milestone events per eligible install']).toBe(
      features.size + TRANSACTION_MILESTONES.length,
    );
  });

  it('documents every feature adoption trigger and its excluded uses', () => {
    const rows = tableRows(section(readPlan(), '### Feature adoption')).filter((cells) =>
      /^[a-z]+(?:_[a-z]+)*$/.test(cells[0]),
    );
    const documented = Object.fromEntries(rows.map(([feature, key]) => [key, feature]));
    const implemented = Object.fromEntries(
      Object.entries(AnalyticsEvents).flatMap(([key, name]) => {
        const feature = featureUsedBy(name, { mode: 'time', reimbursable: true, source: 'widget' });
        return feature ? [[key, feature]] : [];
      }),
    );
    expect(new Set(rows.map(([feature]) => feature)).size).toBe(rows.length);
    expect(documented).toEqual(implemented);

    for (const [feature, key, qualifyingProperties, excludedProperties] of rows) {
      const name = AnalyticsEvents[key as keyof typeof AnalyticsEvents];
      expect(featureUsedBy(name, JSON.parse(qualifyingProperties))).toBe(feature);
      for (const properties of JSON.parse(excludedProperties)) {
        expect(featureUsedBy(name, properties)).toBeNull();
      }
    }
  });

  it('keeps the documented transaction milestones consistent with the volume budget', () => {
    const rows = tableRows(section(readPlan(), '### Transaction milestones')).filter((cells) =>
      /^\d+$/.test(cells[0]),
    );
    expect(rows.map(([count]) => Number(count))).toEqual(TRANSACTION_MILESTONES);
  });
});
