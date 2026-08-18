import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db } from "./config";
import type { UserProfile } from "./auth";

export type FriendRecord = {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string;
  title?: string;
  favoriteInstrument?: string;
  favoriteDifficulty?: string;
  totalCareerScore?: number;
  totalPlays?: number;
  status?: "online" | "in-game" | "offline";
  currentSong?: string;
  addedAt: number;
};

export type FriendRequest = {
  id: string; // `${fromUid}_${toUid}`
  fromUid: string;
  fromUsername: string;
  fromDisplayName: string;
  fromPhotoURL: string;
  fromTitle?: string;
  toUid: string;
  toUsername: string;
  toDisplayName: string;
  toPhotoURL: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
};

/**
 * Search for players by @username or display name in the users directory
 */
export async function searchUsers(
  searchQuery: string,
  currentUid: string
): Promise<UserProfile[]> {
  const clean = searchQuery.toLowerCase().trim().replace(/^@/, "");
  if (!clean) return [];

  const results: UserProfile[] = [];
  const seenUids = new Set<string>();

  try {
    // 1. Search by username prefix
    const usersRef = collection(db, "users");
    const usernameQuery = query(
      usersRef,
      where("username", ">=", clean),
      where("username", "<=", clean + "\uf8ff"),
      limit(10)
    );

    const snapshot = await getDocs(usernameQuery);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserProfile;
      if (data.uid !== currentUid && !seenUids.has(data.uid)) {
        seenUids.add(data.uid);
        results.push(data);
      }
    });

    // 2. If fewer than 5 results, search by display name prefix
    if (results.length < 5) {
      const nameQuery = query(
        usersRef,
        where("displayName", ">=", searchQuery.trim()),
        where("displayName", "<=", searchQuery.trim() + "\uf8ff"),
        limit(10)
      );
      const nameSnap = await getDocs(nameQuery);
      nameSnap.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data.uid !== currentUid && !seenUids.has(data.uid)) {
          seenUids.add(data.uid);
          results.push(data);
        }
      });
    }
  } catch (error) {
    console.error("Error searching users:", error);
  }

  return results;
}

/**
 * Send a friend request to a target user
 */
export async function sendFriendRequest(
  sender: UserProfile,
  target: UserProfile
): Promise<{ success: boolean; error?: string }> {
  if (sender.uid === target.uid) {
    return { success: false, error: "Tidak dapat menambahkan diri sendiri." };
  }

  const requestId = `${sender.uid}_${target.uid}`;
  const reverseRequestId = `${target.uid}_${sender.uid}`;

  try {
    // Check if already friends
    const friendDoc = await getDoc(doc(db, "users", sender.uid, "friends", target.uid));
    if (friendDoc.exists()) {
      return { success: false, error: "Sudah berteman dengan pemain ini." };
    }

    // Check if reverse request already exists (target already sent you a request)
    const reverseReqDoc = await getDoc(doc(db, "friend_requests", reverseRequestId));
    if (reverseReqDoc.exists()) {
      const data = reverseReqDoc.data() as FriendRequest;
      if (data.status === "pending") {
        // Auto-accept!
        return await acceptFriendRequest(data, sender);
      }
    }

    // Create the friend request
    const requestData: FriendRequest = {
      id: requestId,
      fromUid: sender.uid,
      fromUsername: sender.username || sender.displayName.toLowerCase().replace(/\s+/g, "_"),
      fromDisplayName: sender.displayName || "Player",
      fromPhotoURL: sender.photoURL || "",
      fromTitle: sender.title || "Virtuoso",
      toUid: target.uid,
      toUsername: target.username || target.displayName.toLowerCase().replace(/\s+/g, "_"),
      toDisplayName: target.displayName || "Player",
      toPhotoURL: target.photoURL || "",
      status: "pending",
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "friend_requests", requestId), requestData);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error sending friend request:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Gagal mengirim permintaan pertemanan.",
    };
  }
}

