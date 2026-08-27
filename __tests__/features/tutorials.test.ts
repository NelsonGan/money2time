import fs from 'node:fs';
import path from 'node:path';

import {
  getTutorial,
  groupByCategory,
  searchTutorials,
  TUTORIAL_CATEGORY_IDS,
  TUTORIALS,
} from '~/features/tutorials/content/tutorials';

const ASSET_DIR = path.join(__dirname, '../../assets/tutorials');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('tutorial catalog', () => {
  it('has unique slug ids', () => {
    const ids = TUTORIALS.map((tutorial) => tutorial.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SLUG);
  });

  it('only uses known categories, and every category has content', () => {
    const used = new Set(TUTORIALS.map((tutorial) => tutorial.category));
    for (const category of used) expect(TUTORIAL_CATEGORY_IDS).toContain(category);
    for (const category of TUTORIAL_CATEGORY_IDS) expect(used.has(category)).toBe(true);
  });

  it('has copy on every step', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorial.steps.length).toBeGreaterThan(0);
      expect(tutorial.title.length).toBeGreaterThan(0);
      expect(tutorial.summary.length).toBeGreaterThan(0);
      for (const step of tutorial.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    }
  });

  // The copywriting rule in CLAUDE.md, enforced here because tutorial copy does
  // not live in the locale files and so is not covered by the parity test.
  it('uses no em or en dashes', () => {
    for (const tutorial of TUTORIALS) {
      const prose = [
        tutorial.title,
        tutorial.summary,
        ...tutorial.steps.flatMap((step) => [step.title, step.body]),
      ].join(' ');
      expect(prose).not.toMatch(/[—–]/);
    }
  });

  // Metro resolves the registry's requires at build time, so a name that has no
  // file would be a bundle-time crash rather than a missing picture.
  it('points every step at an image that exists', () => {
    for (const tutorial of TUTORIALS) {
      for (const step of tutorial.steps) {
        if (step.image === null) continue;
        expect(fs.existsSync(path.join(ASSET_DIR, `${step.image}.png`))).toBe(true);
      }
    }
  });

  it('uses every bundled image', () => {
    const referenced = new Set(
      TUTORIALS.flatMap((tutorial) => tutorial.steps.map((step) => step.image)).filter(Boolean),
    );
    const onDisk = fs
      .readdirSync(ASSET_DIR)
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.replace(/\.png$/, ''));
    // An orphan is dead weight in the binary, which the tutorial art is big
    // enough for to matter.
    expect(onDisk.filter((name) => !referenced.has(name))).toEqual([]);
  });
});

describe('searchTutorials', () => {
  it('returns everything for an empty query', () => {
    expect(searchTutorials('')).toHaveLength(TUTORIALS.length);
    expect(searchTutorials('   ')).toHaveLength(TUTORIALS.length);
  });

  it('matches the title', () => {
    expect(searchTutorials('budget').map((t) => t.id)).toContain('budgets');
  });

  it('matches a keyword that the visible copy does not contain', () => {
    expect(searchTutorials('vacation').map((t) => t.id)).toContain('albums');
  });

  it('matches copy buried in a step', () => {
    expect(searchTutorials('back tap').map((t) => t.id)).toContain('automations');
  });

  it('requires every term to match', () => {
    expect(searchTutorials('budget zzzz')).toHaveLength(0);
  });

  it('ranks a title hit above a step-body hit', () => {
    const results = searchTutorials('receipt');
    expect(results.length).toBeGreaterThan(1);
    expect(results[0]?.title.toLowerCase()).toContain('receipt');
  });

  it('is case insensitive', () => {
    expect(searchTutorials('BUDGET').map((t) => t.id)).toContain('budgets');
  });
});

describe('groupByCategory', () => {
  it('drops empty sections and keeps catalog order', () => {
    const sections = groupByCategory(searchTutorials('budget'));
    expect(sections.every((section) => section.tutorials.length > 0)).toBe(true);
    const order = groupByCategory(TUTORIALS).map((section) => section.category);
    expect(order).toEqual(TUTORIAL_CATEGORY_IDS);
  });
});

describe('getTutorial', () => {
  it('resolves a known id and nothing else', () => {
    expect(getTutorial('budgets')?.id).toBe('budgets');
    expect(getTutorial('nope')).toBeUndefined();
    expect(getTutorial(undefined)).toBeUndefined();
    expect(getTutorial(null)).toBeUndefined();
  });
});
