export interface TutorialTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TutorialTargetId =
  | 'home.display_toggle'
  | 'home.converter'
  | 'nav.add'
  | 'insights.type_selector'
  | 'settings.management'
  | 'settings.recurring'
  | 'settings.start_tutorial';

export interface TutorialSpotlightRequest {
  active: boolean;
  targetId: TutorialTargetId | null;
  token: number;
}
