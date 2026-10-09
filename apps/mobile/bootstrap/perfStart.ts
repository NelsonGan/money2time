import { perfMark } from '~/utils/perfTrace';

// Imported first by index.ts, so this runs before the rest of the app's module
// graph is evaluated. `index_eval`, marked once those imports have run, minus
// this mark is what evaluating that graph cost.
perfMark('modules_start');
