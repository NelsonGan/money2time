const fs = require('node:fs');
const path = require('node:path');

// Metro follows every re-export in Lucide's barrel. Resolve aliases from the
// installed package so named imports bundle only their original icon module.
const esmDir = path.resolve(path.dirname(require.resolve('lucide-react-native')), '../esm');
const barrel = fs.readFileSync(path.join(esmDir, 'lucide-react-native.js'), 'utf8');
const modules = new Map();
for (const match of barrel.matchAll(/export \{ ([^}]+) \} from '([^']+)';/g)) {
  for (const name of match[1].matchAll(/default as (\w+)/g)) {
    modules.set(name[1], path.resolve(esmDir, match[2]));
  }
}

module.exports = function lucideImports({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(importPath) {
        const node = importPath.node;
        if (node.source.value !== 'lucide-react-native' || node.importKind === 'type') return;

        const individual = [];
        const remaining = [];
        for (const specifier of node.specifiers) {
          const target =
            t.isImportSpecifier(specifier) && specifier.importKind !== 'type'
              ? modules.get(specifier.imported.name ?? specifier.imported.value)
              : undefined;
          if (target) {
            individual.push(
              t.importDeclaration(
                [t.importDefaultSpecifier(specifier.local)],
                t.stringLiteral(target),
              ),
            );
          } else {
            remaining.push(specifier);
          }
        }
        if (individual.length === 0) return;
        node.specifiers = remaining;
        importPath.replaceWithMultiple(remaining.length ? [node, ...individual] : individual);
      },
    },
  };
};
