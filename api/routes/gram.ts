import { Router } from 'express';
import type { ActionId, ClaimId } from '../../shared/gram-types.js';
import {
  createSession,
  endAction,
  getSession,
  replay,
  startAction,
  submitClaim,
} from '../src/gram/gramService.js';

export const gramRouter = Router();

const ACTIONS: ActionId[] = ['crystal_violet', 'iodine', 'alcohol', 'safranin', 'water'];
const CLAIMS: ClaimId[] = ['gram_positive', 'gram_negative', 'fungi', 'unreliable'];

function sendError(error: unknown, res: Parameters<Parameters<typeof gramRouter.post>[1]>[1]) {
  const err = error as { status?: number; message?: string; envelope?: unknown };
  res.status(err.status ?? 500).json({
    success: false,
    error: err.message ?? '革兰染色实验服务异常',
    data: err.envelope,
  });
}

gramRouter.post('/sessions', async (req, res) => {
  try {
    res.json({ success: true, data: await createSession() });
  } catch (error) {
    sendError(error, res);
  }
});

gramRouter.get('/sessions/:id', async (req, res) => {
  try {
    res.json({ success: true, data: await getSession(req.params.id) });
  } catch (error) {
    sendError(error, res);
  }
});

gramRouter.post('/sessions/:id/actions/:action/start', async (req, res) => {
  try {
    const action = req.params.action as ActionId;
    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, error: '未知实验操作' });
    }
    res.json({ success: true, data: await startAction(req.params.id, action, req.body?.clientAt) });
  } catch (error) {
    sendError(error, res);
  }
});

gramRouter.post('/sessions/:id/actions/:action/end', async (req, res) => {
  try {
    const action = req.params.action as ActionId;
    if (!ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, error: '未知实验操作' });
    }
    res.json({ success: true, data: await endAction(req.params.id, action, req.body?.clientAt) });
  } catch (error) {
    sendError(error, res);
  }
});

gramRouter.post('/sessions/:id/claim', async (req, res) => {
  try {
    const claim = req.body?.claim as ClaimId;
    if (!CLAIMS.includes(claim)) {
      return res.status(400).json({ success: false, error: '请选择一个有效结论' });
    }
    res.json({ success: true, data: await submitClaim(req.params.id, claim) });
  } catch (error) {
    sendError(error, res);
  }
});

gramRouter.get('/sessions/:id/replay', async (req, res) => {
  try {
    const requestedAt = req.query.at ? Number(req.query.at) : undefined;
    res.json({
      success: true,
      data: await replay(req.params.id, Number.isFinite(requestedAt) ? requestedAt : undefined),
    });
  } catch (error) {
    sendError(error, res);
  }
});
