"use client";
import { appStore } from "@/app/store";
import useSWR, { SWRConfiguration } from "swr";
import { handleErrorWithToast } from "ui/shared-toast";
import { fetcher } from "lib/utils";

export function useMcpList(options?: SWRConfiguration) {
  return useSWR("/api/mcp/list", fetcher, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
    focusThrottleInterval: 1000 * 60 * 5,
    fallbackData: [],
    onError: handleErrorWithToast,
    onSuccess: (data) => {
      appStore.setState({ mcpList: data });

      // Auto-enable yokatlas MCP tools by default
      const yokatlasServer = data.find(
        (server: any) => server.name === "yokatlas-mcp",
      );
      if (yokatlasServer) {
        const currentState = appStore.getState();
        const yokatlasTools =
          yokatlasServer.toolInfo?.map((tool: any) => tool.name) || [];

        // Only enable if not already configured
        if (
          !currentState.allowedMcpServers?.[yokatlasServer.id]?.tools?.length
        ) {
          appStore.setState({
            allowedMcpServers: {
              ...currentState.allowedMcpServers,
              [yokatlasServer.id]: {
                ...(currentState.allowedMcpServers?.[yokatlasServer.id] ?? {}),
                tools: yokatlasTools,
              },
            },
          });
        }
      }
    },
    ...options,
  });
}
