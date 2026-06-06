import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, CheckCircle2, XCircle, Brain, RefreshCw } from "lucide-react";
import { aiAPI } from "../services/api";

export default function SocraticEvaluation({
  taskTitle,
  taskDescription,
  taskDetails,
  maxAttempts = 5,
  onComplete,
  onClose,
}) {
  const [sessionId, setSessionId] = useState(null);
  const [question, setQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [state, setState] = useState("idle");
  const [masteryScore, setMasteryScore] = useState(0);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [error, setError] = useState(null);

  const startEvaluation = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await aiAPI.socraticStart({
        task_title: taskTitle,
        task_description: taskDescription,
        task_details: taskDetails,
        max_attempts: maxAttempts,
      });
      setSessionId(res.data.session_id);
      setQuestion(res.data.question);
      setState("answering");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to start evaluation");
      setState("error");
    }
  }, [taskTitle, taskDescription, taskDetails, maxAttempts]);

  const submitAnswer = useCallback(async () => {
    if (!userAnswer.trim()) return;
    setState("loading");
    setError(null);
    try {
      const res = await aiAPI.socraticAnswer({
        session_id: sessionId,
        user_answer: userAnswer,
      });
      const { state: newState, mastery_score, feedback: fb, next_question } = res.data;
      setFeedback(fb);
      setMasteryScore(mastery_score);
      setQuestionsAsked((prev) => prev + 1);

      if (newState === "mastery_confirmed" || newState === "failed") {
        setState("complete");
        onComplete?.({
          state: newState,
          mastery_score,
          questions_asked: questionsAsked + 1,
          feedback: fb,
        });
      } else {
        setQuestion(next_question || "Explain your understanding further.");
        setUserAnswer("");
        setState("answering");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to submit answer");
      setState("error");
    }
  }, [sessionId, userAnswer, questionsAsked, onComplete]);

  if (state === "idle") {
    return (
      <div className="bg-[#1a2633] border border-[#ffffff10] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={18} className="text-[var(--accent-color-dynamic)]" />
          <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">
            Socratic Evaluation
          </h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Test your understanding with AI-driven Socratic questioning.
        </p>
        <button
          onClick={startEvaluation}
          className="w-full px-4 py-2 bg-[var(--accent-color-dynamic)] text-white text-xs font-bold tracking-wider uppercase rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          <Brain size={14} /> Start Evaluation
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="bg-[#1a2633] border border-[#ffffff10] rounded-xl p-4">
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 size={20} className="animate-spin text-[var(--accent-color-dynamic)]" />
          <span className="text-sm text-gray-400">Processing...</span>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-[#1a2633] border border-[#ffffff10] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <XCircle size={16} className="text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
        <button
          onClick={() => setState("idle")}
          className="flex items-center gap-1 text-xs text-[var(--accent-color-dynamic)] hover:underline"
        >
          <RefreshCw size={12} /> Try Again
        </button>
      </div>
    );
  }

  if (state === "complete") {
    const isSuccess = masteryScore >= 0.7;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1a2633] border border-[#ffffff10] rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          {isSuccess ? (
            <CheckCircle2 size={18} className="text-green-400" />
          ) : (
            <XCircle size={18} className="text-red-400" />
          )}
          <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">
            Evaluation {isSuccess ? "Passed" : "Needs Review"}
          </h3>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Mastery Score</span>
            <span className={`font-bold ${isSuccess ? "text-green-400" : "text-red-400"}`}>
              {Math.round(masteryScore * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-[#0f1923] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isSuccess ? "bg-green-400" : "bg-red-400"}`}
              style={{ width: `${masteryScore * 100}%` }}
            />
          </div>
        </div>
        {feedback && (
          <p className="text-xs text-gray-300 mb-3">{feedback}</p>
        )}
        <p className="text-xs text-gray-500 mb-3">
          Questions answered: {questionsAsked}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setState("idle");
              setSessionId(null);
              setMasteryScore(0);
              setQuestionsAsked(0);
              setFeedback(null);
            }}
            className="flex-1 px-3 py-2 bg-[var(--accent-color-dynamic)] text-white text-xs font-bold tracking-wider uppercase rounded-lg hover:opacity-90 transition-all"
          >
            Retry
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 bg-[#0f1923] border border-[#ffffff10] text-gray-400 text-xs font-bold tracking-wider uppercase rounded-lg hover:bg-[#ffffff10] transition-all"
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#1a2633] border border-[#ffffff10] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-[var(--accent-color-dynamic)]" />
          <h3 className="text-xs font-bold tracking-wider text-gray-500 uppercase">
            Socratic Q&A
          </h3>
        </div>
        <span className="text-xs text-gray-500">
          Q{questionsAsked + 1}
        </span>
      </div>

      <div className="bg-[#0f1923] rounded-lg p-3 mb-3">
        <p className="text-sm text-white leading-relaxed">{question}</p>
      </div>

      <textarea
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
        placeholder="Type your answer..."
        rows={3}
        className="w-full bg-[#0f1923] border border-[#ffffff10] rounded-lg p-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-[var(--accent-color-dynamic)] transition-colors mb-3"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitAnswer();
          }
        }}
      />

      <button
        onClick={submitAnswer}
        disabled={!userAnswer.trim()}
        className="w-full px-4 py-2 bg-[var(--accent-color-dynamic)] text-white text-xs font-bold tracking-wider uppercase rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send size={14} /> Submit Answer
      </button>

      {feedback && (
        <p className="text-xs text-gray-400 mt-2">{feedback}</p>
      )}
    </motion.div>
  );
}
