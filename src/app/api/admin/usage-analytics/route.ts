import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import { ChatUsageLogger } from "@/lib/logging/chat-usage-logger";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // Consolidated dashboard data endpoint
    if (action === "dashboard") {
      const [
        lastMinuteUsage,
        lastHourUsage,
        lastWeekUsage,
        highUsageSessions,
        hourlyUsage,
        minuteUsage,
        modelUsage,
      ] = await Promise.all([
        ChatUsageLogger.getTokenUsageSummary({
          timeRange: { lastMinute: true },
        }),
        ChatUsageLogger.getTokenUsageSummary({
          timeRange: { lastHour: true },
        }),
        ChatUsageLogger.getTokenUsageSummary({
          timeRange: { lastWeek: true },
        }),
        ChatUsageLogger.getHighUsageSessions(20),
        ChatUsageLogger.getAvailableHourlyData(),
        ChatUsageLogger.getAvailableMinuteData(),
        ChatUsageLogger.getAvailableModelUsage(),
      ]);

      return Response.json({
        success: true,
        data: {
          lastMinuteUsage,
          lastHourUsage,
          lastWeekUsage,
          highUsageSessions,
          hourlyUsage,
          minuteUsage,
          modelUsage,
        },
      });
    }

    // Backward compatibility for individual endpoints
    if (action) {
      const sessionId = searchParams.get("sessionId");
      const limit = parseInt(searchParams.get("limit") || "10");
      const timeRange = searchParams.get("timeRange") || "lastDay";

      switch (action) {
        case "high-usage":
          const highUsageSessions =
            await ChatUsageLogger.getHighUsageSessions(limit);
          return Response.json({
            success: true,
            data: highUsageSessions,
            totalSessions: highUsageSessions.length,
          });

        case "session-details":
          if (!sessionId) {
            return new Response("Session ID required", { status: 400 });
          }
          const sessionDetails =
            await ChatUsageLogger.getSessionAnalytics(sessionId);
          return Response.json({
            success: true,
            data: sessionDetails,
          });

        case "token-usage":
          const filters = {
            timeRange: {
              [timeRange]: true,
            },
          };
          const tokenUsage =
            await ChatUsageLogger.getTokenUsageSummary(filters);
          return Response.json({
            success: true,
            data: tokenUsage,
          });

        case "hourly-usage":
          const hours = parseInt(searchParams.get("hours") || "24");
          const hourlyUsage = await ChatUsageLogger.getHourlyUsage(hours);
          return Response.json({
            success: true,
            data: hourlyUsage,
          });

        default:
          return new Response("Invalid action", { status: 400 });
      }
    }

    // Default: Redirect to the new shadcn/ui dashboard page
    return Response.redirect(
      new URL("/admin/usage-analytics", request.url),
      302,
    );
  } catch (error) {
    console.error("Usage analytics UI error:", error);
    return new Response("Error generating analytics page", { status: 500 });
  }
}
