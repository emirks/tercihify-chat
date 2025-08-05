import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  ChatUsageLogSchema,
  ChatUsageStepSchema,
  DailyUsageStatsSchema,
} from "../schema.pg";

export interface ChatUsageLogCreate {
  sessionId: string;
  messageId: string;
  timestamp: number;
  userId: string;
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalExecutionTime: number;
  requestSize: number;
  responseSize: number;
  fullConversationContext?: {
    systemPrompt: string;
    messages: Array<{
      role: string;
      content: string;
      timestamp?: number;
    }>;
    finalResponse: string;
    tokensBreakdown: {
      systemPromptActual: number;
      messagesContentActual: number;
      toolsAndOverheadActual: number;
      responseActual: number;
      total: number;
    };
    overheadAnalysis?: {
      totalPromptTokens: number;
      systemPromptTokens: number;
      messagesContentTokens: number;
      calculatedOverhead: number;
      messageStructureSize: number;
      estimatedMessageStructureTokens: number;
      possibleUnaccountedTokens: number;
    };
  };
}

export interface ChatUsageStepCreate {
  logId: string;
  stepName: string;
  timestamp: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  systemPromptSize?: number;
  messagesCount?: number;
  toolsCount?: number;
  mcpToolsCount?: number;
  workflowToolsCount?: number;
  appDefaultToolsCount?: number;
  toolCallResults?: Array<{
    toolName: string;
    resultSize: number;
    executionTime: number;
  }>;
  promptSizeBreakdown?: {
    userSystemPrompt?: number;
    mcpCustomizations?: number;
    thinkingPrompt?: number;
    agentInstructions?: number;
    total: number;
  };
  actualContent?: {
    systemPrompt?: string;
    userMessages?: Array<{
      role: string;
      content: string;
      parts?: any[];
    }>;
    assistantResponse?: string;
    toolCalls?: Array<{
      name: string;
      args: any;
      result: any;
    }>;
  };
  additionalData?: Record<string, any>;
}

export interface UsageTimeRange {
  lastMinute?: boolean;
  lastHour?: boolean;
  lastDay?: boolean;
  lastWeek?: boolean;
  lastMonth?: boolean;
  custom?: { start: number; end: number };
}

export interface UsageAnalyticsFilters {
  timeRange: UsageTimeRange;
  userId?: string;
  sessionId?: string;
}

export interface TokenUsageSummary {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  averageTokensPerRequest: number;
  peakTokenUsage: number;
  totalRequests: number;
  uniqueSessions: number;
}

