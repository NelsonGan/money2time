import type { SQLiteDatabase } from 'expo-sqlite';

export interface DbMigration {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => void;
}
