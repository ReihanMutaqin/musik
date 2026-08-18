"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, type UserProfile } from "@/lib/firebase/auth";
import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  subscribeToFriends,
  subscribeToIncomingFriendRequests,
  subscribeToOutgoingFriendRequests,
  type FriendRecord,
  type FriendRequest,
} from "@/lib/firebase/friends";

type FriendsModalProps = {
  onClose: () => void;
  onInviteToMultiplayer?: (friend: FriendRecord) => void;
};

export function FriendsModal({ onClose, onInviteToMultiplayer }: FriendsModalProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<"friends" | "requests" | "search">("friends");

  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Status message / toast
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Subscribe to friends & requests
  useEffect(() => {
    if (!user) return;

    const unsubFriends = subscribeToFriends(user.uid, (list) => {
      setFriends(list);
    });

    const unsubIncoming = subscribeToIncomingFriendRequests(user.uid, (list) => {
      setIncomingRequests(list);
    });

    const unsubOutgoing = subscribeToOutgoingFriendRequests(user.uid, (list) => {
      setOutgoingRequests(list);
    });

    return () => {
      unsubFriends();
      unsubIncoming();
      unsubOutgoing();
    };
  }, [user]);

  // Handle player search with debounce
  useEffect(() => {
    const clean = searchQuery.trim();
    if (!clean || !user) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(async () => {
      const results = await searchUsers(clean, user.uid);
      setSearchResults(results);
      setSearching(false);
    }, 350);

    return () => clearTimeout(timeout);
  }, [searchQuery, user]);

  // Friend sets for fast lookup
  const friendUids = useMemo(() => new Set(friends.map((f) => f.uid)), [friends]);
  const outgoingUids = useMemo(() => new Set(outgoingRequests.map((r) => r.toUid)), [outgoingRequests]);
  const incomingMap = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    incomingRequests.forEach((r) => map.set(r.fromUid, r));
    return map;
  }, [incomingRequests]);

  // Send request action
  const handleSendRequest = async (target: UserProfile) => {
    if (!profile) return;
    setActionLoadingId(target.uid);
    const res = await sendFriendRequest(profile, target);
    setActionLoadingId(null);

    if (res.success) {
      showToast(`Permintaan pertemanan terkirim ke @${target.username || target.displayName}!`);
    } else {
      showToast(res.error || "Gagal mengirim permintaan.", "error");
    }
  };

  // Accept request action
  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!profile) return;
    setActionLoadingId(request.id);
    const res = await acceptFriendRequest(request, profile);
    setActionLoadingId(null);

    if (res.success) {
      showToast(`Sekarang berteman dengan @${request.fromUsername}!`);
    } else {
      showToast(res.error || "Gagal menerima permintaan.", "error");
    }
  };

  // Decline request action
  const handleDeclineRequest = async (requestId: string) => {
    setActionLoadingId(requestId);
    await declineFriendRequest(requestId);
    setActionLoadingId(null);
    showToast("Permintaan pertemanan ditolak.");
  };

  // Cancel outgoing request action
  const handleCancelOutgoing = async (requestId: string) => {
    setActionLoadingId(requestId);
    await cancelFriendRequest(requestId);
    setActionLoadingId(null);
    showToast("Permintaan pertemanan dibatalkan.");
  };

  // Remove friend action
  const handleRemoveFriend = async (friendUid: string, friendName: string) => {
    if (!user) return;
    if (confirm(`Yakin ingin menghapus ${friendName} dari daftar teman?`)) {
      setActionLoadingId(friendUid);
      await removeFriend(user.uid, friendUid);
      setActionLoadingId(null);
      showToast(`${friendName} dihapus dari daftar teman.`);
    }
  };

  if (!user) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="friends-modal professional-theme" onClick={(e) => e.stopPropagation()}>
        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div className={`friends-toast ${toastMessage.type}`}>
            <span>{toastMessage.type === "success" ? "✓" : "⚠️"}</span>
            <small>{toastMessage.text}</small>
          </div>
        )}

        {/* MODAL HEADER */}
        <header className="friends-header">
          <div className="friends-header-copy">
            <div className="lb-header-top-row">
              <span className="lb-pro-badge">SOCIAL & FRIENDS HUB</span>
              <span className="lb-live-indicator">LIVE SYNC</span>
            </div>
            <h2>Daftar Teman & Komunitas</h2>
            <p>Terhubung dengan sesama pemain, pantau skor mereka, dan ajak bertanding duel</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {/* NAVIGATION TABS */}
        <div className="friends-primary-tabs">
          <button
            type="button"
            className={`friends-tab-btn ${tab === "friends" ? "active" : ""}`}
            onClick={() => setTab("friends")}
          >
            <span>Daftar Teman</span>
            {friends.length > 0 && <span className="tab-counter">{friends.length}</span>}
          </button>
          <button
            type="button"
            className={`friends-tab-btn ${tab === "requests" ? "active" : ""}`}
            onClick={() => setTab("requests")}
          >
            <span>Permintaan</span>
            {incomingRequests.length > 0 && (
              <span className="tab-counter alert">{incomingRequests.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`friends-tab-btn ${tab === "search" ? "active" : ""}`}
            onClick={() => setTab("search")}
          >
            <span>Cari Pemain</span>
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="friends-body">
          {/* =========================================================================
              TAB 1: DAFTAR TEMAN (FRIENDS LIST)
             ========================================================================= */}
          {tab === "friends" && (
            <div className="friends-list-view">
              {friends.length > 0 ? (
                <div className="friends-grid">
                  {friends.map((friend) => (
                    <article key={friend.uid} className="friend-card">
                      <div className="friend-card-left">
                        {friend.photoURL && friend.photoURL.length > 5 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={friend.photoURL} alt={friend.displayName} className="friend-avatar" />
                        ) : (
                          <div className="friend-avatar fallback">
                            {friend.photoURL || (friend.displayName || friend.username || "P")[0].toUpperCase()}
                          </div>
                        )}
                        <div className="friend-info">
                          <div className="friend-name-row">
                            <strong>{friend.displayName}</strong>
                            <span className="friend-handle">@{friend.username}</span>
                          </div>
                          <div className="friend-meta-tags">
                            <span className="friend-role-badge">{friend.title || "Virtuoso"}</span>
                            {friend.totalCareerScore !== undefined && friend.totalCareerScore > 0 && (
                              <span className="friend-score-badge">
                                {friend.totalCareerScore.toLocaleString("id-ID")} pts
                              </span>
                            )}
                            {friend.favoriteInstrument && (
                              <span className="friend-inst-badge">
                                {friend.favoriteInstrument.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="friend-card-actions">
                        {onInviteToMultiplayer && (
                          <button
                            type="button"
                            className="friend-action-btn duel"
                            onClick={() => onInviteToMultiplayer(friend)}
                            title="Ajak tanding multiplayer duel"
                          >
                            Ajak Duel ↗
                          </button>
                        )}
                        <button
                          type="button"
                          className="friend-action-btn remove"
                          disabled={actionLoadingId === friend.uid}
                          onClick={() => handleRemoveFriend(friend.uid, friend.displayName)}
                          title="Hapus dari daftar teman"
                        >
                          ✕
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="friends-empty-state">
                  <div className="empty-icon-wrap">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <strong>Belum Ada Teman</strong>
                  <p>Kamu belum menambahkan teman. Gunakan tab &quot;Cari Pemain&quot; untuk menemukan sesama pemain!</p>
                  <button type="button" className="friends-cta-btn" onClick={() => setTab("search")}>
                    Cari Teman Sekarang ↗
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: PERMINTAAN PERTEMANAN (REQUESTS)
             ========================================================================= */}
          {tab === "requests" && (
            <div className="requests-view">
              {/* Incoming Requests */}
              <div className="requests-section">
                <div className="requests-section-header">
                  <span>PERMINTAAN MASUK</span>
                  <b>{incomingRequests.length}</b>
                </div>

                {incomingRequests.length > 0 ? (
                  <div className="requests-list">
                    {incomingRequests.map((req) => (
                      <div key={req.id} className="request-card incoming">
                        <div className="request-user-info">
                          {req.fromPhotoURL && req.fromPhotoURL.length > 5 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={req.fromPhotoURL} alt={req.fromDisplayName} className="friend-avatar" />
                          ) : (
                            <div className="friend-avatar fallback">
                              {req.fromPhotoURL || (req.fromDisplayName || "P")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <strong>{req.fromDisplayName}</strong>
                            <span className="friend-handle">@{req.fromUsername}</span>
                          </div>
                        </div>

                        <div className="request-actions">
                          <button
                            type="button"
                            className="req-btn accept"
                            disabled={actionLoadingId === req.id}
                            onClick={() => void handleAcceptRequest(req)}
                          >
                            Terima ✓
                          </button>
                          <button
                            type="button"
                            className="req-btn decline"
                            disabled={actionLoadingId === req.id}
                            onClick={() => void handleDeclineRequest(req.id)}
                          >
                            Tolak ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="requests-empty-hint">Tidak ada permintaan pertemanan masuk.</div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div className="requests-section">
                <div className="requests-section-header">
                  <span>PERMINTAAN TERKIRIM (MENUNGGU RESPON)</span>
                  <b>{outgoingRequests.length}</b>
                </div>

                {outgoingRequests.length > 0 ? (
                  <div className="requests-list">
                    {outgoingRequests.map((req) => (
                      <div key={req.id} className="request-card outgoing">
                        <div className="request-user-info">
                          {req.toPhotoURL && req.toPhotoURL.length > 5 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={req.toPhotoURL} alt={req.toDisplayName} className="friend-avatar" />
                          ) : (
                            <div className="friend-avatar fallback">
                              {req.toPhotoURL || (req.toDisplayName || "P")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <strong>{req.toDisplayName}</strong>
                            <span className="friend-handle">@{req.toUsername}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="req-btn cancel"
                          disabled={actionLoadingId === req.id}
                          onClick={() => void handleCancelOutgoing(req.id)}
                        >
                          Batalkan
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="requests-empty-hint">Tidak ada permintaan pertemanan yang tertunda.</div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: CARI PEMAIN (FIND PLAYERS)
             ========================================================================= */}
          {tab === "search" && (
            <div className="search-players-view">
              <div className="search-input-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-player-input"
                  placeholder="Ketik username (@handle) atau nama pemain..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button type="button" className="clear-search-btn" onClick={() => setSearchQuery("")}>
                    ✕
                  </button>
                )}
              </div>

              <div className="search-results-box">
                {searching ? (
                  <div className="search-loading">
                    <div className="spinner-orbit" />
                    <span>Mencari pemain...</span>
                  </div>
                ) : searchQuery.trim() && searchResults.length > 0 ? (
                  <div className="search-results-grid">
                    {searchResults.map((foundUser) => {
                      const isFriend = friendUids.has(foundUser.uid);
                      const isSent = outgoingUids.has(foundUser.uid);
                      const incomingReq = incomingMap.get(foundUser.uid);
                      const isLoading = actionLoadingId === foundUser.uid;

                      return (
                        <article key={foundUser.uid} className="search-user-card">
                          <div className="search-user-left">
                            {foundUser.photoURL && foundUser.photoURL.length > 5 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={foundUser.photoURL} alt={foundUser.displayName} className="friend-avatar" />
                            ) : (
                              <div className="friend-avatar fallback">
                                {foundUser.photoURL || (foundUser.displayName || foundUser.username || "P")[0].toUpperCase()}
                              </div>
                            )}
                            <div className="search-user-meta">
                              <strong>{foundUser.displayName}</strong>
                              <span className="friend-handle">@{foundUser.username || "player"}</span>
                              <div className="friend-meta-tags">
                                <span className="friend-role-badge">{foundUser.title || "Virtuoso"}</span>
                                {foundUser.totalCareerScore !== undefined && (
                                  <span className="friend-score-badge">
                                    {foundUser.totalCareerScore.toLocaleString("id-ID")} pts
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="search-user-action">
                            {isFriend ? (
                              <span className="friend-status-badge friend">Berteman ✓</span>
                            ) : incomingReq ? (
                              <button
                                type="button"
                                className="search-action-btn accept"
                                disabled={isLoading}
                                onClick={() => void handleAcceptRequest(incomingReq)}
                              >
                                Terima Request
                              </button>
                            ) : isSent ? (
                              <span className="friend-status-badge pending">Request Terkirim</span>
                            ) : (
                              <button
                                type="button"
                                className="search-action-btn add"
                                disabled={isLoading}
                                onClick={() => void handleSendRequest(foundUser)}
                              >
                                ＋ Tambah Teman
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="search-empty">
                    <p>Tidak ditemukan pemain dengan kata kunci <strong>&quot;{searchQuery}&quot;</strong>.</p>
                    <small>Pastikan ejaan username atau nama akun sesuai.</small>
                  </div>
                ) : (
                  <div className="search-idle-hint">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <p>Ketik nama atau <b>@username</b> temanmu pada kolom di atas untuk menambahkan pertemanan.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
