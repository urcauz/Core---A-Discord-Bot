const express = require('express');
const { Task } = require('../../models/Task');
const { requireApiPermission, ACTIONS } = require('../../dashboard/auth');

function createTasksApiRouter() {
  const router = express.Router();

  router.get('/', requireApiPermission(ACTIONS.VIEW_DASHBOARD_API), async (req, res) => {
    try {
      const status = req.query.status;
      const project = req.query.project;
      const assignedTo = req.query.assignedTo;
      const search = req.query.search;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));

      const query = { archived: false };
      if (status) query.status = status;
      if (project) query.project = project;
      if (assignedTo) query.assignedTo = assignedTo;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * pageSize;
      const [totalCount, tasks] = await Promise.all([
        Task.countDocuments(query),
        Task.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean()
      ]);

      return res.json({
        ok: true,
        data: {
          tasks,
          totalCount,
          page,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
        }
      });
    } catch (error) {
      console.error('[api/tasks] list failed:', error);
      return res.status(500).json({ ok: false, error: 'Failed to load tasks' });
    }
  });

  return router;
}

module.exports = {
  createTasksApiRouter
};
