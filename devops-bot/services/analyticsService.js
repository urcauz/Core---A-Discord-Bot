const { Task } = require('../models/Task');
const { Bug } = require('../models/Bug');
const Standup = require('../models/Standup');
const { DeployEvent } = require('../models/DeployEvent');

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function getDateRange(days = 7) {
  const end = endOfDay(new Date());
  const start = startOfDay(new Date(end));
  start.setDate(start.getDate() - (Math.max(1, days) - 1));

  return {
    start,
    end,
    label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    days: Math.max(1, days)
  };
}

function toPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function roundTwo(value) {
  return Number((value || 0).toFixed(2));
}

function formatMillisecondsToHours(ms) {
  if (!ms || ms <= 0) return 0;
  return roundTwo(ms / (1000 * 60 * 60));
}

function getWeekdayCountBetween(start, end) {
  let count = 0;
  const cursor = startOfDay(start);
  const last = startOfDay(end);

  while (cursor <= last) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

async function getTaskStats(range) {
  const createdMatch = { createdAt: { $gte: range.start, $lte: range.end }, archived: false };
  const completedMatch = { status: 'Completed', updatedAt: { $gte: range.start, $lte: range.end }, archived: false };

  const [createdCount, completedCount, statusBreakdown, topContributors, completionData] = await Promise.all([
    Task.countDocuments(createdMatch),
    Task.countDocuments(completedMatch),
    Task.aggregate([
      { $match: createdMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Task.aggregate([
      { $match: completedMatch },
      {
        $group: {
          _id: { $ifNull: ['$assignedTo', '$createdBy'] },
          completedTasks: { $sum: 1 }
        }
      },
      { $sort: { completedTasks: -1 } },
      { $limit: 5 }
    ]),
    Task.aggregate([
      { $match: completedMatch },
      {
        $project: {
          completionMs: { $subtract: ['$updatedAt', '$createdAt'] }
        }
      },
      { $match: { completionMs: { $gte: 0 } } },
      {
        $group: {
          _id: null,
          averageCompletionMs: { $avg: '$completionMs' }
        }
      }
    ])
  ]);

  const statusMap = statusBreakdown.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  return {
    range,
    tasksCreated: createdCount,
    tasksCompleted: completedCount,
    statusBreakdown: statusMap,
    topContributors: topContributors.map((item) => ({
      userId: item._id,
      completedTasks: item.completedTasks
    })),
    averageCompletionHours: formatMillisecondsToHours(completionData[0]?.averageCompletionMs || 0)
  };
}

async function getBugStats(range) {
  const reportedMatch = { createdAt: { $gte: range.start, $lte: range.end } };
  const resolvedMatch = {
    status: { $in: ['Fixed', 'Closed'] },
    updatedAt: { $gte: range.start, $lte: range.end }
  };

  const [reportedCount, fixedCount, severityBreakdown, resolutionData, openClosed, criticalCount] = await Promise.all([
    Bug.countDocuments(reportedMatch),
    Bug.countDocuments(resolvedMatch),
    Bug.aggregate([
      { $match: reportedMatch },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Bug.aggregate([
      { $match: resolvedMatch },
      {
        $project: {
          resolutionMs: { $subtract: ['$updatedAt', '$createdAt'] }
        }
      },
      { $match: { resolutionMs: { $gte: 0 } } },
      {
        $group: {
          _id: null,
          avgResolutionMs: { $avg: '$resolutionMs' }
        }
      }
    ]),
    Bug.aggregate([
      { $match: reportedMatch },
      {
        $group: {
          _id: {
            $cond: [{ $in: ['$status', ['Closed', 'Fixed']] }, 'Closed', 'Open']
          },
          count: { $sum: 1 }
        }
      }
    ]),
    Bug.countDocuments({ ...reportedMatch, severity: 'Critical' })
  ]);

  const severityMap = severityBreakdown.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const openClosedMap = openClosed.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, { Open: 0, Closed: 0 });

  return {
    range,
    bugsReported: reportedCount,
    bugsFixed: fixedCount,
    severityBreakdown: severityMap,
    averageResolutionHours: formatMillisecondsToHours(resolutionData[0]?.avgResolutionMs || 0),
    criticalBugCount: criticalCount,
    openClosedRatio: {
      open: openClosedMap.Open || 0,
      closed: openClosedMap.Closed || 0
    }
  };
}

async function getStandupStats(range, options = {}) {
  const startDateKey = range.start.toISOString().slice(0, 10);
  const endDateKey = range.end.toISOString().slice(0, 10);

  const [submissionData, blockersData] = await Promise.all([
    Standup.aggregate([
      {
        $match: {
          date: { $gte: startDateKey, $lte: endDateKey },
          submittedAt: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$userId',
          submissions: { $sum: 1 }
        }
      },
      { $sort: { submissions: -1 } }
    ]),
    Standup.aggregate([
      {
        $match: {
          date: { $gte: startDateKey, $lte: endDateKey },
          submittedAt: { $ne: null },
          blockers: { $nin: ['', 'None', 'none', 'No blockers', 'no blockers'] }
        }
      },
      {
        $group: {
          _id: null,
          blockerCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const totalSubmissions = submissionData.reduce((sum, item) => sum + item.submissions, 0);
  const weekdayCount = getWeekdayCountBetween(range.start, range.end);
  const devTeamSize = Math.max(0, Number(options.devTeamSize || 0));
  const expectedSubmissions = devTeamSize * weekdayCount;
  const submissionRate = roundTwo(toPercent(totalSubmissions, expectedSubmissions));
  const missedStandups = Math.max(0, expectedSubmissions - totalSubmissions);

  return {
    range,
    totalSubmissions,
    devTeamSize,
    weekdayCount,
    expectedSubmissions,
    submissionRate,
    blockersReported: blockersData[0]?.blockerCount || 0,
    missedStandups,
    mostConsistentContributors: submissionData.slice(0, 5).map((item) => ({
      userId: item._id,
      submissions: item.submissions
    }))
  };
}

async function getDeploymentStats(range) {
  const match = { timestamp: { $gte: range.start, $lte: range.end } };

  const [statusBreakdown, projectBreakdown] = await Promise.all([
    DeployEvent.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    DeployEvent.aggregate([
      { $match: match },
      { $group: { _id: '$project', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ])
  ]);

  const totalDeployments = statusBreakdown.reduce((sum, item) => sum + item.count, 0);
  const successCount = statusBreakdown.find((item) => item._id === 'Success')?.count || 0;
  const failureCount = statusBreakdown.find((item) => item._id === 'Failure')?.count || 0;
  const successRate = roundTwo(toPercent(successCount, totalDeployments));
  const failureRate = roundTwo(toPercent(failureCount, totalDeployments));

  return {
    range,
    totalDeployments,
    successCount,
    failureCount,
    successRate,
    failureRate,
    mostDeployedProject: projectBreakdown[0]?._id || 'N/A'
  };
}

async function getOverviewStats(range, options = {}) {
  const [taskStats, bugStats, standupStats, deploymentStats] = await Promise.all([
    getTaskStats(range),
    getBugStats(range),
    getStandupStats(range, options),
    getDeploymentStats(range)
  ]);

  return {
    range,
    tasksCreated: taskStats.tasksCreated,
    tasksCompleted: taskStats.tasksCompleted,
    bugsReported: bugStats.bugsReported,
    bugsFixed: bugStats.bugsFixed,
    deploymentSuccessRate: deploymentStats.successRate,
    standupSubmissionRate: standupStats.submissionRate
  };
}

module.exports = {
  getDateRange,
  getOverviewStats,
  getTaskStats,
  getBugStats,
  getStandupStats,
  getDeploymentStats
};
