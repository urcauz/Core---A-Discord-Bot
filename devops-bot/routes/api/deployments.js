const express = require('express');
const { DeployEvent } = require('../../models/DeployEvent');
const { requireApiPermission, ACTIONS } = require('../../dashboard/auth');

function createDeploymentsApiRouter() {
  const router = express.Router();

  router.get('/', requireApiPermission(ACTIONS.VIEW_DASHBOARD_API), async (req, res) => {
    try {
      const service = req.query.service;
      const status = req.query.status;
      const project = req.query.project;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));

      const query = {};
      if (service) query.service = service;
      if (status) query.status = status;
      if (project) query.project = project;

      const skip = (page - 1) * pageSize;
      const [totalCount, deployments] = await Promise.all([
        DeployEvent.countDocuments(query),
        DeployEvent.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean()
      ]);

      return res.json({
        ok: true,
        data: {
          deployments,
          totalCount,
          page,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
        }
      });
    } catch (error) {
      console.error('[api/deployments] list failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load deployments' });
    }
  });

  return router;
}

module.exports = {
  createDeploymentsApiRouter
};
