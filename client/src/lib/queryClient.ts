import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.json().catch(() => null);
      const message = json?.message || res.statusText;
      throw new Error(`${res.status}: ${message}`);
    }
    const text = (await res.text()) || res.statusText;
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error(`${res.status}: Server returned an unexpected response. Please try again.`);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function safeJsonParse(res: Response): Promise<any> {
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {};
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error("Server returned an unexpected response. Please try again.");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Server returned a non-JSON response. Please try again.");
    }
  }
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 seconds - prevents stale data while reducing unnecessary refetches
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
