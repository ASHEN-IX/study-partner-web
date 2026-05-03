import React, { useEffect, useMemo, useState } from "react";
import "./WeeklyCalendar.css";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const START_HOUR = 7;
const END_HOUR = 22;
const SLOT_MINUTES = 10;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * SLOTS_PER_HOUR;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toMinutesFromClock = (clockValue) => {
  const [hours, minutes] = String(clockValue || "00:00")
    .split(":")
    .map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const slotIndexToMinutes = (slotIndex) =>
  START_HOUR * 60 + slotIndex * SLOT_MINUTES;

const slotIndexToClock = (slotIndex) => {
  const minutes = slotIndexToMinutes(slotIndex);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatClock = (clockValue) => {
  const [rawH, rawM] = String(clockValue || "00:00")
    .split(":")
    .map(Number);
  const h12 = rawH % 12 === 0 ? 12 : rawH % 12;
  const suffix = rawH >= 12 ? "PM" : "AM";
  return `${h12}:${String(rawM || 0).padStart(2, "0")} ${suffix}`;
};

const timeToSlotIndex = (clockValue) => {
  const totalMinutes = toMinutesFromClock(clockValue);
  const relative = totalMinutes - START_HOUR * 60;
  return clamp(Math.floor(relative / SLOT_MINUTES), 0, TOTAL_SLOTS - 1);
};

const timeToEndSlotIndex = (clockValue) => {
  const totalMinutes = toMinutesFromClock(clockValue);
  const relative = totalMinutes - START_HOUR * 60;
  return clamp(Math.ceil(relative / SLOT_MINUTES), 1, TOTAL_SLOTS);
};

export default function WeeklyCalendar({
  availability = [],
  events = [],
  currentWeekStart,
  onSave,
  onDelete,
}) {
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [eventSlots, setEventSlots] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [label, setLabel] = useState("");
  const [isRecurring, setIsRecurring] = useState(true);
  const [rowHeight, setRowHeight] = useState(22);
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const [dragSelection, setDragSelection] = useState(null);
  const [zoomDrag, setZoomDrag] = useState(null);
  const [createRange, setCreateRange] = useState({
    startIndex: 0,
    endIndex: 1,
  });
  const [selectedTimezone] = useState(() => {
    try {
      return (
        localStorage.getItem("calendar.timezone") ||
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    } catch {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  });

  const slotIndexes = useMemo(
    () => Array.from({ length: TOTAL_SLOTS }, (_, i) => i),
    [],
  );

  useEffect(() => {
    const mappedAvailability = availability.map((av) => {
      const startIndex = timeToSlotIndex(av.start_time);
      const endIndex = Math.max(
        startIndex + 1,
        timeToEndSlotIndex(av.end_time),
      );
      return {
        id: av._id,
        day: av.day_of_week,
        startIndex,
        endIndex,
        label: av.label || "Blocked",
        backgroundColor: av.color || "var(--accent-color-dynamic)",
      };
    });
    setSelectedSlots(mappedAvailability);

    const mappedEvents = (events || []).map((ev) => {
      const start = new Date(ev.startTime);
      const end = new Date(ev.endTime);
      const dayOfWeek = start.getDay();
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const weekStartDate = new Date(currentWeekStart);
      weekStartDate.setHours(0, 0, 0, 0);

      const eventDate = new Date(start);
      eventDate.setHours(0, 0, 0, 0);

      const week = Math.max(
        0,
        Math.floor((eventDate - weekStartDate) / (7 * 24 * 60 * 60 * 1000)),
      );

      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const startIndex = clamp(
        Math.floor((startMinutes - START_HOUR * 60) / SLOT_MINUTES),
        0,
        TOTAL_SLOTS - 1,
      );
      const endIndex = clamp(
        Math.ceil((endMinutes - START_HOUR * 60) / SLOT_MINUTES),
        startIndex + 1,
        TOTAL_SLOTS,
      );

      return {
        id: ev.taskId || ev.id || `${ev.title}-${start.toISOString()}`,
        week,
        dayIndex,
        startIndex,
        endIndex,
        label: ev.title,
        backgroundColor: ev.color || "var(--accent-color-dynamic)",
        isEvent: true,
        meta: ev,
      };
    });

    setEventSlots(mappedEvents);
  }, [availability, events, currentWeekStart]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragSelection) {
        openCreateModalFromSelection(dragSelection);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [dragSelection]);

  useEffect(() => {
    if (!zoomDrag) return;

    const handleMouseMove = (event) => {
      const delta = zoomDrag.startY - event.clientY;
      const computed = clamp(
        zoomDrag.startHeight + Math.round(delta / 3),
        14,
        38,
      );
      setRowHeight(computed);
    };

    const handleMouseUp = () => {
      setZoomDrag(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [zoomDrag]);

  const findEventAt = (week, dayIndex, slotIndex) =>
    eventSlots.find(
      (slot) =>
        slot.week === week &&
        slot.dayIndex === dayIndex &&
        slotIndex >= slot.startIndex &&
        slotIndex < slot.endIndex,
    );

  const findBlockedAt = (dayIndex, slotIndex) =>
    selectedSlots.find(
      (slot) =>
        slot.day === DAYS[dayIndex] &&
        slotIndex >= slot.startIndex &&
        slotIndex < slot.endIndex,
    );

  const openCreateModalFromSelection = (selection) => {
    const startIndex = Math.min(selection.startIndex, selection.endIndex);
    const endIndexInclusive = Math.max(
      selection.startIndex,
      selection.endIndex,
    );
    const endIndexExclusive = clamp(
      endIndexInclusive + 1,
      startIndex + 1,
      TOTAL_SLOTS,
    );

    setCreateRange({ startIndex, endIndex: endIndexExclusive });
    setModalData({
      type: "create",
      week: selection.week,
      dayIndex: selection.dayIndex,
    });
    setShowModal(true);
    setDragSelection(null);
  };

  const handleCellMouseDown = (week, dayIndex, slotIndex) => {
    const eventSlot = findEventAt(week, dayIndex, slotIndex);
    if (eventSlot) {
      setModalData({ type: "event", slot: eventSlot });
      setShowModal(true);
      return;
    }

    const blockedSlot = findBlockedAt(dayIndex, slotIndex);
    if (blockedSlot) {
      setCreateRange({
        startIndex: blockedSlot.startIndex,
        endIndex: blockedSlot.endIndex,
      });
      setLabel(blockedSlot.label || "");
      setIsRecurring(true);
      setModalData({ type: "edit", slot: blockedSlot, week, dayIndex });
      setShowModal(true);
      return;
    }

    setDragSelection({
      week,
      dayIndex,
      startIndex: slotIndex,
      endIndex: slotIndex,
    });
  };

  const handleCellMouseEnter = (week, dayIndex, slotIndex) => {
    if (!dragSelection) return;
    if (dragSelection.week !== week || dragSelection.dayIndex !== dayIndex)
      return;

    setDragSelection((prev) =>
      prev
        ? {
            ...prev,
            endIndex: slotIndex,
          }
        : prev,
    );
  };

  const handleCellMouseUp = () => {
    if (dragSelection) {
      openCreateModalFromSelection(dragSelection);
    }
  };

  const handleCreateSlot = () => {
    if (!label.trim()) {
      alert("Please enter a label for this time slot");
      return;
    }

    const { dayIndex } = modalData;
    const startClock = slotIndexToClock(createRange.startIndex);
    const endClock = slotIndexToClock(createRange.endIndex);

    const payload = {
      day_of_week: DAYS[dayIndex],
      start_time: startClock,
      end_time: endClock,
      label: label.trim(),
      is_recurring: isRecurring,
      color: "var(--accent-color-dynamic)",
    };

    if (onSave) {
      onSave(payload);
    }

    closeModal();
  };

  const handleDeleteSlot = () => {
    const { slot } = modalData;
    if (onDelete && slot.id) {
      onDelete(slot.id);
    }
    closeModal();
  };

  const handleUpdateSlot = () => {
    if (!label.trim()) {
      alert("Please enter a label for this time slot");
      return;
    }

    const { slot, dayIndex } = modalData;
    if (onDelete && slot.id) {
      onDelete(slot.id);
    }

    const payload = {
      day_of_week: DAYS[dayIndex],
      start_time: slotIndexToClock(createRange.startIndex),
      end_time: slotIndexToClock(createRange.endIndex),
      label: label.trim(),
      is_recurring: isRecurring,
      color: "var(--accent-color-dynamic)",
    };

    if (onSave) {
      onSave(payload);
    }

    closeModal();
  };

  const closeModal = () => {
    setShowModal(false);
    setModalData(null);
    setLabel("");
    setIsRecurring(true);
    setDragSelection(null);
  };

  const isCellSelectedByDrag = (week, dayIndex, slotIndex) => {
    if (!dragSelection) return false;
    if (dragSelection.week !== week || dragSelection.dayIndex !== dayIndex)
      return false;

    const minIndex = Math.min(dragSelection.startIndex, dragSelection.endIndex);
    const maxIndex = Math.max(dragSelection.startIndex, dragSelection.endIndex);
    return slotIndex >= minIndex && slotIndex <= maxIndex;
  };

  const getCellStyle = (week, dayIndex, slotIndex) => {
    const eventSlot = findEventAt(week, dayIndex, slotIndex);
    if (eventSlot) {
      return {
        backgroundColor: eventSlot.backgroundColor,
        color: "white",
      };
    }

    const blockedSlot = findBlockedAt(dayIndex, slotIndex);
    if (blockedSlot) {
      return {
        backgroundColor: blockedSlot.backgroundColor,
        color: "white",
      };
    }

    if (isCellSelectedByDrag(week, dayIndex, slotIndex)) {
      return {
        backgroundColor: "rgba(147, 51, 234, 0.35)",
        color: "white",
      };
    }

    return {};
  };

  const getCellLabel = (week, dayIndex, slotIndex) => {
    const eventSlot = eventSlots.find(
      (slot) =>
        slot.week === week &&
        slot.dayIndex === dayIndex &&
        slot.startIndex === slotIndex,
    );
    if (eventSlot) return eventSlot.label;

    const blockedSlot = selectedSlots.find(
      (slot) => slot.day === DAYS[dayIndex] && slot.startIndex === slotIndex,
    );
    return blockedSlot ? blockedSlot.label : "";
  };

  const selectedDayDetail = useMemo(() => {
    if (selectedDayIndex === null) return null;

    const blockedItems = selectedSlots
      .filter((slot) => slot.day === DAYS[selectedDayIndex])
      .sort((a, b) => a.startIndex - b.startIndex)
      .map((slot) => ({
        id: slot.id,
        label: slot.label,
        kind: "Blocked",
        timeRange: `${formatClock(slotIndexToClock(slot.startIndex))} - ${formatClock(slotIndexToClock(slot.endIndex))}`,
        color: slot.backgroundColor,
      }));

    const eventItems = eventSlots
      .filter((slot) => slot.dayIndex === selectedDayIndex)
      .sort((a, b) => a.startIndex - b.startIndex)
      .map((slot) => ({
        id: slot.id,
        label: slot.label,
        kind: "Study session",
        timeRange: `${formatClock(slotIndexToClock(slot.startIndex))} - ${formatClock(slotIndexToClock(slot.endIndex))}`,
        color: slot.backgroundColor,
      }));

    return [...eventItems, ...blockedItems].sort((a, b) =>
      a.timeRange.localeCompare(b.timeRange),
    );
  }, [selectedDayIndex, selectedSlots, eventSlots]);

  const slotDurationMinutes =
    (createRange.endIndex - createRange.startIndex) * SLOT_MINUTES;

  return (
    <div className="weekly-calendar">
      <div className="calendar-header">
        <div className="calendar-zoom-controls">
          <span className="zoom-label">Scale</span>
          <button
            type="button"
            className={`zoom-drag-handle ${zoomDrag ? "active" : ""}`}
            onMouseDown={(event) => {
              setZoomDrag({ startY: event.clientY, startHeight: rowHeight });
            }}
          >
            Hold and drag to resize ({rowHeight}px)
          </button>
          <span className="timezone-chip">{selectedTimezone}</span>
          {selectedDayIndex !== null && (
            <button
              className="focus-reset-btn"
              onClick={() => setSelectedDayIndex(null)}
            >
              Back to Week
            </button>
          )}
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          {Array.from({ length: 1 }, (_, weekIndex) => (
            <div key={weekIndex} className="week-section">
              <div className="week-header">
                Week {weekIndex + 1}:{" "}
                {(() => {
                  const weekStart = new Date(currentWeekStart);
                  weekStart.setDate(weekStart.getDate() + weekIndex * 7);
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                })()}
              </div>

              <div className="calendar-grid">
                <div className="time-column">
                  <div className="corner-cell">Time</div>
                  {slotIndexes.map((slotIndex) => {
                    const isHourStart = slotIndex % SLOTS_PER_HOUR === 0;
                    const label = isHourStart
                      ? formatClock(slotIndexToClock(slotIndex))
                      : "";
                    return (
                      <div
                        key={`time-${slotIndex}`}
                        className={`time-cell ${isHourStart ? "hour-start" : ""}`}
                        style={{ height: `${rowHeight}px` }}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>

                {DAYS.map((day, dayIndex) => {
                  if (
                    selectedDayIndex !== null &&
                    selectedDayIndex !== dayIndex
                  ) {
                    return null;
                  }

                  const date = new Date(currentWeekStart);
                  date.setDate(date.getDate() + weekIndex * 7 + dayIndex);
                  const dateStr = date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const isToday =
                    date.toDateString() === new Date().toDateString();

                  return (
                    <div key={`${weekIndex}-${day}`} className="day-column">
                      <div
                        className={`day-header ${isToday ? "today" : ""} ${selectedDayIndex === dayIndex ? "focused" : ""}`}
                        onClick={() => setSelectedDayIndex(dayIndex)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedDayIndex(dayIndex);
                          }
                        }}
                      >
                        {day}
                        <br />
                        {dateStr}
                      </div>

                      {/* Clickable Background Grid */}
                      <div
                        className="day-grid-container"
                        style={{
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          flex: 1,
                        }}
                      >
                        {slotIndexes.map((slotIndex) => {
                          return (
                            <div
                              key={`${weekIndex}-${dayIndex}-${slotIndex}`}
                              className={`time-slot`}
                              style={{
                                ...getCellStyle(weekIndex, dayIndex, slotIndex),
                                height: `${rowHeight}px`,
                                backgroundColor: isCellSelectedByDrag(
                                  weekIndex,
                                  dayIndex,
                                  slotIndex,
                                )
                                  ? "rgba(147, 51, 234, 0.15)"
                                  : "transparent",
                                borderColor: "transparent",
                                borderBottom: "1px solid var(--border)",
                              }}
                              onMouseDown={() =>
                                handleCellMouseDown(
                                  weekIndex,
                                  dayIndex,
                                  slotIndex,
                                )
                              }
                              onMouseEnter={() =>
                                handleCellMouseEnter(
                                  weekIndex,
                                  dayIndex,
                                  slotIndex,
                                )
                              }
                              onMouseUp={handleCellMouseUp}
                            />
                          );
                        })}

                        {/* Absolute Event Overlays */}
                        {eventSlots
                          .filter(
                            (s) =>
                              s.week === weekIndex && s.dayIndex === dayIndex,
                          )
                          .map((slot) => (
                            <div
                              key={`event-${slot.id}`}
                              className="absolute-event study-session-card"
                              style={{
                                position: "absolute",
                                top: `${slot.startIndex * (rowHeight + 2)}px`,
                                height: `${(slot.endIndex - slot.startIndex) * (rowHeight + 2) - 2}px`,
                                left: "2px",
                                right: "2px",
                                backgroundColor:
                                  slot.backgroundColor || "var(--primary)",
                                borderRadius: "8px",
                                color: "white",
                                padding: "6px 8px",
                                fontSize: "0.8rem",
                                fontWeight: "600",
                                overflow: "hidden",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                zIndex: 10,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                border: "1px solid rgba(255,255,255,0.2)",
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setModalData({ type: "event", slot: slot });
                                setShowModal(true);
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {slot.label}
                              </span>
                              {slot.endIndex - slot.startIndex >= 4 && (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    opacity: 0.8,
                                    marginTop: "auto",
                                  }}
                                >
                                  {formatClock(
                                    slotIndexToClock(slot.startIndex),
                                  )}{" "}
                                  -{" "}
                                  {formatClock(slotIndexToClock(slot.endIndex))}
                                </span>
                              )}
                            </div>
                          ))}

                        {/* Absolute Blocked Overlays */}
                        {selectedSlots
                          .filter((s) => s.day === DAYS[dayIndex])
                          .map((slot, i) => (
                            <div
                              key={`blocked-${slot.id || i}`}
                              className="absolute-event blocked-session-card"
                              style={{
                                position: "absolute",
                                top: `${slot.startIndex * (rowHeight + 2)}px`,
                                height: `${(slot.endIndex - slot.startIndex) * (rowHeight + 2) - 2}px`,
                                left: "2px",
                                right: "2px",
                                backgroundColor:
                                  slot.backgroundColor ||
                                  "rgba(100, 116, 139, 0.9)",
                                borderRadius: "8px",
                                color: "white",
                                padding: "6px 8px",
                                fontSize: "0.8rem",
                                fontWeight: "500",
                                overflow: "hidden",
                                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
                                zIndex: 5,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "1px dashed rgba(255,255,255,0.4)",
                                backgroundImage:
                                  "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)",
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setCreateRange({
                                  startIndex: slot.startIndex,
                                  endIndex: slot.endIndex,
                                });
                                setLabel(slot.label || "");
                                setIsRecurring(true);
                                setModalData({
                                  type: "edit",
                                  slot: slot,
                                  week: weekIndex,
                                  dayIndex,
                                });
                                setShowModal(true);
                              }}
                            >
                              <span
                                style={{
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {slot.label}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selectedDayIndex !== null && (
          <aside className="day-detail-panel">
            <h3>{DAYS[selectedDayIndex]}</h3>
            <p className="panel-subtitle">Focused day timeline</p>
            {selectedDayDetail && selectedDayDetail.length > 0 ? (
              <div className="day-detail-list">
                {selectedDayDetail.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="day-detail-item"
                  >
                    <span
                      className="day-detail-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <div>
                      <p className="day-detail-label">{item.label}</p>
                      <p className="day-detail-meta">
                        {item.kind} - {item.timeRange}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-empty">
                No sessions or blocked ranges for this day.
              </p>
            )}
          </aside>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {modalData.type === "create" ? (
              <>
                <h3>Block This Time</h3>
                <div className="form-group">
                  <label>Label:</label>
                  <input
                    type="text"
                    placeholder="e.g., Math Class, Work, Gym"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                    />
                    Repeat every week
                  </label>
                </div>
                <div className="form-group">
                  <label>Start</label>
                  <select
                    value={createRange.startIndex}
                    onChange={(e) => {
                      const nextStart = Number(e.target.value);
                      setCreateRange((prev) => ({
                        startIndex: nextStart,
                        endIndex: Math.max(nextStart + 1, prev.endIndex),
                      }));
                    }}
                  >
                    {slotIndexes.map((slotIndex) => (
                      <option key={`start-${slotIndex}`} value={slotIndex}>
                        {formatClock(slotIndexToClock(slotIndex))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>End</label>
                  <select
                    value={createRange.endIndex}
                    onChange={(e) => {
                      const nextEnd = Number(e.target.value);
                      setCreateRange((prev) => ({
                        startIndex: Math.min(prev.startIndex, nextEnd - 1),
                        endIndex: Math.max(prev.startIndex + 1, nextEnd),
                      }));
                    }}
                  >
                    {slotIndexes
                      .filter((slotIndex) => slotIndex > createRange.startIndex)
                      .map((slotIndex) => (
                        <option key={`end-${slotIndex}`} value={slotIndex}>
                          {formatClock(slotIndexToClock(slotIndex))}
                        </option>
                      ))}
                    <option value={TOTAL_SLOTS}>
                      {formatClock(slotIndexToClock(TOTAL_SLOTS))}
                    </option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration</label>
                  <p className="text-sm text-muted-foreground">
                    {slotDurationMinutes} minutes (
                    {(slotDurationMinutes / 60).toFixed(1)} hours)
                  </p>
                </div>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn-save" onClick={handleCreateSlot}>
                    Block Time
                  </button>
                </div>
              </>
            ) : modalData.type === "edit" ? (
              <>
                <h3>Edit Time Block</h3>
                <div className="form-group">
                  <label>Label:</label>
                  <input
                    type="text"
                    placeholder="e.g., Math Class, Work, Gym"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                    />
                    Repeat every week
                  </label>
                </div>
                <div className="form-group">
                  <label>Start</label>
                  <select
                    value={createRange.startIndex}
                    onChange={(e) => {
                      const nextStart = Number(e.target.value);
                      setCreateRange((prev) => ({
                        startIndex: nextStart,
                        endIndex: Math.max(nextStart + 1, prev.endIndex),
                      }));
                    }}
                  >
                    {slotIndexes.map((slotIndex) => (
                      <option key={`edit-start-${slotIndex}`} value={slotIndex}>
                        {formatClock(slotIndexToClock(slotIndex))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>End</label>
                  <select
                    value={createRange.endIndex}
                    onChange={(e) => {
                      const nextEnd = Number(e.target.value);
                      setCreateRange((prev) => ({
                        startIndex: Math.min(prev.startIndex, nextEnd - 1),
                        endIndex: Math.max(prev.startIndex + 1, nextEnd),
                      }));
                    }}
                  >
                    {slotIndexes
                      .filter((slotIndex) => slotIndex > createRange.startIndex)
                      .map((slotIndex) => (
                        <option key={`edit-end-${slotIndex}`} value={slotIndex}>
                          {formatClock(slotIndexToClock(slotIndex))}
                        </option>
                      ))}
                    <option value={TOTAL_SLOTS}>
                      {formatClock(slotIndexToClock(TOTAL_SLOTS))}
                    </option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn-delete" onClick={handleDeleteSlot}>
                    Delete
                  </button>
                  <button className="btn-save" onClick={handleUpdateSlot}>
                    Save Changes
                  </button>
                </div>
              </>
            ) : modalData.type === "delete" ? (
              <>
                <h3>Delete Time Block</h3>
                <p>
                  Remove <strong>{modalData.slot.label}</strong> on{" "}
                  <strong>{modalData.slot.day}</strong>?
                </p>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn-delete" onClick={handleDeleteSlot}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Scheduled Session</h3>
                <p>
                  <strong>{modalData.slot.label}</strong>
                </p>
                <p className="muted">
                  {new Date(modalData.slot.meta.startTime).toLocaleString()} —{" "}
                  {new Date(modalData.slot.meta.endTime).toLocaleTimeString()}
                </p>
                <div className="modal-actions">
                  <button className="btn-cancel" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
