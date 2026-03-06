"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureUiError } from "@/lib/errorTracker";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unexpected application error.",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary] Unhandled UI error", error, errorInfo);
    captureUiError(error, {
      componentStack: errorInfo.componentStack || null,
      surface: "AppErrorBoundary",
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="border border-red-200 bg-red-50 rounded-xl px-5 py-4">
        <p className="text-[14px] font-semibold text-red-800">Something went wrong</p>
        <p className="text-[12px] text-red-700 mt-1">
          {this.state.message || "An unexpected error occurred while rendering this page."}
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={this.handleReload}
            className="h-9 px-3 rounded-lg bg-red-700 text-white text-[12px] font-medium hover:bg-red-800"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
