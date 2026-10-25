import React from "react";
import ReactDOM from "react-dom/client";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";

// Native Android HTTP Bridge interceptor for YouTube and streaming requests
if (typeof window !== "undefined" && (window as any).linerAndroidBridge) {
  const bridge = (window as any).linerAndroidBridge;
  const originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (
      url.includes("youtube.com") ||
      url.includes("googlevideo.com") ||
      url.includes("googleusercontent.com") ||
      url.includes("ggpht.com")
    ) {
      const method = (
        init?.method ||
        (typeof input === "object" && "method" in input
          ? (input as Request).method
          : "GET")
      ).toUpperCase();

      const headersObj: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            headersObj[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => {
            headersObj[k] = v;
          });
        } else {
          Object.assign(headersObj, init.headers);
        }
      }

      let bodyStr: string | null = null;
      if (init?.body) {
        bodyStr =
          typeof init.body === "string" ? init.body : String(init.body);
      }

      try {
        let respText: string;
        if (method === "POST") {
          respText = bridge.post(
            url,
            JSON.stringify(headersObj),
            bodyStr || "{}",
          );
        } else {
          respText = bridge.get(url, JSON.stringify(headersObj));
        }

        return new Response(respText, {
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          }),
        });
      } catch (err) {
        console.warn("[AndroidFetch] Bridge call failed for " + url, err);
      }
    }

    return originalFetch(input, init);
  };
}

initGlobalErrorHandlers();

const isOverlay = window.location.hash.startsWith("#/overlay");

async function loadRoot(): Promise<React.ReactElement> {
  if (isOverlay) {
    const { default: OverlayApp } = await import("./app/OverlayApp");
    return <OverlayApp />;
  }
  const [
    { initMainWindowServices },
    { default: App },
    { default: RootErrorBoundary },
  ] = await Promise.all([
    import("./app/mainWindowServices"),
    import("./app/App"),
    import("@/shared/ui/RootErrorBoundary"),
  ]);
  initMainWindowServices();
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  void loadRoot().then((root) => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>{root}</React.StrictMode>,
    );
  });
}
