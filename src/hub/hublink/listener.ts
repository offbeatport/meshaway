/** Accept bridge connections. MVP: bridges push via HTTP POST. */
export interface HubLinkListener {
  registerBridge(bridgeId: string, url: string): void;
  unregisterBridge(bridgeId: string): void;
}
