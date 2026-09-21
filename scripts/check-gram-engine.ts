import { SPECIMENS, getFrameAt, gradeSession } from '../api/src/gram/engine.js';
import type { LabEvent, LabSession } from '../shared/gram-types.js';

function makeSession(specimenId: string, alcoholSec: number) {
  const specimen = SPECIMENS.find((item) => item.id === specimenId)!;
  const start = 1_000_000;
  const plan: Array<{ action?: LabEvent['type']; duration: number }> = [
    { action: 'crystal_violet', duration: 45_000 },
    { duration: 0 },
    { action: 'iodine', duration: 30_000 },
    { duration: 0 },
    { action: 'alcohol', duration: Math.round(alcoholSec * 1000) },
    { duration: 0 },
    { action: 'safranin', duration: 45_000 },
    { duration: 0 },
  ];
  const events: LabEvent[] = [{
    id: 'system', index: 0, sessionId: 'test', type: 'system', startedAt: null, endedAt: null, at: start,
  }];
  let cursor = start;
  plan.forEach((step, index) => {
    if (!step.action) {
      cursor += 1_000;
      events.push({
        id: `water-${index}`, index: events.length, sessionId: 'test', type: 'water',
        startedAt: cursor, endedAt: cursor, at: cursor,
      });
      return;
    }
    const began = cursor;
    cursor += step.duration;
    events.push({
      id: `${step.action}-${index}`, index: events.length, sessionId: 'test', type: step.action,
      startedAt: began, endedAt: cursor, at: began,
    });
  });
  const session: LabSession = {
    id: 'test',
    specimenCode: specimen.code,
    specimenLabel: specimen.label,
    status: 'complete',
    stage: 'complete',
    activeEventId: null,
    startedAt: start,
    completedAt: cursor,
    events,
    claim: null,
    grade: null,
    logHash: 'test',
  };
  const frame = getFrameAt(session, specimen, cursor);
  session.claim = specimenId === 's-aureus' ? 'gram_positive' : specimenId === 'e-coli' ? 'gram_negative' : 'fungi';
  const grade = gradeSession(session, specimen);
  console.log(specimenId, {
    alcoholSec,
    hex: frame.cells[0].fill.hex,
    pattern: frame.cells[0].pattern,
    marker: frame.marker,
    score: grade.score,
    expected: grade.expectedClaim,
    correct: grade.claimCorrect,
  });
}

for (const alcoholSec of [1, 8, 25]) {
  for (const id of ['s-aureus', 'e-coli', 'c-albicans']) makeSession(id, alcoholSec);
}
