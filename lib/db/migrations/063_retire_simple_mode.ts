import { retireSimpleMode } from '../retireSimpleMode';
import type { DbMigration } from './types';

const migration063RetireSimpleMode: DbMigration = {
  version: 63,
  name: '063_retire_simple_mode',
  up: retireSimpleMode,
};

export default migration063RetireSimpleMode;