export const pgUsageRepository = {
  async createUsageLog(data: ChatUsageLogCreate) {
    const [log] = await db
      .insert(ChatUsageLogSchema)
      .values({
        sessionId: data.sessionId,
        messageId: data.messageId,
        timestamp: new Date(data.timestamp),
        userId: data.userId,
        model: data.model,
        totalPromptTokens: data.totalPromptTokens,
        totalCompletionTokens: data.totalCompletionTokens,
        totalTokens: data.totalTokens,
        totalExecutionTime: data.totalExecutionTime,
        requestSize: data.requestSize,
        responseSize: data.responseSize,
        fullConversationContext: data.fullConversationContext as any,
      })
      .returning();

    return log;
  },

  async createUsageStep(data: ChatUsageStepCreate) {
    const [step] = await db
      .insert(ChatUsageStepSchema)
      .values({
        logId: data.logId,
        stepName: data.stepName,
        timestamp: new Date(data.timestamp),
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        systemPromptSize: data.systemPromptSize,
        messagesCount: data.messagesCount,
        toolsCount: data.toolsCount,
        mcpToolsCount: data.mcpToolsCount,
        workflowToolsCount: data.workflowToolsCount,
        appDefaultToolsCount: data.appDefaultToolsCount,
        toolCallResults: data.toolCallResults as any,
        promptSizeBreakdown: data.promptSizeBreakdown as any,
        actualContent: data.actualContent as any,
        additionalData: data.additionalData as any,
      })
      .returning();

    return step;
  },

  async createUsageLogWithSteps(
    logData: ChatUsageLogCreate,
    steps: Omit<ChatUsageStepCreate, "logId">[],
  ) {
    const log = await this.createUsageLog(logData);

    for (const step of steps) {
      await this.createUsageStep({ ...step, logId: log.id });
    }

    return log;
  },

  async getTokenUsageSummary(
    filters: UsageAnalyticsFilters,
  ): Promise<TokenUsageSummary> {
    let whereCondition: any = undefined;

    const now = new Date();

    if (filters.timeRange.lastMinute) {
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneMinuteAgo);
    } else if (filters.timeRange.lastHour) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneHourAgo);
    } else if (filters.timeRange.lastDay) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneDayAgo);
    } else if (filters.timeRange.lastWeek) {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneWeekAgo);
    } else if (filters.timeRange.lastMonth) {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneMonthAgo);
    } else if (filters.timeRange.custom) {
      const startDate = new Date(filters.timeRange.custom.start);
      const endDate = new Date(filters.timeRange.custom.end);
      whereCondition = and(
        gte(ChatUsageLogSchema.timestamp, startDate),
        sql`${ChatUsageLogSchema.timestamp} <= ${endDate}`,
      );
    }

    if (filters.userId) {
      whereCondition = whereCondition
        ? and(whereCondition, eq(ChatUsageLogSchema.userId, filters.userId))
        : eq(ChatUsageLogSchema.userId, filters.userId);
    }

    if (filters.sessionId) {
      whereCondition = whereCondition
        ? and(
            whereCondition,
            eq(ChatUsageLogSchema.sessionId, filters.sessionId),
          )
        : eq(ChatUsageLogSchema.sessionId, filters.sessionId);
    }

    const result = await db
      .select({
        totalTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        promptTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalPromptTokens})`.mapWith(
            Number,
          ),
        completionTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalCompletionTokens})`.mapWith(
            Number,
          ),
        peakTokenUsage:
          sql<number>`MAX(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        totalRequests: sql<number>`COUNT(*)`.mapWith(Number),
        uniqueSessions:
          sql<number>`COUNT(DISTINCT ${ChatUsageLogSchema.sessionId})`.mapWith(
            Number,
          ),
      })
      .from(ChatUsageLogSchema)
      .where(whereCondition);

    const [summary] = result;

    return {
      totalTokens: summary?.totalTokens || 0,
      promptTokens: summary?.promptTokens || 0,
      completionTokens: summary?.completionTokens || 0,
      averageTokensPerRequest: summary?.totalRequests
        ? Math.round(summary.totalTokens / summary.totalRequests)
        : 0,
      peakTokenUsage: summary?.peakTokenUsage || 0,
      totalRequests: summary?.totalRequests || 0,
      uniqueSessions: summary?.uniqueSessions || 0,
    };
  },

  async getSessionUsage(sessionId: string, limit = 100) {
    const logs = await db
      .select()
      .from(ChatUsageLogSchema)
      .leftJoin(
        ChatUsageStepSchema,
        eq(ChatUsageLogSchema.id, ChatUsageStepSchema.logId),
      )
      .where(eq(ChatUsageLogSchema.sessionId, sessionId))
      .orderBy(desc(ChatUsageLogSchema.timestamp))
      .limit(limit);

    return logs;
  },

  async getHighUsageSessions(limit = 10, minTokens = 10000) {
    const sessions = await db
      .select({
        sessionId: ChatUsageLogSchema.sessionId,
        userId: ChatUsageLogSchema.userId,
        totalTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        peakTokenUsage:
          sql<number>`MAX(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        messageCount: sql<number>`COUNT(*)`.mapWith(Number),
        lastActivity: sql<number>`MAX(${ChatUsageLogSchema.timestamp})`.mapWith(
          Number,
        ),
      })
      .from(ChatUsageLogSchema)
      .groupBy(ChatUsageLogSchema.sessionId, ChatUsageLogSchema.userId)
      .having(sql`SUM(${ChatUsageLogSchema.totalTokens}) >= ${minTokens}`)
      .orderBy(desc(sql`SUM(${ChatUsageLogSchema.totalTokens})`))
      .limit(limit);

    return sessions;
  },

  async getModelUsageSummary(filters: UsageAnalyticsFilters) {
    let whereCondition: any = undefined;

    const now = new Date();

    if (filters.timeRange.lastMinute) {
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneMinuteAgo);
    } else if (filters.timeRange.lastHour) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneHourAgo);
    } else if (filters.timeRange.lastDay) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneDayAgo);
    } else if (filters.timeRange.lastWeek) {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneWeekAgo);
    } else if (filters.timeRange.lastMonth) {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      whereCondition = gte(ChatUsageLogSchema.timestamp, oneMonthAgo);
    } else if (filters.timeRange.custom) {
      const endDate = new Date(filters.timeRange.custom.end);
      whereCondition = and(
        gte(
          ChatUsageLogSchema.timestamp,
          new Date(filters.timeRange.custom.start),
        ),
        lte(ChatUsageLogSchema.timestamp, endDate),
      );
    }

    if (filters.userId) {
      whereCondition = whereCondition
        ? and(whereCondition, eq(ChatUsageLogSchema.userId, filters.userId))
        : eq(ChatUsageLogSchema.userId, filters.userId);
    }

    if (filters.sessionId) {
      whereCondition = whereCondition
        ? and(
            whereCondition,
            eq(ChatUsageLogSchema.sessionId, filters.sessionId),
          )
        : eq(ChatUsageLogSchema.sessionId, filters.sessionId);
    }

    const result = await db
      .select({
        model: ChatUsageLogSchema.model,
        totalTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        promptTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalPromptTokens})`.mapWith(
            Number,
          ),
        completionTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalCompletionTokens})`.mapWith(
            Number,
          ),
        totalRequests: sql<number>`COUNT(*)`.mapWith(Number),
        uniqueSessions:
          sql<number>`COUNT(DISTINCT ${ChatUsageLogSchema.sessionId})`.mapWith(
            Number,
          ),
        averageTokensPerRequest:
          sql<number>`AVG(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        peakTokenUsage:
          sql<number>`MAX(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
      })
      .from(ChatUsageLogSchema)
      .where(whereCondition)
      .groupBy(ChatUsageLogSchema.model)
      .orderBy(desc(sql`SUM(${ChatUsageLogSchema.totalTokens})`));

    return result.map((row) => ({
      model: row.model,
      totalTokens: Number(row.totalTokens || 0),
      promptTokens: Number(row.promptTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      totalRequests: Number(row.totalRequests || 0),
      uniqueSessions: Number(row.uniqueSessions || 0),
      averageTokensPerRequest: Math.round(
        Number(row.averageTokensPerRequest || 0),
      ),
      peakTokenUsage: Number(row.peakTokenUsage || 0),
    }));
  },

  async getAvailableModelUsage() {
    const modelData = await db
      .select({
        model: ChatUsageLogSchema.model,
        totalTokens:
          sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(Number),
        totalRequests: sql<number>`COUNT(*)`.mapWith(Number),
        uniqueSessions:
          sql<number>`COUNT(DISTINCT ${ChatUsageLogSchema.sessionId})`.mapWith(
            Number,
          ),
        lastUsed: sql<Date>`MAX(${ChatUsageLogSchema.timestamp})`.mapWith(Date),
      })
      .from(ChatUsageLogSchema)
      .groupBy(ChatUsageLogSchema.model)
      .orderBy(desc(sql`SUM(${ChatUsageLogSchema.totalTokens})`));

    return modelData.map((row) => ({
      model: row.model,
      totalTokens: Number(row.totalTokens || 0),
      totalRequests: Number(row.totalRequests || 0),
      uniqueSessions: Number(row.uniqueSessions || 0),
      lastUsed: row.lastUsed,
    }));
  },

  async getHourlyUsage(hours = 24) {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const hourlyData = await db
      .select({
        hour: sql<string>`TO_CHAR(DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp}), 'YYYY-MM-DD HH24:MI:SS')`,
        tokens: sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(
          Number,
        ),
        requests: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ChatUsageLogSchema)
      .where(gte(ChatUsageLogSchema.timestamp, startTime))
      .groupBy(sql`DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp})`)
      .orderBy(sql`DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp}) ASC`);

    return hourlyData.map((row) => ({
      hour: row.hour,
      tokens: Number(row.tokens || 0),
      requests: Number(row.requests || 0),
    }));
  },

  async getAvailableHourlyData() {
    const hourlyData = await db
      .select({
        hour: sql<string>`TO_CHAR(DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp}), 'YYYY-MM-DD HH24:MI:SS')`,
        tokens: sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(
          Number,
        ),
        requests: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ChatUsageLogSchema)
      .groupBy(sql`DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp})`)
      .orderBy(sql`DATE_TRUNC('hour', ${ChatUsageLogSchema.timestamp}) DESC`)
      .limit(24);

    return hourlyData.reverse().map((row) => ({
      hour: row.hour,
      tokens: Number(row.tokens || 0),
      requests: Number(row.requests || 0),
    }));
  },

  async getMinuteUsage(minutes = 60) {
    const now = new Date();
    const startTime = new Date(now.getTime() - minutes * 60 * 1000);

    const minuteData = await db
      .select({
        minute: sql<string>`TO_CHAR(DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp}), 'YYYY-MM-DD HH24:MI:SS')`,
        tokens: sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(
          Number,
        ),
        requests: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ChatUsageLogSchema)
      .where(gte(ChatUsageLogSchema.timestamp, startTime))
      .groupBy(sql`DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp})`)
      .orderBy(sql`DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp}) ASC`);

    return minuteData.map((row) => ({
      minute: row.minute,
      tokens: Number(row.tokens || 0),
      requests: Number(row.requests || 0),
    }));
  },

  async getAvailableMinuteData() {
    const minuteData = await db
      .select({
        minute: sql<string>`TO_CHAR(DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp}), 'YYYY-MM-DD HH24:MI:SS')`,
        tokens: sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(
          Number,
        ),
        requests: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(ChatUsageLogSchema)
      .groupBy(sql`DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp})`)
      .orderBy(sql`DATE_TRUNC('minute', ${ChatUsageLogSchema.timestamp}) DESC`)
      .limit(60);

    return minuteData.reverse().map((row) => ({
      minute: row.minute,
      tokens: Number(row.tokens || 0),
      requests: Number(row.requests || 0),
    }));
  },

  async updateDailyStats() {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    yesterday.setHours(0, 0, 0, 0);

    const stats = await db
      .select({
        tokens: sql<number>`SUM(${ChatUsageLogSchema.totalTokens})`.mapWith(
          Number,
        ),
        requests: sql<number>`COUNT(*)`.mapWith(Number),
        sessions:
          sql<number>`COUNT(DISTINCT ${ChatUsageLogSchema.sessionId})`.mapWith(
            Number,
          ),
      })
      .from(ChatUsageLogSchema)
      .where(
        and(
          gte(ChatUsageLogSchema.timestamp, yesterday),
          sql`${ChatUsageLogSchema.timestamp} < ${new Date(yesterday.getTime() + 24 * 60 * 60 * 1000).toISOString()}`,
        ),
      );

    const [data] = stats;

    if (data) {
      await db
        .insert(DailyUsageStatsSchema)
        .values({
          date: yesterday,
          totalTokens: data.tokens,
          totalRequests: data.requests,
          uniqueSessions: data.sessions,
        })
        .onConflictDoUpdate({
          target: [DailyUsageStatsSchema.date],
          set: {
            totalTokens: data.tokens,
            totalRequests: data.requests,
            uniqueSessions: data.sessions,
          },
        });
    }
  },
};
