// Types for Mono's Connect widget (the package ships without them).
declare module "@mono.co/connect.js" {
  interface ConnectOptions {
    key: string;
    scope?: "auth" | "payments";
    data?: Record<string, unknown>;
    reference?: string;
    onSuccess: (data: { code: string }) => void;
    onClose?: () => void;
    onLoad?: () => void;
    onEvent?: (event: string, data: unknown) => void;
  }
  export default class Connect {
    constructor(options: ConnectOptions);
    setup(config?: Record<string, unknown>): void;
    open(): void;
    close(): void;
    reauthorise(accountId: string): void;
  }
}
