import React, { useMemo } from "react";
import "./LevelUpModal.css";

const CONFETTI_COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6b9d"];

// Pre-generate stable confetti data so colors/positions don't re-randomize on each render
const CONFETTI_DATA = Array.from({ length: 30 }, (_, i) => ({
  left: ((i * 37 + 13) % 100),
  delay: ((i * 67 + 7) % 200) / 100,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

const LevelUpModal = ({ visible, newLevel, totalXP, onClose }) => {
  if (!visible) return null;

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-confetti">
          {CONFETTI_DATA.map((piece, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${piece.left}%`,
                animationDelay: `${piece.delay}s`,
                backgroundColor: piece.color,
              }}
            />
          ))}
        </div>

        <div className="levelup-content">
          <div className="levelup-icon">🎉</div>
          <h2 className="levelup-title">LEVEL UP!</h2>
          <div className="levelup-level">
            <span className="level-label">Level</span>
            <span className="level-number">{newLevel}</span>
          </div>
          <p className="levelup-xp">Total XP: {totalXP}</p>
          <p className="levelup-message">
            Amazing progress! Keep up the great work! 🚀
          </p>
          <button className="levelup-close-btn" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default LevelUpModal;
