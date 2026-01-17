/**
 * Meeting Service - Processes meeting notes and creates JIRA issues.
 *
 * Exported via @orient/integrations package.
 */

import fs from 'fs/promises';
import path from 'path';
import { createServiceLogger } from '@orient/core';
import * as jiraService from '../jira/service.js';

const logger = createServiceLogger('meeting-service');

export interface ActionItem {
  text: string;
  assignee?: string;
  issueKey?: string;
  issueType?: 'Story' | 'Task' | 'Bug' | 'Epic';
  priority?: 'High' | 'Medium' | 'Low';
  storyPoints?: number;
  completed: boolean;
  lineNumber: number;
}

export interface MeetingMetadata {
  title: string;
  date: string;
  type: 'weekly' | 'planning' | 'retrospective' | '1-on-1' | 'ad-hoc';
  attendees: string[];
}

export interface ParsedMeeting {
  metadata: MeetingMetadata;
  actionItems: ActionItem[];
  content: string;
  filePath: string;
}

/**
 * Service for parsing meeting notes and managing action items
 */
export class MeetingService {
  constructor() {
    // JiraService is now a collection of functions, no need to store instance
  }

  /**
   * Parse a meeting note file and extract action items
   */
  async parseMeetingNote(filePath: string): Promise<ParsedMeeting> {
    logger.info(`Parsing meeting note: ${filePath}`);

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const metadata = this.extractMetadata(content, filePath);
    const actionItems = this.extractActionItems(lines);

    return {
      metadata,
      actionItems,
      content,
      filePath,
    };
  }