/**
 * Accept an incoming friend request
 */
export async function acceptFriendRequest(
  request: FriendRequest,
  currentUser: UserProfile
): Promise<{ success: boolean; error?: string }> {
  try {
    const friendUid = request.fromUid === currentUser.uid ? request.toUid : request.fromUid;

    // Fetch friend's profile to get latest stats
    const friendProfileDoc = await getDoc(doc(db, "users", friendUid));
    const friendData = friendProfileDoc.exists() ? (friendProfileDoc.data() as UserProfile) : null;

    const now = Date.now();

    // 1. Add friend to current user's friends subcollection
    const myFriendRecord: FriendRecord = {
      uid: friendUid,
      username: friendData?.username || request.fromUsername,
      displayName: friendData?.displayName || request.fromDisplayName,
      photoURL: friendData?.photoURL || request.fromPhotoURL,
      title: friendData?.title || request.fromTitle || "Virtuoso",
      favoriteInstrument: friendData?.favoriteInstrument,
      favoriteDifficulty: friendData?.favoriteDifficulty,
      totalCareerScore: friendData?.totalCareerScore || 0,
      totalPlays: friendData?.totalPlays || 0,
      addedAt: now,
    };
    await setDoc(doc(db, "users", currentUser.uid, "friends", friendUid), myFriendRecord);

    // 2. Add current user to friend's friends subcollection
    const theirFriendRecord: FriendRecord = {
      uid: currentUser.uid,
      username: currentUser.username || currentUser.displayName.toLowerCase().replace(/\s+/g, "_"),
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      title: currentUser.title || "Virtuoso",
      favoriteInstrument: currentUser.favoriteInstrument,
      favoriteDifficulty: currentUser.favoriteDifficulty,
      totalCareerScore: currentUser.totalCareerScore || 0,
      totalPlays: currentUser.totalPlays || 0,
      addedAt: now,
    };
    await setDoc(doc(db, "users", friendUid, "friends", currentUser.uid), theirFriendRecord);

    // 3. Delete or update the friend request
    await deleteDoc(doc(db, "friend_requests", request.id));

    return { success: true };
  } catch (error: unknown) {
    console.error("Error accepting friend request:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Gagal menerima permintaan pertemanan.",
    };
  }
}

/**
 * Decline an incoming friend request
 */
export async function declineFriendRequest(requestId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "friend_requests", requestId));
  } catch (error) {
    console.error("Error declining friend request:", error);
  }
}

/**
 * Cancel a sent outgoing friend request
 */
export async function cancelFriendRequest(requestId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "friend_requests", requestId));
  } catch (error) {
    console.error("Error cancelling friend request:", error);
  }
}

/**
 * Remove a friend from both users' friends lists
 */
export async function removeFriend(currentUid: string, friendUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", currentUid, "friends", friendUid));
    await deleteDoc(doc(db, "users", friendUid, "friends", currentUid));
  } catch (error) {
    console.error("Error removing friend:", error);
  }
}

/**
 * Subscribe to real-time updates for a user's friends list
 */
export function subscribeToFriends(
  userId: string,
  onUpdate: (friends: FriendRecord[]) => void
): () => void {
  const friendsRef = collection(db, "users", userId, "friends");
  return onSnapshot(
    friendsRef,
    (snapshot) => {
      const list: FriendRecord[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as FriendRecord);
      });
      // Sort by recently added
      list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      onUpdate(list);
    },
    (err) => {
      console.error("Friends snapshot error:", err);
      onUpdate([]);
    }
  );
}

/**
 * Subscribe to incoming friend requests for notification badges
 */
export function subscribeToIncomingFriendRequests(
  userId: string,
  onUpdate: (requests: FriendRequest[]) => void
): () => void {
  const q = query(
    collection(db, "friend_requests"),
    where("toUid", "==", userId),
    where("status", "==", "pending")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FriendRequest[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<FriendRequest, "id">) });
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(list);
    },
    (err) => {
      console.error("Incoming friend requests snapshot error:", err);
      onUpdate([]);
    }
  );
}

