"use client";

import { Button } from "ui/button";
import { GithubIcon } from "ui/github-icon";
import { TwitterIcon } from "ui/twitter-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

export function AppSidebarSocial() {
  return (
    <div className="px-3 py-2 border-b border-sidebar-border/50 space-y-1">
      {/* First line: Developer info */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Geliştirici: Emir Kısa
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                window.open("https://x.com/emirkisa", "_blank");
              }}
            >
              <TwitterIcon className="size-3 text-foreground" />
              <span className="sr-only">Follow on Twitter</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Follow on Twitter</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Second line: MCP source */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">MCP Kaynak Kodu</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {
                window.open(
                  "https://github.com/saidsurucu/yokatlas-mcp",
                  "_blank",
                );
              }}
            >
              <GithubIcon className="size-3 fill-foreground" />
              <span className="sr-only">YOK Atlas MCP</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>YOK Atlas MCP Kaynak Kodu</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
