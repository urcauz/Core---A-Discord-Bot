const { SlashCommandBuilder } = require('discord.js');
const { TASK_STATUSES, TASK_PRIORITIES } = require('../../models/Task');
const {
  createTask,
  assignTask,
  moveTask,
  updateTask,
  listTasks,
  archiveTask
} = require('../../services/taskService');
const { ACTIONS, checkPermission } = require('../../services/permissionService');
const { buildTaskListEmbed } = require('../../utils/embedBuilder');

function parseDeadline(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Deadline must be a valid date string (recommended: YYYY-MM-DD).');
  }
  return parsed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Task management commands')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new task')
        .addStringOption((option) => option.setName('title').setDescription('Task title').setRequired(true))
        .addStringOption((option) =>
          option.setName('description').setDescription('Task description').setRequired(false)
        )
        .addStringOption((option) => option.setName('project').setDescription('Project name').setRequired(false))
        .addStringOption((option) =>
          option
            .setName('priority')
            .setDescription('Task priority')
            .setRequired(false)
            .addChoices(...TASK_PRIORITIES.map((value) => ({ name: value, value })))
        )
        .addStringOption((option) =>
          option
            .setName('deadline')
            .setDescription('Deadline (YYYY-MM-DD or ISO date)')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('assign')
        .setDescription('Assign a task to a user')
        .addIntegerOption((option) => option.setName('taskid').setDescription('Task ID').setRequired(true))
        .addUserOption((option) => option.setName('user').setDescription('Assignee').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('update')
        .setDescription('Update task details')
        .addIntegerOption((option) => option.setName('taskid').setDescription('Task ID').setRequired(true))
        .addStringOption((option) =>
          option.setName('description').setDescription('Updated description').setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('deadline')
            .setDescription('Updated deadline (YYYY-MM-DD or ISO date)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('priority')
            .setDescription('Updated priority')
            .setRequired(false)
            .addChoices(...TASK_PRIORITIES.map((value) => ({ name: value, value })))
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Move task to a new status')
        .addIntegerOption((option) => option.setName('taskid').setDescription('Task ID').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('newstatus')
            .setDescription('New task status')
            .setRequired(true)
            .addChoices(...TASK_STATUSES.map((value) => ({ name: value, value })))
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List tasks with filters')
        .addBooleanOption((option) => option.setName('mytasks').setDescription('Only show my tasks').setRequired(false))
        .addStringOption((option) =>
          option
            .setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(...TASK_STATUSES.map((value) => ({ name: value, value })))
        )
        .addStringOption((option) =>
          option.setName('project').setDescription('Filter by project').setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('archive')
        .setDescription('Archive a task')
        .addIntegerOption((option) => option.setName('taskid').setDescription('Task ID').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const member = interaction.member;

    try {
      if (subcommand === 'create') {
        if (!checkPermission(member, ACTIONS.CREATE_TASK)) {
          return interaction.reply({
            content: 'You do not have permission to create tasks.',
            ephemeral: true
          });
        }

        const task = await createTask({
          guild: interaction.guild,
          creatorId: interaction.user.id,
          title: interaction.options.getString('title', true),
          description: interaction.options.getString('description'),
          project: interaction.options.getString('project'),
          priority: interaction.options.getString('priority'),
          deadline: parseDeadline(interaction.options.getString('deadline'))
        });

        return interaction.reply({
          content: `Task #${task.taskId} created successfully.`,
          ephemeral: true
        });
      }

      if (subcommand === 'assign') {
        if (!checkPermission(member, ACTIONS.ASSIGN_TASK)) {
          return interaction.reply({
            content: 'You do not have permission to assign tasks.',
            ephemeral: true
          });
        }

        const task = await assignTask({
          guild: interaction.guild,
          taskId: interaction.options.getInteger('taskid', true),
          assignedToUser: interaction.options.getUser('user', true),
          actorId: interaction.user.id
        });

        return interaction.reply({
          content: `Task #${task.taskId} assigned to <@${task.assignedTo}>.`,
          ephemeral: true
        });
      }

      if (subcommand === 'move') {
        if (!checkPermission(member, ACTIONS.MOVE_TASK)) {
          return interaction.reply({
            content: 'You do not have permission to move tasks.',
            ephemeral: true
          });
        }

        const task = await moveTask({
          guild: interaction.guild,
          taskId: interaction.options.getInteger('taskid', true),
          newStatus: interaction.options.getString('newstatus', true),
          actorId: interaction.user.id
        });

        return interaction.reply({
          content: `Task #${task.taskId} moved to **${task.status}**.`,
          ephemeral: true
        });
      }

      if (subcommand === 'update') {
        if (!checkPermission(member, ACTIONS.CREATE_TASK)) {
          return interaction.reply({
            content: 'You do not have permission to update tasks.',
            ephemeral: true
          });
        }

        const task = await updateTask({
          guild: interaction.guild,
          taskId: interaction.options.getInteger('taskid', true),
          actorId: interaction.user.id,
          updates: {
            description: interaction.options.getString('description'),
            deadline: interaction.options.getString('deadline')
              ? parseDeadline(interaction.options.getString('deadline'))
              : undefined,
            priority: interaction.options.getString('priority')
          }
        });

        return interaction.reply({
          content: `Task #${task.taskId} updated successfully.`,
          ephemeral: true
        });
      }

      if (subcommand === 'list') {
        const mine = interaction.options.getBoolean('mytasks') || false;
        const status = interaction.options.getString('status');
        const project = interaction.options.getString('project');
        const page = interaction.options.getInteger('page') || 1;

        const result = await listTasks({
          requesterId: interaction.user.id,
          mine,
          status,
          project,
          page,
          pageSize: 5
        });

        return interaction.reply({
          embeds: [
            buildTaskListEmbed(result.tasks, result.page, result.totalPages, {
              mine,
              status,
              project
            })
          ],
          ephemeral: true
        });
      }

      if (subcommand === 'archive') {
        if (!checkPermission(member, ACTIONS.ARCHIVE_TASK)) {
          return interaction.reply({
            content: 'Only Founder or Lead Developer can archive tasks.',
            ephemeral: true
          });
        }

        const task = await archiveTask({
          guild: interaction.guild,
          taskId: interaction.options.getInteger('taskid', true),
          actorId: interaction.user.id
        });

        return interaction.reply({
          content: `Task #${task.taskId} archived successfully.`,
          ephemeral: true
        });
      }

      return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    } catch (error) {
      console.error(`[task command] ${subcommand} failed:`, error);
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: `Request failed: ${error.message}`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `Request failed: ${error.message}`,
        ephemeral: true
      });
    }
  }
};
