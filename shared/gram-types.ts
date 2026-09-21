export type ReagentId = 'crystal_violet' | 'iodine' | 'alcohol' | 'safranin';
export type ActionId = ReagentId | 'water';
export type EventType = ActionId | 'rejected_action' | 'claim' | 'system';

export type CellWallType = 'gram_positive' | 'gram_negative' | 'fungal_chitin_glucan';
export type CellShape = 'cocci' | 'rods' | 'yeast';
export type PatternKind =
  | 'none'
  | 'dense_dots'
  | 'open_lines'
  | 'bud_rings'
  | 'damaged_cross';

export type LabStage =
  | 'ready'
  | 'crystal_violet'
  | 'after_crystal_violet_wash'
  | 'iodine'
  | 'after_iodine_wash'
  | 'alcohol'
  | 'after_alcohol_wash'
  | 'safranin'
  | 'complete';

export type ClaimId = 'gram_positive' | 'gram_negative' | 'fungi' | 'unreliable';
export type ApparentResult = Exclude<ClaimId, 'unreliable'> | 'unreliable' | 'not_final';

export interface SpecimenSpec {
  id: string;
  code: string;
  label: string;
  wall: CellWallType;
  shape: CellShape;
}

export interface LabEvent {
  id: string;
  index: number;
  sessionId: string;
  type: EventType;
  attemptedAction?: ActionId;
  startedAt: number | null;
  endedAt: number | null;
  at: number;
  reason?: string;
  claim?: ClaimId;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export interface RenderCell {
  id: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotation: number;
  shape: CellShape;
  fill: RgbColor;
  pattern: PatternKind;
  opacity: number;
}

export interface LabFrame {
  at: number;
  stage: LabStage;
  activeAction: ActionId | null;
  activeElapsedMs: number | null;
  background: RgbColor;
  liquid: RgbColor;
  cells: RenderCell[];
  apparentResult: ApparentResult;
  marker: string;
  warnings: string[];
}

export interface ActionTiming {
  action: ActionId;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface GradeResult {
  score: number;
  passed: boolean;
  claim: ClaimId;
  expectedClaim: ClaimId;
  claimCorrect: boolean;
  sequenceScore: number;
  timingScore: number;
  claimScore: number;
  reasons: string[];
  protocolErrors: string[];
  chemistry: {
    crystalViolet: number;
    iodineComplex: number;
    retainedComplex: number;
    safranin: number;
    appliedSafranin: number;
    alcoholDurationSec: number;
  };
}

export interface LabSession {
  id: string;
  specimenCode: string;
  specimenLabel: string;
  status: 'active' | 'complete';
  stage: LabStage;
  activeEventId: string | null;
  startedAt: number;
  completedAt: number | null;
  events: LabEvent[];
  claim: ClaimId | null;
  grade: GradeResult | null;
  logHash: string;
}

export interface SessionEnvelope {
  session: LabSession;
  frame: LabFrame;
}

export interface ReplayResponse {
  session: LabSession;
  frame: LabFrame;
  requestedAt: number;
}
