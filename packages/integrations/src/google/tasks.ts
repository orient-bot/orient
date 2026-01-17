/**
 * Google Tasks Service
 *
 * Provides functionality to interact with Google Tasks using OAuth 2.0.
 * Supports listing, creating, updating, and completing tasks and task lists.
 *
 * Exported via @orient/integrations package.
 */

import { google, tasks_v1 } from 'googleapis';
import { createServiceLogger } from '@orient/core';
import { getGoogleOAuthService } from './oauth.js';

const logger = createServiceLogger('tasks-service');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface TaskListInfo {
  /** Task list ID */
  id: string;
  /** Task list title */
  title: string;
  /** Updated timestamp */
  updated?: Date;
}

export interface TaskInfo {
  /** Task ID */
  id: string;
  /** Task title */
  title: string;
  /** Task notes/description */
  notes?: string;
  /** Task status */
  status: 'needsAction' | 'completed';
  /** Due date */
  due?: Date;
  /** Completion date */
  completed?: Date;
  /** Updated timestamp */
  updated?: Date;
  /** Task list ID */
  taskListId: string;
  /** Parent task ID */
  parent?: string;
  /** Position in list */
  position?: string;
}

export interface CreateTaskOptions {
  /** Task title */
  title: string;
  /** Task notes/description */
  notes?: string;
  /** Due date */
  due?: Date;
  /** Task list ID (default: primary) */
  taskListId?: string;
  /** Parent task ID (for subtasks) */
  parent?: string;
}

export interface UpdateTaskOptions extends Partial<CreateTaskOptions> {
  /** Task ID */
  taskId: string;
  /** Task list ID */
  taskListId?: string;
  /** Task status */
  status?: 'needsAction' | 'completed';
}

export interface ListTasksOptions {
  /** Task list ID (default: primary) */
  taskListId?: string;
  /** Show completed tasks */
  showCompleted?: boolean;
  /** Show hidden tasks */
  showHidden?: boolean;
  /** Max results */
  maxResults?: number;
  /** Due date filter (tasks due before) */
  dueBefore?: Date;
  /** Due date filter (tasks due after) */
  dueAfter?: Date;
}

// =============================================================================
// TasksService Class
// =============================================================================

export class TasksService {
  private tasks: tasks_v1.Tasks | null = null;
  private currentEmail: string | null = null;

