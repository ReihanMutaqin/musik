"use client";

import type { Peer, DataConnection } from "peerjs";

export type P2PMessage =
  | {
      type: "stats";
      uid: string;
      liveScore: number;
      liveCombo: number;
      finished?: boolean;
      finalAccuracy?: number;
    }
  | {
      type: "pause";
      pausedBy: string;
      pausedAt: number;
    }
  | {
      type: "resume";
      resumeCountdownUntil: number;
      pausedAt: number;
    }
  | {
      type: "ping";
      sendTime: number;
    }
  | {
      type: "pong";
      sendTime: number;
      receiveTime: number;
    };

export type P2PMessageHandler = (msg: P2PMessage, senderUid: string) => void;

class P2PManager {
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private messageHandlers: Set<P2PMessageHandler> = new Set();
  private currentRoomCode: string | null = null;
  private currentUid: string | null = null;
  private isConnecting = false;

  private sanitizeId(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private getPeerId(roomCode: string, uid: string): string {
    return `riff_${this.sanitizeId(roomCode)}_${this.sanitizeId(uid)}`;
  }

  /**
   * Initializes the WebRTC Peer instance for the user in the specified room
   */
  async init(
    roomCode: string,
    uid: string,
    onMessage?: P2PMessageHandler
  ): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (this.peer && this.currentRoomCode === roomCode && this.currentUid === uid) {
      if (onMessage) this.messageHandlers.add(onMessage);
      return true;
    }

    this.destroy();

    this.currentRoomCode = roomCode;
    this.currentUid = uid;
    if (onMessage) this.messageHandlers.add(onMessage);

    const myPeerId = this.getPeerId(roomCode, uid);

    try {
      const { Peer: PeerConstructor } = await import("peerjs");

      this.peer = new PeerConstructor(myPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
      });

      this.peer.on("open", (id) => {
        console.log(`[WebRTC P2P] Connected to signaling server with Peer ID: ${id}`);
      });

      this.peer.on("connection", (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on("error", (err) => {
        // ID taken or signaling warning - gracefully log
        console.warn("[WebRTC P2P] Peer warning:", err.type, err.message);
      });

      return true;
    } catch (err) {
      console.error("[WebRTC P2P] Failed to load or initialize PeerJS:", err);
      return false;
    }
  }

  /**
   * Connects to other players in the room via direct WebRTC DataChannel
   */
  connectToPeers(otherUids: string[]) {
    if (!this.peer || !this.currentRoomCode || !this.currentUid) return;

    otherUids.forEach((otherUid) => {
      if (otherUid === this.currentUid) return;
      const targetPeerId = this.getPeerId(this.currentRoomCode!, otherUid);

      // Avoid duplicate active connection
      const existing = this.connections.get(otherUid);
      if (existing && existing.open) return;

      try {
        const conn = this.peer!.connect(targetPeerId, {
          reliable: true,
          serialization: "json",
        });
        this.setupConnection(conn, otherUid);
      } catch (err) {
        console.warn(`[WebRTC P2P] Error connecting to peer ${targetPeerId}:`, err);
      }
    });
  }

  private setupConnection(conn: DataConnection, targetUid?: string) {
    conn.on("open", () => {
      const peerUid = targetUid || this.extractUidFromPeerId(conn.peer);
      if (peerUid) {
        this.connections.set(peerUid, conn);
        console.log(`[WebRTC P2P] Direct DataChannel OPEN with player ${peerUid} 🚀 (0ms server cost)`);
      }
    });

    conn.on("data", (data) => {
      try {
        const msg = data as P2PMessage;
        const senderUid = targetUid || this.extractUidFromPeerId(conn.peer) || "";
        this.messageHandlers.forEach((handler) => handler(msg, senderUid));
      } catch (err) {
        console.error("[WebRTC P2P] Error processing incoming P2P message:", err);
      }
    });

    conn.on("close", () => {
      const peerUid = targetUid || this.extractUidFromPeerId(conn.peer);
      if (peerUid) {
        this.connections.delete(peerUid);
        console.log(`[WebRTC P2P] DataChannel closed with ${peerUid}`);
      }
    });

    conn.on("error", (err) => {
      console.warn(`[WebRTC P2P] Connection error on ${conn.peer}:`, err);
    });
  }

  private extractUidFromPeerId(peerId: string): string | null {
    const parts = peerId.split("_");
    return parts.length >= 3 ? parts.slice(2).join("_") : null;
  }

  /**
   * Broadcasts a message to all connected peers in the room
   */
  broadcast(msg: P2PMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch (err) {
          console.warn("[WebRTC P2P] Send failed:", err);
        }
      }
    });
  }

  /**
   * Checks if any direct P2P connections are currently open
   */
  hasActiveConnections(): boolean {
    let active = false;
    this.connections.forEach((conn) => {
      if (conn.open) active = true;
    });
    return active;
  }

  /**
   * Subscribes to incoming P2P messages
   */
  onMessage(handler: P2PMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Clean up and close all P2P connections
   */
  destroy() {
    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.connections.clear();
    this.messageHandlers.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.currentRoomCode = null;
    this.currentUid = null;
  }
}

export const p2p = new P2PManager();
