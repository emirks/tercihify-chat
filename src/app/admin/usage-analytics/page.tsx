"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Skeleton } from "ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Activity,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Database,
  Users,
  FileText,
} from "lucide-react";

interface TokenUsageSummary {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

interface HighUsageSession {
  sessionId: string;
  userId: string;
  totalTokens: number;
  lastActivity: string;
}

interface HourlyUsage {
  hour: string;
  tokens: number;
}

interface MinuteUsage {
  minute: string;
  tokens: number;
  requests: number;
}

interface ModelUsage {
  model: string;
  totalTokens: number;
  totalRequests: number;
  uniqueSessions: number;
  lastUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  averageTokensPerRequest?: number;
  peakTokenUsage?: number;
}

interface DashboardData {
  lastMinuteUsage: TokenUsageSummary;
  lastHourUsage: TokenUsageSummary;
  lastWeekUsage: TokenUsageSummary;
  highUsageSessions: HighUsageSession[];
  hourlyUsage: HourlyUsage[];
  minuteUsage: MinuteUsage[];
  modelUsage: ModelUsage[];
}

const _COLORS = ["#3b82f6", "#8b5cf6", "#10b981"];

export default function UsageAnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [_lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const response = await fetch(
        "/api/admin/usage-analytics?action=dashboard",
      );
      const result = await response.json();

      setData(result.data);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to fetch usage data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const _pieData = data
    ? [
        { name: "Prompt Tokens", value: data.lastHourUsage.promptTokens },
        {
          name: "Completion Tokens",
          value: data.lastHourUsage.completionTokens,
        },
        {
          name: "System Tokens",
          value: Math.max(
            0,
            data.lastHourUsage.totalTokens -
              data.lastHourUsage.promptTokens -
              data.lastHourUsage.completionTokens,
          ),
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load usage analytics data. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
          <p className="text-muted-foreground">
            Monitor your chat usage and token consumption
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Minute</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.lastMinuteUsage.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">tokens used</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Hour</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.lastHourUsage.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">tokens used</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.lastWeekUsage.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">tokens used</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              High Usage Sessions
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.highUsageSessions.length}
            </div>
            <p className="text-xs text-muted-foreground">active sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Last Hour Per-Minute Usage</CardTitle>
            <CardDescription>
              Token usage by minute over the last hour
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.minuteUsage && data.minuteUsage.length > 0 ? (
              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  Showing {data.minuteUsage.length} minute(s) of data
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.minuteUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="minute"
                      tickFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          });
                        } catch {
                          return value;
                        }
                      }}
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(value) => value.toLocaleString()}
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                      labelStyle={{
                        color: "#f9fafb",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                      itemStyle={{
                        color: "#d1d5db",
                      }}
                      labelFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleString();
                        } catch {
                          return value;
                        }
                      }}
                      formatter={(value) => [value.toLocaleString(), "Tokens"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="tokens"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: "#3b82f6", strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 6, stroke: "#3b82f6", strokeWidth: 2 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No usage data in the last hour
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hourly Usage Trend</CardTitle>
            <CardDescription>Token usage over available hours</CardDescription>
          </CardHeader>
          <CardContent>
            {data.hourlyUsage && data.hourlyUsage.length > 0 ? (
              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  Showing {data.hourlyUsage.length} hour(s) of available data
                  {data.hourlyUsage.length > 0 &&
                    ` from ${new Date(data.hourlyUsage[0].hour).toLocaleString()} to ${new Date(data.hourlyUsage[data.hourlyUsage.length - 1].hour).toLocaleString()}`}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.hourlyUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleTimeString("en-US", {
                            hour: "numeric",
                          });
                        } catch {
                          return value;
                        }
                      }}
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(value) => value.toLocaleString()}
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                      labelStyle={{
                        color: "#f9fafb",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                      itemStyle={{
                        color: "#d1d5db",
                      }}
                      labelFormatter={(value) => {
                        try {
                          return new Date(value).toLocaleString();
                        } catch {
                          return value;
                        }
                      }}
                      formatter={(value) => [value.toLocaleString(), "Tokens"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="tokens"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: "#3b82f6", strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 6, stroke: "#3b82f6", strokeWidth: 2 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No usage data available yet. Start using the chat to see
                analytics.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token Breakdown</CardTitle>
            <CardDescription>Last hour token distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    {
                      name: "Prompt",
                      value: data.lastHourUsage.promptTokens || 0,
                      fill: "#3b82f6",
                    },
                    {
                      name: "Completion",
                      value: data.lastHourUsage.completionTokens || 0,
                      fill: "#8b5cf6",
                    },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  dataKey="value"
                ></Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                  formatter={(value) => [value.toLocaleString(), "Tokens"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Model Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Model Usage</CardTitle>
          <CardDescription>Token usage by AI model</CardDescription>
        </CardHeader>
        <CardContent>
          {data.modelUsage && data.modelUsage.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.modelUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="model"
                    stroke="#6b7280"
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tickFormatter={(value) => value.toLocaleString()}
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    labelStyle={{
                      color: "#f9fafb",
                      fontWeight: "bold",
                      marginBottom: "4px",
                    }}
                    itemStyle={{
                      color: "#d1d5db",
                    }}
                    formatter={(value, name) => [
                      value.toLocaleString(),
                      name === "totalTokens" ? "Total Tokens" : name,
                    ]}
                  />
                  <Bar
                    dataKey="totalTokens"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Total Tokens</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Avg/Request</TableHead>
                    <TableHead>Peak</TableHead>
                    <TableHead>Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.modelUsage.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium">
                        {model.model}
                      </TableCell>
                      <TableCell>
                        {model.totalTokens.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {model.totalRequests.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {model.uniqueSessions.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {model.averageTokensPerRequest?.toLocaleString() ||
                          "N/A"}
                      </TableCell>
                      <TableCell>
                        {model.peakTokenUsage?.toLocaleString() || "N/A"}
                      </TableCell>
                      <TableCell>
                        {new Date(model.lastUsed).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No model usage data available yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* High Usage Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>High Usage Sessions</CardTitle>
          <CardDescription>
            Sessions with token usage above 10,000 tokens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Total Tokens</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.highUsageSessions.length > 0 ? (
                data.highUsageSessions.map((session) => (
                  <TableRow key={session.sessionId}>
                    <TableCell className="font-mono text-sm">
                      {session.sessionId.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {session.userId.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {session.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {new Date(session.lastActivity).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">High Usage</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No high usage sessions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Rate Limit Warning</AlertTitle>
          <AlertDescription>
            Sessions exceeding 50k tokens may trigger rate limits. Consider
            using more efficient models.
          </AlertDescription>
        </Alert>

        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>Optimization Tips</AlertTitle>
          <AlertDescription>
            Use conversation summarization and prefer efficient models like
            Gemini Flash for large contexts.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