  constructor() {
    logger.debug('TasksService instance created');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get or create Tasks client for an account.
   */
  private async getClient(accountEmail?: string): Promise<tasks_v1.Tasks> {
    const oauthService = getGoogleOAuthService();

    // Determine which account to use
    const email = accountEmail || oauthService.getDefaultAccount();
    if (!email) {
      throw new Error(
        'No Google account connected. Use google_oauth_connect to connect an account.'
      );
    }

    // If we already have a client for this email, reuse it
    if (this.tasks && this.currentEmail === email) {
      return this.tasks;
    }

    // Get authenticated client
    const authClient = await oauthService.getAuthClient(email);
    this.tasks = google.tasks({ version: 'v1', auth: authClient });
    this.currentEmail = email;

    return this.tasks;
  }

  /**
   * Parse Google task into our format.
   */
  private parseTask(task: tasks_v1.Schema$Task, taskListId: string): TaskInfo {
    return {
      id: task.id || '',
      title: task.title || '(no title)',
      notes: task.notes || undefined,
      status: (task.status as TaskInfo['status']) || 'needsAction',
      due: task.due ? new Date(task.due) : undefined,
      completed: task.completed ? new Date(task.completed) : undefined,
      updated: task.updated ? new Date(task.updated) : undefined,
      taskListId,
      parent: task.parent || undefined,
      position: task.position || undefined,
    };
  }

  /**
   * Build Google task from options.
   */
  private buildTask(options: CreateTaskOptions): tasks_v1.Schema$Task {
    return {
      title: options.title,
      notes: options.notes,
      due: options.due?.toISOString(),
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * List task lists.
   */
  async listTaskLists(accountEmail?: string): Promise<TaskListInfo[]> {
    const op = logger.startOperation('listTaskLists');

    const tasks = await this.getClient(accountEmail);

    try {
      const response = await tasks.tasklists.list();
      const taskLists: TaskListInfo[] = (response.data.items || []).map((list) => ({
        id: list.id || '',
        title: list.title || '(no title)',
        updated: list.updated ? new Date(list.updated) : undefined,
      }));

      op.success('Task lists listed', { count: taskLists.length });
      return taskLists;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * List tasks from a task list.
   */
  async listTasks(options: ListTasksOptions = {}, accountEmail?: string): Promise<TaskInfo[]> {
    const op = logger.startOperation('listTasks', { options });

    const tasks = await this.getClient(accountEmail);
    const taskListId = options.taskListId || '@default';

    try {
      const response = await tasks.tasks.list({
        tasklist: taskListId,
        showCompleted: options.showCompleted ?? true,
        showHidden: options.showHidden ?? false,
        maxResults: options.maxResults || 20,
        dueMax: options.dueBefore?.toISOString(),
        dueMin: options.dueAfter?.toISOString(),
      });

      const taskInfos: TaskInfo[] = (response.data.items || []).map((task) =>
        this.parseTask(task, taskListId)
      );

      op.success('Tasks listed', { count: taskInfos.length, taskListId });
      return taskInfos;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a new task.
   */
  async createTask(options: CreateTaskOptions, accountEmail?: string): Promise<TaskInfo> {
    const op = logger.startOperation('createTask', { title: options.title });

    const tasks = await this.getClient(accountEmail);
    const taskListId = options.taskListId || '@default';
    const task = this.buildTask(options);

    try {
      const response = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: task,
        parent: options.parent,
      });

      const createdTask = this.parseTask(response.data, taskListId);
      op.success('Task created', { taskId: createdTask.id });
      return createdTask;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update a task.
   */
  async updateTask(options: UpdateTaskOptions, accountEmail?: string): Promise<TaskInfo> {
    const op = logger.startOperation('updateTask', { taskId: options.taskId });

    const tasks = await this.getClient(accountEmail);
    const taskListId = options.taskListId || '@default';

    try {
      const existing = await tasks.tasks.get({
        tasklist: taskListId,
        task: options.taskId,
      });

      const updatedTask = this.buildTask({
        title: options.title || existing.data.title || '(no title)',
        notes: options.notes ?? existing.data.notes ?? undefined,
        due: options.due || (existing.data.due ? new Date(existing.data.due) : undefined),
        taskListId,
        parent: options.parent,
      });

      if (options.status) {
        updatedTask.status = options.status;
      }

      const response = await tasks.tasks.update({
        tasklist: taskListId,
        task: options.taskId,
        requestBody: updatedTask,
      });

      const task = this.parseTask(response.data, taskListId);
      op.success('Task updated', { taskId: task.id });
      return task;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Complete a task.
   */
  async completeTask(
    taskId: string,
    taskListId: string = '@default',
    accountEmail?: string
  ): Promise<TaskInfo> {
    return this.updateTask({ taskId, taskListId, status: 'completed' }, accountEmail);
  }

  /**
   * Delete a task.
   */
  async deleteTask(
    taskId: string,
    taskListId: string = '@default',
    accountEmail?: string
  ): Promise<void> {
    const op = logger.startOperation('deleteTask', { taskId });

    const tasks = await this.getClient(accountEmail);

    try {
      await tasks.tasks.delete({ tasklist: taskListId, task: taskId });
      op.success('Task deleted');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let tasksService: TasksService | null = null;

/**
 * Get or create the TasksService singleton.
 */
export function getTasksService(): TasksService {
  if (!tasksService) {
    tasksService = new TasksService();
  }
  return tasksService;
}

/**
 * Create a new TasksService instance.
 */
export function createTasksService(): TasksService {
  return new TasksService();
}
