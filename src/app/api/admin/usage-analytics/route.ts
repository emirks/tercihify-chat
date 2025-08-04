import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import { ChatUsageLogger } from "lib/logging/chat-usage-logger";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "high-usage";
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "10");

    switch (action) {
      case "high-usage":
        const highUsageSessions = await ChatUsageLogger.getHighUsageSessions(
          "logs/chat-usage",
          limit,
        );
        return Response.json({
          success: true,
          data: highUsageSessions,
          totalSessions: highUsageSessions.length,
        });

      case "session-details":
        if (!sessionId) {
          return new Response("Session ID required", { status: 400 });
        }
        const sessionDetails = await ChatUsageLogger.getSessionAnalytics(
          sessionId,
          "logs/chat-usage",
        );
        return Response.json({
          success: true,
          data: sessionDetails,
        });

      case "session-mapping":
        const mapping =
          await ChatUsageLogger.getSessionMapping("logs/chat-usage");
        return Response.json({
          success: true,
          data: Object.fromEntries(mapping),
          totalMappings: mapping.size,
        });

      default:
        return new Response("Invalid action", { status: 400 });
    }
  } catch (error) {
    console.error("Usage analytics error:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to fetch usage analytics",
      },
      { status: 500 },
    );
  }
}

// Simple HTML interface for viewing analytics
export async function POST(_request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const highUsageSessions = await ChatUsageLogger.getHighUsageSessions(
      "logs/chat-usage",
      20,
    );

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chat Usage Analytics</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .session { border: 1px solid #ccc; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .high-usage { background-color: #ffe6e6; border-color: #ff9999; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .metric { display: inline-block; margin: 5px 10px; padding: 5px; background: #f0f0f0; border-radius: 3px; }
        .tool-stats { margin-top: 10px; font-size: 0.9em; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 20px; }
        .summary { background: #e6f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>Chat Usage Analytics - Rate Limit Investigation</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <div class="metric">Total Sessions: ${highUsageSessions.length}</div>
        <div class="metric">Peak Usage: ${highUsageSessions[0]?.peakTokenUsage || 0} tokens</div>
        <div class="metric">Avg Tokens: ${
          highUsageSessions.length > 0
            ? Math.round(
                highUsageSessions.reduce((sum, s) => sum + s.totalTokens, 0) /
                  highUsageSessions.length,
              )
            : 0
        }</div>
      </div>

      <h2>High Usage Sessions (Potential Rate Limit Triggers)</h2>
      
      ${highUsageSessions
        .map(
          (session) => `
        <div class="session ${session.peakTokenUsage > 50000 ? "high-usage" : session.peakTokenUsage > 20000 ? "warning" : ""}">
          <h3>Session ${session.sessionId}</h3>
          <div class="metric">Total Messages: ${session.totalMessages}</div>
          <div class="metric">Total Tokens: ${session.totalTokens.toLocaleString()}</div>
          <div class="metric">Peak Usage: ${session.peakTokenUsage.toLocaleString()}</div>
          <div class="metric">Avg per Message: ${Math.round(session.averageTokensPerMessage)}</div>
          
          <div class="tool-stats">
            <strong>Most Used Tools:</strong>
            ${Object.entries(session.mostUsedTools || {})
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .slice(0, 5)
              .map(
                ([tool, count]) =>
                  `<span class="metric">${tool}: ${count}x</span>`,
              )
              .join("")}
          </div>
          
          <div style="margin-top: 10px;">
            <strong>Recent Messages:</strong>
            ${(session.messages || [])
              .slice(-3)
              .map(
                (msg) => `
              <div style="margin: 5px 0; padding: 5px; background: #f9f9f9; border-radius: 3px;">
                Message ${msg.messageId}: ${msg.totalTokens} tokens (${msg.stepCount} steps)
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `,
        )
        .join("")}

      <div style="margin-top: 30px; padding: 15px; background: #f0f0f0; border-radius: 5px;">
        <h3>Rate Limit Investigation Tips:</h3>
        <ul>
          <li><strong>High Usage Sessions (Red):</strong> >50k tokens - likely causing rate limits</li>
          <li><strong>Warning Sessions (Yellow):</strong> >20k tokens - approaching limits</li>
          <li><strong>Check Tool Usage:</strong> MCP tools returning large datasets are often the culprit</li>
          <li><strong>Monitor Peak Usage:</strong> Single messages with >10k tokens indicate prompt bloat</li>
        </ul>
      </div>
      
      <div style="margin-top: 20px; text-align: center;">
        <p><em>Last updated: ${new Date().toLocaleString()}</em></p>
      </div>
    </body>
    </html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Usage analytics HTML error:", error);
    return new Response("Error generating analytics page", { status: 500 });
  }
}