/**
 * Subscribe to outgoing (sent) friend requests
 */
export function subscribeToOutgoingFriendRequests(
  userId: string,
  onUpdate: (requests: FriendRequest[]) => void
): () => void {
  const q = query(
    collection(db, "friend_requests"),
    where("fromUid", "==", userId),
    where("status", "==", "pending")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: FriendRequest[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<FriendRequest, "id">) });
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      onUpdate(list);
    },
    (err) => {
      console.error("Outgoing friend requests snapshot error:", err);
      onUpdate([]);
    }
  );
}

export type MultiplayerInvite = {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL?: string;
  toUid: string;
  roomCode: string;
  songName: string;
  songArtist: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
};

/**
 * Send an in-game multiplayer duel/room invite to a friend
 */
export async function sendRoomInvite(
  fromUser: { uid: string; displayName?: string | null; photoURL?: string | null },
  toUid: string,
  roomCode: string,
  songName: string,
  songArtist: string
) {
  const inviteId = `${fromUser.uid}_${toUid}_${roomCode}`;
  const payload = {
    id: inviteId,
    fromUid: fromUser.uid,
    fromDisplayName: fromUser.displayName || "Rocker",
    fromPhotoURL: fromUser.photoURL || "",
    toUid,
    roomCode: roomCode.toUpperCase(),
    songName,
    songArtist,
    status: "pending" as const,
    createdAt: Date.now(),
  };

  // 1. Direct user inbox subcollection
  try {
    const userInboxRef = doc(db, "users", toUid, "invites", inviteId);
    await setDoc(userInboxRef, payload);
  } catch (e) {
    console.warn("Direct user invite write warning:", e);
  }

  // 2. Root multiplayer_invites collection
  try {
    const inviteRef = doc(db, "multiplayer_invites", inviteId);
    await setDoc(inviteRef, payload);
  } catch (e) {
    console.warn("Root multiplayer_invites write warning:", e);
  }
}

/**
 * Subscribe to incoming multiplayer invites for real-time invitation popup
 */
export function subscribeToIncomingRoomInvites(
  userId: string,
  onUpdate: (invites: MultiplayerInvite[]) => void
): () => void {
  const map = new Map<string, MultiplayerInvite>();

  const emit = () => {
    const list = Array.from(map.values()).filter((i) => i.status === "pending" || !i.status);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    onUpdate(list);
  };

  // Channel 1: User's private invites subcollection
  const userInvitesRef = collection(db, "users", userId, "invites");
  const unsubUser = onSnapshot(
    userInvitesRef,
    (snapshot) => {
      snapshot.forEach((d) => {
        const item = d.data() as MultiplayerInvite;
        map.set(d.id, { ...item, id: d.id });
      });
      emit();
    },
    (err) => {
      console.warn("User invites listener warning:", err);
    }
  );

  // Channel 2: Global multiplayer_invites collection
  const rootQuery = query(
    collection(db, "multiplayer_invites"),
    where("toUid", "==", userId)
  );
  const unsubRoot = onSnapshot(
    rootQuery,
    (snapshot) => {
      snapshot.forEach((d) => {
        const item = d.data() as MultiplayerInvite;
        map.set(d.id, { ...item, id: d.id });
      });
      emit();
    },
    (err) => {
      console.warn("Root multiplayer_invites listener warning:", err);
    }
  );

  return () => {
    unsubUser();
    unsubRoot();
  };
}

/**
 * Dismiss or accept an incoming room invite
 */
export async function respondToRoomInvite(inviteId: string, userId?: string) {
  try {
    const ref = doc(db, "multiplayer_invites", inviteId);
    await deleteDoc(ref);
  } catch {}
  if (userId) {
    try {
      const userRef = doc(db, "users", userId, "invites", inviteId);
      await deleteDoc(userRef);
    } catch {}
  }
}

