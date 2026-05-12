type MessageType = 'heartbeat' | 'elect' | 'leader' | 'resign';

export interface CoordinatorMessage {
  type: MessageType;
  tabId: string;
  timestamp: number;
}

export type LeaderChangeCallback = (isLeader: boolean) => void;

export class TabCoordinator {
  private channel: BroadcastChannel;
  private _tabId: string;
  private _isLeader = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private electionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private listeners: LeaderChangeCallback[] = [];

  /** Unique ID for this tab */
  get tabId(): string { return this._tabId; }

  /** Whether this tab is currently the leader */
  get isLeader(): boolean { return this._isLeader; }

  constructor() {
    this._tabId = crypto.randomUUID();
    this.channel = new BroadcastChannel('cdss-tab-coordinator');
    this.channel.onmessage = (event) => this.handleMessage(event.data as CoordinatorMessage);
  }

  /** Start the coordinator — begins leader election */
  start(): void {
    this.startElection();

    // Register beforeunload to resign leadership
    window.addEventListener('beforeunload', this.handleUnload);
  }

  /** Stop the coordinator — resign leadership and clean up */
  stop(): void {
    if (this._isLeader) {
      this.broadcast('resign');
    }
    this.clearTimers();
    this.setLeader(false);
    window.removeEventListener('beforeunload', this.handleUnload);
    this.channel.close();
  }

  /** Register a callback for leader changes */
  onLeaderChange(callback: LeaderChangeCallback): () => void {
    this.listeners.push(callback);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private handleMessage(msg: CoordinatorMessage): void {
    if (msg.tabId === this._tabId) return; // ignore own messages

    switch (msg.type) {
      case 'elect':
        // Another tab is calling election. If we're leader, assert leadership
        if (this._isLeader) {
          this.broadcast('leader');
        }
        break;

      case 'leader':
        // Another tab claimed leadership
        this.lastHeartbeat = Date.now();
        if (this.electionTimer) {
          clearTimeout(this.electionTimer);
          this.electionTimer = null;
        }
        if (this._isLeader) {
          // We were leader but someone else claimed it — step down
          this.setLeader(false);
          this.stopHeartbeat();
          this.startWatchdog();
        } else {
          // We're a follower, start/reset watchdog
          this.startWatchdog();
        }
        break;

      case 'heartbeat':
        // Leader is alive
        this.lastHeartbeat = Date.now();
        break;

      case 'resign':
        // Leader resigned, start new election
        this.startElection();
        break;
    }
  }

  private startElection(): void {
    this.broadcast('elect');

    // Wait 1 second for leader responses
    if (this.electionTimer) clearTimeout(this.electionTimer);
    this.electionTimer = setTimeout(() => {
      this.electionTimer = null;
      // No leader responded — claim leadership
      this.claimLeadership();
    }, 1000);
  }

  private claimLeadership(): void {
    this.setLeader(true);
    this.broadcast('leader');
    this.startHeartbeat();
    this.stopWatchdog();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Leader sends heartbeat every 5 seconds
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('heartbeat');
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.lastHeartbeat = Date.now();
    // Followers check leader heartbeat every 5 seconds
    // If no heartbeat for 10 seconds, start new election
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat > 10000) {
        this.stopWatchdog();
        this.startElection();
      }
    }, 5000);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    this.stopWatchdog();
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
      this.electionTimer = null;
    }
  }

  private setLeader(value: boolean): void {
    if (this._isLeader !== value) {
      this._isLeader = value;
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  private broadcast(type: MessageType): void {
    const msg: CoordinatorMessage = {
      type,
      tabId: this._tabId,
      timestamp: Date.now(),
    };
    this.channel.postMessage(msg);
  }

  private handleUnload = (): void => {
    if (this._isLeader) {
      this.broadcast('resign');
    }
  };
}

// Singleton — only create if in browser
export const tabCoordinator = typeof window !== 'undefined'
  ? new TabCoordinator()
  : (null as unknown as TabCoordinator);
