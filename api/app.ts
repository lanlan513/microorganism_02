import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    name: '微生物文明馆 API',
    version: '1.0.0',
    endpoints: {
      'GET /api/microbes': '获取所有微生物列表',
      'GET /api/microbes/:id': '获取单个微生物详情',
      'GET /api/microbes/category/:category': '按分类获取微生物',
      'GET /api/microbes/:id/related': '获取相关微生物',
      'GET /api/stats': '获取统计数据',
      'POST /api/gram/sessions': '创建革兰染色实验会话',
      'GET /api/gram/sessions/:id/replay?at=timestamp': '按操作日志原样重放画面',
    },
  });
});

app.use('/api', apiRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

export default app;