  /**
   * Extract metadata from meeting note
   */
  private extractMetadata(content: string, filePath: string): MeetingMetadata {
    const lines = content.split('\n');

    // Extract title (first H1)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

    // Extract date
    const dateMatch = content.match(/\*\*Date:\*\*\s+(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    // Determine meeting type from file path
    let type: MeetingMetadata['type'] = 'ad-hoc';
    if (filePath.includes('/weekly/')) type = 'weekly';
    else if (filePath.includes('/planning/')) type = 'planning';
    else if (filePath.includes('/retrospectives/')) type = 'retrospective';
    else if (filePath.includes('/1-on-1/')) type = '1-on-1';

    // Extract attendees
    const attendees: string[] = [];
    let inAttendeesSection = false;

    for (const line of lines) {
      if (line.match(/^##\s+Attendees/i)) {
        inAttendeesSection = true;
        continue;
      }

      if (inAttendeesSection) {
        if (line.match(/^##/)) {
          break; // End of attendees section
        }

        const attendeeMatch = line.match(/@(\w+)/);
        if (attendeeMatch) {
          attendees.push(attendeeMatch[1]);
        }
      }
    }

    return { title, date, type, attendees };
  }

  /**
   * Extract action items from meeting notes
   * Format: - [ ] @username: Description [Issue Type] [Priority: Level] #PROJ-XXX
   */
  private extractActionItems(lines: string[]): ActionItem[] {
    const actionItems: ActionItem[] = [];
    let inActionItemsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect action items section
      if (line.match(/^##\s+Action Items/i)) {
        inActionItemsSection = true;
        continue;
      }

      // Exit action items section on next heading
      if (inActionItemsSection && line.match(/^##/)) {
        inActionItemsSection = false;
      }

      // Parse action item line
      if (inActionItemsSection || line.match(/^-\s+\[(x| )\]/i)) {
        const item = this.parseActionItemLine(line, i + 1);
        if (item) {
          actionItems.push(item);
        }
      }
    }

    return actionItems;
  }

  /**
   * Parse a single action item line
   */
  private parseActionItemLine(line: string, lineNumber: number): ActionItem | null {
    // Match checkbox: - [ ] or - [x]
    const checkboxMatch = line.match(/^-\s+\[(x| )\]/i);
    if (!checkboxMatch) return null;

    const completed = checkboxMatch[1].toLowerCase() === 'x';

    // Extract components
    const assigneeMatch = line.match(/@(\w+)/);
    const issueKeyMatch = line.match(/#(PROJ-\d+)/);
    const issueTypeMatch = line.match(/\[(Story|Task|Bug|Epic)\]/i);
    const priorityMatch = line.match(/\[Priority:\s*(High|Medium|Low)\]/i);
    const pointsMatch = line.match(/\[Points?:\s*(\d+)\]/i);

    // Extract main text (everything after checkbox and before metadata tags)
    let text = line.replace(/^-\s+\[(x| )\]\s*/i, '');
    text = text.replace(/@\w+:\s*/, ''); // Remove assignee prefix
    text = text.replace(/\[(Story|Task|Bug|Epic)\]/gi, '').trim();
    text = text.replace(/\[Priority:\s*(High|Medium|Low)\]/gi, '').trim();
    text = text.replace(/\[Points?:\s*\d+\]/gi, '').trim();
    text = text.replace(/#PROJ-\d+/g, '').trim();

    return {
      text,
      assignee: assigneeMatch ? assigneeMatch[1] : undefined,
      issueKey: issueKeyMatch ? issueKeyMatch[1] : undefined,
      issueType: issueTypeMatch ? (issueTypeMatch[1] as ActionItem['issueType']) : undefined,
      priority: priorityMatch ? (priorityMatch[1] as ActionItem['priority']) : undefined,
      storyPoints: pointsMatch ? parseInt(pointsMatch[1], 10) : undefined,
      completed,
      lineNumber,
    };
  }

  /**
   * Sync action items to JIRA - create issues for items without issue keys
   */
  async syncActionItemsToJira(
    filePath: string,
    dryRun: boolean = false
  ): Promise<{ created: number; updated: number; errors: string[] }> {
    const parsed = await this.parseMeetingNote(filePath);
    const results = { created: 0, updated: 0, errors: [] as string[] };

    logger.info(`Syncing ${parsed.actionItems.length} action items to JIRA (dry-run: ${dryRun})`);

    const itemsToCreate = parsed.actionItems.filter((item) => !item.issueKey && !item.completed);

    if (itemsToCreate.length === 0) {
      logger.info('No action items to sync - all items either have JIRA issues or are completed');
      return results;
    }

    logger.info(`Found ${itemsToCreate.length} action items to create in JIRA`);

    for (const item of itemsToCreate) {
      try {
        if (dryRun) {
          logger.info(`[DRY RUN] Would create: ${item.text}`);
          results.created++;
        } else {
          // Create JIRA issue
          const issueType = item.issueType || 'Task';
          const summary = item.text.substring(0, 100); // Limit summary length
          const description = `Action item from meeting note: ${parsed.metadata.title}\n\n${item.text}\n\nMeeting: ${parsed.metadata.date}\nFile: ${path.basename(filePath)}`;

          logger.info(`Creating JIRA ${issueType}: ${summary}`);

          // Note: This is a simplified version - you may need to adjust based on your JIRA setup
          // The actual implementation would use the Atlassian MCP tools or JiraService
          logger.warn('JIRA issue creation not yet implemented - would create:', {
            issueType,
            summary,
            description,
            assignee: item.assignee,
            priority: item.priority,
          });

          results.created++;

          // TODO: Update the meeting note file with the new issue key
          // await this.updateActionItemWithIssueKey(filePath, item, newIssueKey);
        }
      } catch (error) {
        const errorMsg = `Failed to create issue for: ${item.text} - ${error}`;
        logger.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    return results;
  }

  /**
   * Update an action item in the meeting note with a JIRA issue key
   */
  private async updateActionItemWithIssueKey(
    filePath: string,
    item: ActionItem,
    issueKey: string
  ): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find the line and append the issue key
    if (item.lineNumber > 0 && item.lineNumber <= lines.length) {
      const line = lines[item.lineNumber - 1];
      if (!line.includes(issueKey)) {
        lines[item.lineNumber - 1] = `${line.trimEnd()} #${issueKey}`;
        await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
        logger.info(`Updated action item with issue key: ${issueKey}`);
      }
    }
  }

  /**
   * Get all action items across all meeting notes
   */
  async getAllActionItems(meetingsDir: string): Promise<ActionItem[]> {
    const allItems: ActionItem[] = [];

    const scanDirectory = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
            try {
              const parsed = await this.parseMeetingNote(fullPath);
              allItems.push(...parsed.actionItems);
            } catch (error) {
              logger.warn(`Failed to parse ${fullPath}: ${error}`);
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory ${dir}: ${error}`);
      }
    };

    await scanDirectory(meetingsDir);
    return allItems;
  }

  /**
   * Get open (incomplete) action items
   */
  async getOpenActionItems(meetingsDir: string): Promise<ActionItem[]> {
    const allItems = await this.getAllActionItems(meetingsDir);
    return allItems.filter((item) => !item.completed);
  }

  /**
   * Get action items assigned to a specific user
   */
  async getActionItemsByAssignee(meetingsDir: string, assignee: string): Promise<ActionItem[]> {
    const allItems = await this.getAllActionItems(meetingsDir);
    return allItems.filter((item) => item.assignee === assignee);
  }

  /**
   * Generate a summary report of action items
   */
  async generateActionItemReport(meetingsDir: string): Promise<string> {
    const allItems = await this.getAllActionItems(meetingsDir);
    const openItems = allItems.filter((item) => !item.completed);
    const completedItems = allItems.filter((item) => item.completed);

    // Group by assignee
    const byAssignee = new Map<string, ActionItem[]>();
    for (const item of openItems) {
      const assignee = item.assignee || 'Unassigned';
      if (!byAssignee.has(assignee)) {
        byAssignee.set(assignee, []);
      }
      byAssignee.get(assignee)!.push(item);
    }

    // Build report
    let report = '# Action Items Report\n\n';
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    report += `## Summary\n\n`;
    report += `- **Total action items:** ${allItems.length}\n`;
    report += `- **Open:** ${openItems.length}\n`;
    report += `- **Completed:** ${completedItems.length}\n`;
    report += `- **Completion rate:** ${((completedItems.length / allItems.length) * 100).toFixed(1)}%\n\n`;

    report += `## Open Action Items by Assignee\n\n`;

    for (const [assignee, items] of Array.from(byAssignee.entries()).sort()) {
      report += `### @${assignee} (${items.length} items)\n\n`;

      for (const item of items) {
        const issueLink = item.issueKey ? `[#${item.issueKey}]` : '[ ]';
        const priority = item.priority ? `**${item.priority}**` : '';
        report += `- ${issueLink} ${item.text} ${priority}\n`;
      }

      report += '\n';
    }

    return report;
  }
}
