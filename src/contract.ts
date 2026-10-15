// Stub of the container's contract (ADR-006 F4), the same one the other portals read. The portal never creates a
// client or a session of its own (norm 5.4.1).
export interface ApiClient {
  request<T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal }): Promise<T>;
}

export interface Session {
  roles: string[];
  open(answer: unknown, identifier?: string): void;
  close(): void;
}

// The container has one remote and two areas of the side menu (spec 005 G-3): Salidas and Operación.
export type Area = 'departures' | 'operation';

export interface MountProps {
  identifier?: string;
  area?: Area;
  // SPA navigation owned by the container.
  navigate?: (path: string) => void;
  apiClient: ApiClient;
  session: Session;
}
