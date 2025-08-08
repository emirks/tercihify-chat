"use client";

import { Button } from "ui/button";
import { GithubIcon } from "ui/github-icon";
import { TwitterIcon } from "ui/twitter-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

export function AppSidebarSocial() {
  return (
    <div className="flex items-center justify-center gap-1 px-2 py-1 border-b border-sidebar-border/50">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              window.open("https://x.com/emirkisa", "_blank");
            }}
          >
            <TwitterIcon className="size-4 text-foreground" />
            <span className="sr-only">Follow on Twitter</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Follow on Twitter</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              window.open(
                "https://github.com/saidsurucu/yokatlas-mcp",
                "_blank",
              );
            }}
          >
            <GithubIcon className="size-4 fill-foreground" />
            <span className="sr-only">YOK Atlas MCP</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>YOK Atlas MCP</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
