import type { Request, Response } from 'express';
import { GRAM_REAGENTS, type GramEventAction, type GramReagent, type GramVerdict } from '../../../shared/gram/index.js';
import {
  applyGramEvent,
  createGramSession,
  getGramReplay,
  getGramSession,
  submitGramVerdict,
} from '../services/GramSessionService.js';

const actions: GramEventAction[] = ['start', 'stop'];
const verdicts: GramVerdict[] = ['positive', 'negative', 'not_bacteria'];

export class GramExperimentController {
  static start(_req: Request, res: Response) {
    try {
      res.status(201).json({ success: true, data: createGramSession() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  static getState(req: Request, res: Response) {
    const snapshot = getGramSession(req.params.sessionId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: '实验会话不存在或已过期' });
    }
    res.json({ success: true, data: snapshot });
  }

  static event(req: Request, res: Response) {
    const snapshot = getGramSession(req.params.sessionId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: '实验会话不存在或已过期' });
    }

    const { clientEventId, action, reagent } = req.body ?? {};
    if (typeof clientEventId !== 'string' || !/^[\w-]{8,128}$/.test(clientEventId)) {
      return res.status(400).json({ success: false, error: '缺少有效 clientEventId', snapshot });
    }
    if (!actions.includes(action)) {
      return res.status(400).json({ success: false, error: '事件 action 只能是 start 或 stop', snapshot });
    }
    if (!GRAM_REAGENTS.includes(reagent as GramReagent)) {
      return res.status(400).json({ success: false, error: '未知试剂', snapshot });
    }

    const result = applyGramEvent(req.params.sessionId, { clientEventId, action, reagent });
    res.status(result.status).json(result.body);
  }

  static verdict(req: Request, res: Response) {
    const snapshot = getGramSession(req.params.sessionId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: '实验会话不存在或已过期' });
    }

    const { choice, clientAttemptId } = req.body ?? {};
    if (!verdicts.includes(choice)) {
      return res.status(400).json({ success: false, error: '判定必须是 positive、negative 或 not_bacteria', snapshot });
    }
    if (typeof clientAttemptId !== 'string' || !/^[\w-]{8,128}$/.test(clientAttemptId)) {
      return res.status(400).json({ success: false, error: '缺少有效 clientAttemptId', snapshot });
    }

    const result = submitGramVerdict(req.params.sessionId, choice, clientAttemptId);
    res.status(result.status).json(result.body);
  }

  static replay(req: Request, res: Response) {
    const replay = getGramReplay(req.params.sessionId);
    if (!replay) {
      return res.status(404).json({ success: false, error: '只有已经完成并判定的实验允许获取完整重放日志' });
    }
    res.json({ success: true, data: replay });
  }
}
