import fs from 'node:fs';

const { transformSync } = require('@babel/core');
const plugin = require('../../scripts/babel/lucide-imports.cjs');

function transform(source: string) {
  return transformSync(source, {
    configFile: false,
    babelrc: false,
    plugins: [plugin, '@babel/plugin-transform-typescript'],
    filename: 'icons.ts',
  }).code as string;
}

describe('Lucide bundle imports', () => {
  it('resolves named icons and renamed aliases to the original individual modules', () => {
    const result = transform(
      "import { Home, SquarePen as Edit, BarChart3 } from 'lucide-react-native'; use(Home, Edit, BarChart3);",
    );
    expect(result).not.toContain('from "lucide-react-native"');
    expect(result).toContain('import Home from');
    expect(result).toContain('import Edit from');
    expect(result).toContain('/icons/house.js');
    expect(result).toContain('/icons/square-pen.js');
    expect(result).toContain('/icons/chart-column.js');
    for (const match of result.matchAll(/from "([^"]+)"/g)) {
      expect(fs.existsSync(match[1])).toBe(true);
    }
  });

  it('erases type imports without adding icon code to the bundle', () => {
    expect(
      transform("import type { LucideIcon } from 'lucide-react-native'; let icon: LucideIcon;"),
    ).not.toContain('lucide');
  });

  it('preserves namespace imports and unrelated libraries', () => {
    const result = transform(
      "import * as icons from 'lucide-react-native'; import { Image } from 'react-native'; use(icons, Image);",
    );
    expect(result).toContain("from 'lucide-react-native'");
    expect(result).toContain("from 'react-native'");
  });

  it('keeps a mixed type and value import working', () => {
    const result = transform(
      "import { type LucideIcon, Camera } from 'lucide-react-native'; const icon: LucideIcon = Camera;",
    );
    expect(result).toContain('/icons/camera.js');
    expect(result).not.toContain('LucideIcon');
  });
});
