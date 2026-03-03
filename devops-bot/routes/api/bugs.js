const express = require('express');
const { Bug } = require('../../models/Bug');
const { requireApiPermission, ACTIONS } = require('../../dashboard/auth');

function createBugsApiRouter() {
  const router = express.Router();

  router.get('/', requireApiPermission(ACTIONS.VIEW_DASHBOARD_API), async (req, res) => {
    try {
      const severity = req.query.severity;
      const status = req.query.status;
      const project = req.query.project;
      const search = req.query.search;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));

      const query = {};
      if (severity) query.severity = severity;
      if (status) query.status = status;
      if (project) query.project = project;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { actualResult: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * pageSize;
      const [totalCount, bugs] = await Promise.all([
        Bug.countDocuments(query),
        Bug.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean()
      ]);

      return res.json({
        ok: true,
        data: {
          bugs,
          totalCount,
          page,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
        }
      });
    } catch (error) {
      console.error('[api/bugs] list failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load bugs' });
    }
  });

  return router;
}

module.exports = {
  createBugsApiRouter
};
