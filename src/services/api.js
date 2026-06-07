import axios from "axios";

// Use relative URLs in development so Vite proxy can intercept /api/* requests
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Create axios instance (no default Content-Type so FormData can set boundary)
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // Increased timeout for complex operations like study plan creation (3 mins)
});

const PUBLIC_AUTH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/refresh",
  "/api/v1/auth/stripe/config",
  "/api/v1/auth/verify-email",
  "/api/v1/auth/verify-otp",
  "/api/v1/auth/resend-verification",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
];

const isPublicAuthRequest = (url = "") =>
  PUBLIC_AUTH_PATHS.some((path) => url.includes(path));

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    // Skip token only for public auth endpoints.
    // Protected auth routes like /auth/stripe/* still require Authorization.
    if (isPublicAuthRequest(config.url)) {
      return config;
    }

    try {
      // Import auth store dynamically to avoid circular imports
      const { useAuthStore } = await import("../store/authStore");

      // Get a valid token (will refresh if needed)
      const token = await useAuthStore.getState().getValidToken();

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("[API] Error in request interceptor:", error);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to handle token refresh on 401
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle tier-based access denial (403)
    if (error.response?.status === 403) {
      const { code, requiredTier, currentTier } = error.response.data || {};
      if (code === "TIER_REQUIRED" || code === "TRIAL_EXPIRED") {
        // Dispatch a custom event so UI components can react
        window.dispatchEvent(
          new CustomEvent("tier-upgrade-required", {
            detail: { code, requiredTier, currentTier, url: error.config?.url },
          }),
        );
      }
    }

    // Do not trigger refresh/logout flow on public auth requests.
    if (
      error.response?.status === 401 &&
      isPublicAuthRequest(originalRequest?.url)
    ) {
      return Promise.reject(error);
    }

    // If 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Import auth store dynamically
        const { useAuthStore } = await import("../store/authStore");
        const authStore = useAuthStore.getState();

        // Try to refresh token
        const refreshed = await authStore.refreshTokenAsync();

        if (refreshed) {
          // Retry the original request with new token
          const newToken = authStore.token;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        console.error("[API] Token refresh failed:", refreshError);
      }

      // If refresh failed or no refresh token, logout user
      const { useAuthStore } = await import("../store/authStore");
      useAuthStore.getState().logout();

      // Redirect to login if not already there
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

// Auth API
export const authAPI = {
  register: (data) => api.post("/api/v1/auth/register", data),
  login: (data) => api.post("/api/v1/auth/login", data),
  refresh: (refreshToken) => api.post("/api/v1/auth/refresh", { refreshToken }),
  getMe: () => api.get("/api/v1/auth/me"),
  updateTier: (tier) => api.put("/api/v1/auth/tier", { tier }),
  getStripeConfig: () => api.get("/api/v1/auth/stripe/config"),
  subscribe: (tier, durationMonths = 1) =>
    api.post("/api/v1/auth/stripe/subscribe", { tier, durationMonths }),
  confirmCheckout: (sessionId) =>
    api.post("/api/v1/auth/stripe/confirm", { sessionId }),
  verifyEmail: (token) => api.post("/api/v1/auth/verify-email", { token }),
  verifyOtp: (email, otp) =>
    api.post("/api/v1/auth/verify-otp", { email, otp }),
  resendVerification: (email) =>
    api.post("/api/v1/auth/resend-verification", { email }),
  forgotPassword: (email) =>
    api.post("/api/v1/auth/forgot-password", { email }),
  resetPassword: (token, newPassword) =>
    api.post("/api/v1/auth/reset-password", { token, newPassword }),
  redeemCoupon: (coupon, expectedTier) =>
    api.post("/api/v1/auth/coupon/redeem", { coupon, expectedTier }),
  listCoupons: () => api.get("/api/v1/auth/coupon/list"),
  changePlan: (newTier, durationMonths = 1) =>
    api.post("/api/v1/auth/plan/change", { newTier, durationMonths }),
};

export const adminAPI = {
  getUsers: (params = {}) => api.get("/api/v1/auth/admin/users", { params }),
  getUserById: (userId) => api.get(`/api/v1/auth/admin/users/${userId}`),
  updateUser: (userId, data) =>
    api.put(`/api/v1/auth/admin/users/${userId}`, data),
  deactivateUser: (userId) => api.delete(`/api/v1/auth/admin/users/${userId}`),
  getStats: () => api.get("/api/v1/auth/admin/stats"),
  getRevenueAnalytics: () => api.get("/api/v1/auth/admin/analytics/revenue"),
  getSubscriptions: (params = {}) =>
    api.get("/api/v1/auth/admin/subscriptions", { params }),
  cancelSubscription: (paymentId) =>
    api.put(`/api/v1/auth/admin/subscriptions/${paymentId}/cancel`),
  getCoupons: () => api.get("/api/v1/auth/admin/coupons"),
  createCoupon: (data) => api.post("/api/v1/auth/admin/coupons", data),
  updateCoupon: (couponId, data) =>
    api.put(`/api/v1/auth/admin/coupons/${couponId}`, data),
  deactivateCoupon: (couponId) =>
    api.delete(`/api/v1/auth/admin/coupons/${couponId}`),
  getCouponUsage: (couponId) =>
    api.get(`/api/v1/auth/admin/coupons/${couponId}/usage`),
};

// Profile API
export const profileAPI = {
  get: () => api.get("/api/v1/users/profile"),
  update: (data) => api.put("/api/v1/users/profile", data),
  updateOnlineStatus: (onlineStatus) =>
    api.put("/api/v1/users/profile/online-status", { onlineStatus }),
  getOnlineStatusBatch: (userIds = []) =>
    api.get("/api/v1/users/profile/online-status/batch", {
      params: { userIds: userIds.join(",") },
    }),
  getStats: () => api.get("/api/v1/users/profile/stats"),
  updateStats: (data) =>
    api.patch("/api/v1/users/profile/stats", data).then((res) => res.data),
};

// Subject & Course Management (through main backend)
export const subjectAPI = {
  list: () => api.get("/api/v1/study/subjects"),
  create: (formData) => api.post("/api/v1/study/subjects", formData),
  get: (subjectId) => api.get(`/api/v1/study/subjects/${subjectId}`),
  update: (subjectId, formData) =>
    api.put(`/api/v1/study/subjects/${subjectId}`, formData),
  delete: (subjectId) => api.delete(`/api/v1/study/subjects/${subjectId}`),
};

export const courseAPI = {
  list: (subjectId = null) =>
    api.get("/api/v1/study/courses", {
      params: subjectId ? { subject_id: subjectId } : {},
    }),
  create: (formData) => api.post("/api/v1/study/courses", formData),
  createManual: (data) => api.post("/api/v1/study/courses/manual", data),
  get: (courseId) => api.get(`/api/v1/study/courses/${courseId}`),
  addFiles: (courseId, formData) =>
    api.post(`/api/v1/study/courses/${courseId}/files`, formData),
  delete: (courseId) => api.delete(`/api/v1/study/courses/${courseId}`),
};

// AI Services API (all routed through API Gateway → ai-orchestrator → Python AI)
export const aiAPI = {
  // Study Planning
  createStudyPlan: (data) => api.post("/api/v1/ai/plan/create", data),
  getUserPlans: () => api.get("/api/v1/ai/plan/list"),

  // Coaching
  getCoachDecision: (data) => api.post("/api/v1/ai/coach", data),
  getCoachHistory: (userId, limit = 20) =>
    api.get(`/api/v1/ai/coach/history/${userId}`, { params: { limit } }),
  applyCoachActionToSchedule: (coachAction) =>
    api.post("/api/v1/ai/schedule/apply-coach-action", {
      coach_action: coachAction,
    }),

  // Schedule Orchestrator
  getScheduleStatus: () => api.get("/api/v1/ai/schedule/status"),
  optimizeSchedule: (reason = "manual_optimize") =>
    api.put("/api/v1/ai/schedule/optimize", { reason }),
  reschedule: (reason = "manual") =>
    api.post("/api/v1/ai/schedule/reschedule", { reason }),
  evaluateSession: (payload) =>
    api.post("/api/v1/ai/evaluator/session", payload),
  getVectorIndexStatus: (courseId) =>
    api.get(`/api/v1/ai/vector/status/${courseId}`),
  rebuildVectorIndex: (courseId) =>
    api.post(`/api/v1/ai/vector/rebuild/${courseId}`),

  // Signal Processing
  getCurrentSignals: (userId) =>
    api.get(`/api/v1/ai/signals/current/${userId}`),
  getSignalHistory: (userId, limit = 50) =>
    api.get(`/api/v1/ai/signals/history/${userId}`, { params: { limit } }),
  processSignals: (userId) =>
    api.post("/api/v1/ai/signals/process", { user_id: userId }),
  analyzeFrame: (formData) =>
    api.post("/api/v1/ai/signals/analyze-frame", formData, {
      timeout: 30000,
    }),
  getLatestSignals: (userId, limit = 10) =>
    api.get(`/api/v1/ai/signals/latest/${userId}`, { params: { limit } }),
  resetFatigue: (userId) =>
    api.post("/api/v1/ai/signals/fatigue/reset", { user_id: userId }),

  // Socratic Evaluation
  socraticStart: (data) =>
    api.post("/api/v1/ai/evaluator/socratic/start", data),
  socraticAnswer: (data) =>
    api.post("/api/v1/ai/evaluator/socratic/answer", data),

  // AI Search
  search: (data = {}) => {
    const normalizedPayload = {
      question: data.question ?? data.query ?? "",
    };

    const resolvedUserId = data.user_id ?? data.userId;
    if (resolvedUserId != null && resolvedUserId !== "") {
      normalizedPayload.user_id = resolvedUserId;
    }

    const resolvedSessionId = data.session_id ?? data.sessionId;
    if (resolvedSessionId != null && resolvedSessionId !== "") {
      normalizedPayload.session_id = resolvedSessionId;
    }

    return api.post("/api/v1/ai/search/ask", normalizedPayload);
  },
  searchHistory: (userId, limit = 20) =>
    api.get(`/api/v1/ai/search/history/${userId}`, { params: { limit } }),

  // Health check
  healthCheck: () => api.get("/api/v1/ai/status"),
  getStats: () => api.get("/api/v1/users/profile/stats"),
  updateStats: (data) => api.patch("/api/v1/users/profile/stats", data),
  getGoals: () => api.get("/api/v1/users/profile/goals"),
  addGoal: (data) => api.post("/api/v1/users/profile/goals", data),
  updateGoal: (goalId, data) =>
    api.patch(`/api/v1/users/profile/goals/${goalId}`, data),
  deleteGoal: (goalId) => api.delete(`/api/v1/users/profile/goals/${goalId}`),
};

// Tasks API
export const tasksAPI = {
  getAll: (params) => api.get("/api/v1/study/tasks", { params }),
  getById: (taskId) => api.get(`/api/v1/study/tasks/${taskId}`),
  create: (data) => api.post("/api/v1/study/tasks", data),
  update: (taskId, data) => api.put(`/api/v1/study/tasks/${taskId}`, data),
  delete: (taskId) => api.delete(`/api/v1/study/tasks/${taskId}`),
};

// Study Plans API (replaces old task generation)
export const studyPlanAPI = {
  create: (data) => api.post("/api/v1/study/plans/create", data),
  getAll: (params) => api.get("/api/v1/study/plans", { params }),
  getById: (planId) => api.get(`/api/v1/study/plans/${planId}`),
  schedule: (planId, contextData) =>
    api.post(`/api/v1/study/plans/${planId}/schedule`, contextData),
  getSchedule: (planId) => api.get(`/api/v1/study/plans/${planId}/schedule`),
  delete: (planId) => api.delete(`/api/v1/study/plans/${planId}`),
  scheduleTasks: (data) => api.post("/api/v1/study/plans/schedule-tasks", data),
  getCalendar: (params) => api.get("/api/v1/study/plans/calendar", { params }),
};

// Availability API (Weekly Calendar) - Goes through Node.js backend
export const availabilityAPI = {
  get: () => api.get("/api/v1/users/availability").then((res) => res.data),
  save: (data) =>
    api.post("/api/v1/users/availability", data).then((res) => res.data),
  delete: (id) =>
    api.delete(`/api/v1/users/availability/${id}`).then((res) => res.data),
  getFreeSlots: (params) =>
    api
      .get("/api/v1/users/availability/free-slots", { params })
      .then((res) => res.data),
};

// Character System API
export const characterAPI = {
  getCharacters: (params = {}) =>
    api.get("/api/v1/characters", { params }).then((res) => res.data),
  getBaseCharacters: () =>
    api.get("/api/v1/characters/base").then((res) => res.data),
  getCharacterById: (characterId) =>
    api.get(`/api/v1/characters/${characterId}`).then((res) => res.data),
  selectCharacter: (characterId) =>
    api
      .post("/api/v1/user/select-character", { characterId })
      .then((res) => res.data),
  changeCharacter: (characterId) =>
    api
      .patch("/api/v1/user/character", { characterId })
      .then((res) => res.data),
  getUserCharacter: () =>
    api.get("/api/v1/user/character").then((res) => res.data),
  getOwnedCharacters: () =>
    api.get("/api/v1/user/owned-characters").then((res) => res.data),
  purchaseCharacter: (characterId) =>
    api
      .post(`/api/v1/user/characters/${characterId}/purchase`)
      .then((res) => res.data),
  confirmCharacterPurchase: (sessionId) =>
    api
      .post("/api/v1/user/characters/purchase/confirm", { sessionId })
      .then((res) => res.data),
  getCharacterPurchases: () =>
    api.get("/api/v1/user/characters/purchases").then((res) => res.data),
  getUnlockProgress: () =>
    api.get("/api/v1/user/unlock-progress").then((res) => res.data),
  triggerAbility: (payload) =>
    api.post("/api/v1/abilities/trigger", payload).then((res) => res.data),
  getAbilityStats: () =>
    api.get("/api/v1/user/ability-stats").then((res) => res.data),
  getAbilityEvents: (limit = 100) =>
    api
      .get("/api/v1/user/ability-events", { params: { limit } })
      .then((res) => res.data),
};

// Gamification API - Goes through Node.js backend
export const gamificationAPI = {
  getProfile: () =>
    api.get("/api/v1/users/gamification").then((res) => res.data),
  awardXP: (data) =>
    api
      .post("/api/v1/users/gamification/award-xp", data)
      .then((res) => res.data),
  getLeaderboard: (limit = 10) =>
    api
      .get("/api/v1/users/gamification/leaderboard", { params: { limit } })
      .then((res) => res.data),
  getRankProfile: () =>
    api.get("/api/v1/users/gamification/rank/profile").then((res) => res.data),
  getRankLeaderboard: (params = {}) =>
    api
      .get("/api/v1/users/gamification/rank/leaderboard", { params })
      .then((res) => res.data),
  getCurrentSeason: () =>
    api
      .get("/api/v1/users/gamification/rank/seasons/current")
      .then((res) => res.data),
  getRankHistory: (limit = 20) =>
    api
      .get("/api/v1/users/gamification/rank/history", { params: { limit } })
      .then((res) => res.data),
  getRankProgress: () =>
    api.get("/api/v1/users/gamification/rank/progress").then((res) => res.data),
  getRankSessionResult: (sessionId) =>
    api
      .get("/api/v1/users/gamification/rank/session-result", {
        params: sessionId ? { sessionId } : {},
      })
      .then((res) => res.data),
};

// Topics API
export const topicsAPI = {
  getAll: () => api.get("/api/v1/study/topics"),
  getById: (topicId) => api.get(`/api/v1/study/topics/${topicId}`),
  create: (data) => api.post("/api/v1/study/topics", data),
  update: (topicId, data) => api.put(`/api/v1/study/topics/${topicId}`, data),
  delete: (topicId) => api.delete(`/api/v1/study/topics/${topicId}`),
};

// Sessions API
export const sessionsAPI = {
  getAll: (params) => api.get("/api/v1/study/sessions", { params }),
  getById: (sessionId) => api.get(`/api/v1/study/sessions/${sessionId}`),
  create: (data) => api.post("/api/v1/study/sessions", data),
  update: (sessionId, data) =>
    api.put(`/api/v1/study/sessions/${sessionId}`, data),
  endSession: (sessionId) =>
    api.put(`/api/v1/study/sessions/${sessionId}`, { status: "completed" }),
  getStats: (params) =>
    api.get("/api/v1/study/sessions/stats/summary", { params }),
};

// Focus Tracking API
export const focusAPI = {
  startSession: (data) => api.post("/api/v1/signals/focus/start", data),
  addDataPoint: (sessionId, data) =>
    api.post(`/api/v1/signals/focus/${sessionId}/data`, data),
  endSession: (sessionId) => api.post(`/api/v1/signals/focus/${sessionId}/end`),
  getSession: (sessionId) => api.get(`/api/v1/signals/focus/${sessionId}`),
  getAllSessions: (params) => api.get("/api/v1/signals/focus", { params }),
  getStats: (params) =>
    api.get("/api/v1/signals/focus/stats/summary", { params }),
};

// Analytics API
export const analyticsAPI = {
  trackEvent: (data) => api.post("/api/v1/analytics/track", data),
  getTimeline: (params) => api.get("/api/v1/analytics/timeline", { params }),
  getSummary: (params) => api.get("/api/v1/analytics/summary", { params }),
  getStatsByType: (eventType, params) =>
    api.get(`/api/v1/analytics/stats/${eventType}`, { params }),
  getInsights: (params) => api.get("/api/v1/analytics/insights", { params }),
  getDailyActivity: (params) =>
    api.get("/api/v1/analytics/daily-activity", { params }),
};

// Review / Spaced Repetition API - Goes through AI Orchestrator
export const reviewAPI = {
  scheduleReview: (data) =>
    api.post("/api/v1/ai/reviews/schedule", data).then((res) => res.data),
  recordResult: (data) =>
    api.post("/api/v1/ai/reviews/record-result", data).then((res) => res.data),
  getPending: (userId, limit = 20) =>
    api
      .get(`/api/v1/ai/reviews/pending/${userId}`, { params: { limit } })
      .then((res) => res.data),
  getStats: (userId) =>
    api.get(`/api/v1/ai/reviews/stats/${userId}`).then((res) => res.data),
};

// Notification API
export const notificationAPI = {
  getAll: (params) =>
    api
      .get("/api/v1/notifications", { params, timeout: 15000 })
      .then((res) => res.data),
  create: (data) =>
    api
      .post("/api/v1/notifications", data, { timeout: 15000 })
      .then((res) => res.data),
  markRead: (id) =>
    api
      .patch(`/api/v1/notifications/${id}/read`, null, { timeout: 15000 })
      .then((res) => res.data),
  markAllRead: (userId) =>
    api
      .patch("/api/v1/notifications/read-all", null, {
        params: { userId },
        timeout: 15000,
      })
      .then((res) => res.data),
  delete: (id) =>
    api
      .delete(`/api/v1/notifications/${id}`, { timeout: 15000 })
      .then((res) => res.data),
};

export const sessionChatAPI = {
  getHistory: (sessionId, params = {}) =>
    api.get(`/api/v1/session-chat/${sessionId}/history`, { params }),
  query: (sessionId, query) =>
    api.post(`/api/v1/session-chat/${sessionId}/query`, { query }),
  deleteMessage: (sessionId, messageId) =>
    api.delete(`/api/v1/session-chat/${sessionId}/${messageId}`),
};

export const voiceAPI = {
  start: (sessionId) => api.post(`/api/v1/voice/${sessionId}/start`),
  end: (sessionId) => api.post(`/api/v1/voice/${sessionId}/end`),
  status: (sessionId) => api.get(`/api/v1/voice/${sessionId}/status`),
  join: (sessionId, peerId = "") =>
    api.post(`/api/v1/voice/${sessionId}/participant`, { peerId }),
  leave: (sessionId) => api.delete(`/api/v1/voice/${sessionId}/participant`),
  mute: (sessionId, isMuted) =>
    api.patch(`/api/v1/voice/${sessionId}/mute`, { isMuted }),
};

// Quest API
export const questAPI = {
  getAll: () => api.get("/api/v1/users/quests").then((res) => res.data),
  progress: (action) =>
    api
      .post("/api/v1/users/quests/progress", { action })
      .then((res) => res.data),
};

// Friends API
export const friendsAPI = {
  getAll: () => api.get("/api/v1/users/friends").then((r) => r.data),
  getIncoming: () =>
    api.get("/api/v1/users/friends/requests/incoming").then((r) => r.data),
  getOutgoing: () =>
    api.get("/api/v1/users/friends/requests/outgoing").then((r) => r.data),
  sendRequest: (data) =>
    api.post("/api/v1/users/friends/request", data).then((r) => r.data),
  acceptRequest: (id) =>
    api.put(`/api/v1/users/friends/request/${id}/accept`).then((r) => r.data),
  rejectRequest: (id) =>
    api.put(`/api/v1/users/friends/request/${id}/reject`).then((r) => r.data),
  cancelRequest: (id) =>
    api.delete(`/api/v1/users/friends/request/${id}`).then((r) => r.data),
  removeFriend: (friendId) =>
    api.delete(`/api/v1/users/friends/${friendId}`).then((r) => r.data),
  blockUser: (userId) =>
    api.post(`/api/v1/users/friends/block/${userId}`).then((r) => r.data),
  unblockUser: (userId) =>
    api.delete(`/api/v1/users/friends/block/${userId}`).then((r) => r.data),
  getBlocked: () =>
    api.get("/api/v1/users/friends/blocked").then((r) => r.data),
  search: (query) =>
    api
      .get("/api/v1/users/friends/search", { params: { q: query } })
      .then((r) => r.data),
  getProfile: (friendId) =>
    api.get(`/api/v1/users/friends/${friendId}/profile`).then((r) => r.data),
  getOnline: () => api.get("/api/v1/users/friends/online").then((r) => r.data),
  getCount: () => api.get("/api/v1/users/friends/count").then((r) => r.data),
};

// Team Sessions API
export const teamSessionsAPI = {
  create: (data) =>
    api.post("/api/v1/study/sessions/team", data).then((r) => r.data),
  join: (sessionId, inviteCode) =>
    api
      .post(`/api/v1/study/sessions/team/${sessionId}/join`, { inviteCode })
      .then((r) => r.data),
  joinByCode: (inviteCode) =>
    api
      .post("/api/v1/study/sessions/team/join-by-code", { inviteCode })
      .then((r) => r.data),
  start: (sessionId) =>
    api
      .put(`/api/v1/study/sessions/team/${sessionId}/start`)
      .then((r) => r.data),
  leave: (sessionId) =>
    api
      .post(`/api/v1/study/sessions/team/${sessionId}/leave`)
      .then((r) => r.data),
  invite: (sessionId, friendId) =>
    api
      .post(`/api/v1/study/sessions/team/${sessionId}/invite`, { friendId })
      .then((r) => r.data),
  getParticipants: (sessionId) =>
    api
      .get(`/api/v1/study/sessions/team/${sessionId}/participants`)
      .then((r) => r.data),
  end: (sessionId) =>
    api.put(`/api/v1/study/sessions/team/${sessionId}/end`).then((r) => r.data),
};

export const challengeSessionsAPI = {
  start: (data) =>
    api
      .post("/api/v1/study/sessions/challenge/start", data)
      .then((r) => r.data),
  get: (sessionId) =>
    api
      .get(`/api/v1/study/sessions/challenge/${sessionId}`)
      .then((r) => r.data),
  complete: (sessionId, data = {}) =>
    api
      .put(`/api/v1/study/sessions/challenge/${sessionId}/complete`, data)
      .then((r) => r.data),
};

// Session Setup & Task Progression API
export const sessionSetupAPI = {
  setup: (data) =>
    api.post("/api/v1/study/sessions/setup", data).then((r) => r.data),
  completeTask: (sessionId) =>
    api
      .post(`/api/v1/study/sessions/${sessionId}/task/complete`)
      .then((r) => r.data),
  skipTask: (sessionId) =>
    api
      .post(`/api/v1/study/sessions/${sessionId}/task/skip`)
      .then((r) => r.data),
};

// Background Customization API
export const backgroundAPI = {
  getSettings: () =>
    api.get("/api/v1/users/profile/background").then((r) => r.data),
  applyBackground: (data) =>
    api
      .post("/api/v1/users/profile/background/apply", data)
      .then((r) => r.data),
  uploadBackground: (formData) =>
    api
      .post("/api/v1/users/profile/background/upload", formData)
      .then((r) => r.data),
  uploadAnimatedBackground: (formData) =>
    api
      .post("/api/v1/users/profile/animated-background/upload", formData)
      .then((r) => r.data),
  getPresets: () =>
    api.get("/api/v1/users/profile/background/presets").then((r) => r.data),
  applyAnimatedBackground: (data) =>
    api
      .post("/api/v1/users/profile/animated-background/apply", data)
      .then((r) => r.data),
  getAnimatedPresets: () =>
    api
      .get("/api/v1/users/profile/animated-background/presets")
      .then((r) => r.data),
  getLevelInfo: () =>
    api.get("/api/v1/users/profile/level").then((r) => r.data),
};

// Legacy support - maintain backward compatibility
export const login = (credentials) => authAPI.login(credentials);
export const register = (userData) => authAPI.register(userData);
export const validateToken = () => authAPI.getMe();
export const getTasks = () => tasksAPI.getAll();
export const getTask = (id) => tasksAPI.getById(id);
export const createTask = (task) => tasksAPI.create(task);
export const updateTask = (id, task) => tasksAPI.update(id, task);
export const deleteTask = (id) => tasksAPI.delete(id);

// Session endpoints (fixed to use correct route prefix)
export const getSessions = () => api.get("/api/v1/study/sessions");
export const getSession = (id) => api.get(`/api/v1/study/sessions/${id}`);
export const createSession = (session) =>
  api.post("/api/v1/study/sessions", session);
export const endSession = (id) => api.patch(`/api/v1/study/sessions/${id}/end`);

export default api;
