const express = require('express');
const Standup = require('../../models/Standup');
const { requireApiPermission, ACTIONS } = require('../../dashboard/auth');

function createStandupsApiRouter() {
  const router = express.Router();

  router.get('/', requireApiPermission(ACTIONS.VIEW_DASHBOARD_API), async (req, res) => {
    try {
      const date = req.query.date;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 30)));

      const query = {};
      if (date) query.date = date;

      const skip = (page - 1) * pageSize;
      const [totalCount, submissions] = await Promise.all([
        Standup.countDocuments(query),
        Standup.find(query)
          .sort({ date: -1, submittedAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean()
      ]);

      const missedCount = submissions.filter((item) => !item.submittedAt).length;

      return res.json({
        ok: true,
        data: {
          submissions,
          missedCount,
          totalCount,
          page,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
        }
      });
    } catch (error) {
      console.error('[api/standups] list failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load standups' });
    }
  });

  return router;
}

module.exports = {
  createStandupsApiRouter
};
