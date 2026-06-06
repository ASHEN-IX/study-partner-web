import React from "react";
import "./LevelUpModal.css";

const LevelUpModal = ({ visible, newLevel, totalXP, onClose }) => {
  if (!visible) return null;

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-confetti">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                backgroundColor: [
                  "#ff6b6b",
                  "#ffd93d",
                  "#6bcb77",
                  "#4d96ff",
                  "#ff6b9d",
                ][Math.floor(Math.random() * 5)],
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
