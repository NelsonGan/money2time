export interface TutorialTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TutorialTargetId =
  | 'nav.add'
  | 'nav.tabs'
  | 'insights.type_selector'
  | 'settings.management'
  | 'settings.recurring'
  | 'settings.statement_import'
  | 'settings.start_tutorial';

export interface TutorialSpotlightRequest {
  active: boolean;
  targetId: TutorialTargetId | null;
  token: number;
}
