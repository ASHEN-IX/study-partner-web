import { create } from "zustand";
import { friendsAPI, teamSessionsAPI } from "../services/api";

const useFriendsStore = create((set, get) => ({
  // State
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  onlineFriends: [],
  searchResults: [],
  friendCount: 0,
  selectedFriend: null,
  loading: false,
  error: null,

  // Team session state
  activeTeamSession: null,
  teamParticipants: [],

  // Actions
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // Fetch friends list
  fetchFriends: async () => {
    set({ loading: true, error: null });
    try {
      const data = await friendsAPI.getAll();
      const friendsArray = Array.isArray(data.friends)
        ? data.friends
        : Array.isArray(data)
          ? data
          : [];
      set({ friends: friendsArray, loading: false });
    } catch (err) {
      set({
        error: err.response?.data?.error || "Failed to load friends",
        loading: false,
      });
    }
  },

  // Fetch incoming requests
  fetchIncomingRequests: async () => {
    try {
      const data = await friendsAPI.getIncoming();
      const requestsArray = Array.isArray(data.requests)
        ? data.requests
        : Array.isArray(data)
          ? data
          : [];
      set({ incomingRequests: requestsArray });
    } catch (err) {
      console.error("Failed to fetch incoming requests:", err);
      set({ incomingRequests: [] });
    }
  },

  // Fetch outgoing requests
  fetchOutgoingRequests: async () => {
    try {
      const data = await friendsAPI.getOutgoing();
      const requestsArray = Array.isArray(data.requests)
        ? data.requests
        : Array.isArray(data)
          ? data
          : [];
      set({ outgoingRequests: requestsArray });
    } catch (err) {
      console.error("Failed to fetch outgoing requests:", err);
      set({ outgoingRequests: [] });
    }
  },

  // Fetch blocked users
  fetchBlocked: async () => {
    try {
      const data = await friendsAPI.getBlocked();
      const blockedArray = Array.isArray(data.blocked)
        ? data.blocked
        : Array.isArray(data)
          ? data
          : [];
      set({ blockedUsers: blockedArray });
    } catch (err) {
      console.error("Failed to fetch blocked users:", err);
      set({ blockedUsers: [] });
    }
  },

  // Fetch online friends
  fetchOnlineFriends: async () => {
    try {
      const data = await friendsAPI.getOnline();
      const onlineArray = Array.isArray(data.friends)
        ? data.friends
        : Array.isArray(data)
          ? data
          : [];
      set({ onlineFriends: onlineArray });
    } catch (err) {
      console.error("Failed to fetch online friends:", err);
      set({ onlineFriends: [] });
    }
  },

  // Fetch friend count
  fetchFriendCount: async () => {
    try {
      const data = await friendsAPI.getCount();
      set({ friendCount: data.total || data.count || 0 });
    } catch (err) {
      console.error("Failed to fetch friend count:", err);
    }
  },

  // Search users
  searchUsers: async (query) => {
    if (!query || query.length < 2) {
      set({ searchResults: [] });
      return;
    }
    try {
      const data = await friendsAPI.search(query);
      const resultsArray = Array.isArray(data.users)
        ? data.users
        : Array.isArray(data)
          ? data
          : [];
      set({ searchResults: resultsArray });
    } catch (err) {
      console.error("Search failed:", err);
      set({ searchResults: [] });
    }
  },

  // Send friend request
  sendRequest: async (data) => {
    try {
      const result = await friendsAPI.sendRequest(data);
      // Refresh outgoing requests
      get().fetchOutgoingRequests();
      return result;
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to send request";
      set({ error: msg });
      throw new Error(msg);
    }
  },

  // Accept friend request
  acceptRequest: async (requestId) => {
    try {
      await friendsAPI.acceptRequest(requestId);
      get().fetchFriends();
      get().fetchIncomingRequests();
      get().fetchFriendCount();
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to accept request" });
    }
  },

  // Reject friend request
  rejectRequest: async (requestId) => {
    try {
      await friendsAPI.rejectRequest(requestId);
      set((s) => ({
        incomingRequests: s.incomingRequests.filter((r) => r._id !== requestId),
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to reject request" });
    }
  },

  // Cancel outgoing request
  cancelRequest: async (requestId) => {
    try {
      await friendsAPI.cancelRequest(requestId);
      set((s) => ({
        outgoingRequests: s.outgoingRequests.filter((r) => r._id !== requestId),
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to cancel request" });
    }
  },

  // Remove friend
  removeFriend: async (friendId) => {
    try {
      await friendsAPI.removeFriend(friendId);
      set((s) => ({
        friends: s.friends.filter(
          (f) => f.friendId !== friendId && f._id !== friendId,
        ),
        friendCount: Math.max(0, s.friendCount - 1),
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to remove friend" });
    }
  },

  // Block user
  blockUser: async (userId) => {
    try {
      await friendsAPI.blockUser(userId);
      get().fetchFriends();
      get().fetchBlocked();
      get().fetchFriendCount();
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to block user" });
    }
  },

  // Unblock user
  unblockUser: async (userId) => {
    try {
      await friendsAPI.unblockUser(userId);
      set((s) => ({
        blockedUsers: s.blockedUsers.filter(
          (b) => b.userId !== userId && b._id !== userId,
        ),
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to unblock user" });
    }
  },

  // Get friend profile
  getFriendProfile: async (friendId) => {
    try {
      const data = await friendsAPI.getProfile(friendId);
      set({ selectedFriend: data.profile || data });
      return data.profile || data;
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to load profile" });
    }
  },

  // Team session actions
  createTeamSession: async (data) => {
    try {
      const result = await teamSessionsAPI.create(data);
      set({ activeTeamSession: result.session || result });
      return result;
    } catch (err) {
      set({
        error: err.response?.data?.error || "Failed to create team session",
      });
      throw err;
    }
  },

  joinTeamSession: async (sessionId, inviteCode) => {
    try {
      const result = await teamSessionsAPI.join(sessionId, inviteCode);
      set({ activeTeamSession: result.session || result });
      return result;
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to join session" });
      throw err;
    }
  },

  leaveTeamSession: async (sessionId) => {
    try {
      await teamSessionsAPI.leave(sessionId);
      set({ activeTeamSession: null, teamParticipants: [] });
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to leave session" });
    }
  },

  inviteToSession: async (sessionId, friendId) => {
    try {
      return await teamSessionsAPI.invite(sessionId, friendId);
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to send invite" });
      throw err;
    }
  },

  fetchParticipants: async (sessionId) => {
    try {
      const data = await teamSessionsAPI.getParticipants(sessionId);
      set({ teamParticipants: data.participants || [] });
    } catch (err) {
      console.error("Failed to fetch participants:", err);
    }
  },

  endTeamSession: async (sessionId) => {
    try {
      const result = await teamSessionsAPI.end(sessionId);
      set({ activeTeamSession: null, teamParticipants: [] });
      return result;
    } catch (err) {
      set({ error: err.response?.data?.error || "Failed to end session" });
      throw err;
    }
  },
}));

export default useFriendsStore;
