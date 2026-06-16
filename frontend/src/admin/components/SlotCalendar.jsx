import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './SlotCalendar.css';

const API_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || 'http://localhost:5000';

// Time-based grid calendar showing slots
// Y-axis: time slots (08:00, 09:00, 10:00, etc.)
// X-axis: days of the week
// Each cell contains slots with course name, capacity, and status

export default function SlotCalendar({ batchId, courseId, startDate, endDate }) {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSlot, setSelectedSlot] = useState(null);

    // Fetch slots for the date range
    useEffect(() => {
        const fetchSlots = async () => {
            try {
                setLoading(true);
                const params = { startDate, endDate };
                if (batchId) params.batchId = batchId;
                if (courseId) params.courseId = courseId;

                const res = await axios.get(\\/api/admin/slots/by-date-range\, { params });
                setSlots(res.data.slots || []);
            } catch (e) {
                console.error('Failed to fetch slots', e);
                setSlots([]);
            } finally {
                setLoading(false);
            }
        };
        if (startDate && endDate) fetchSlots();
    }, [startDate, endDate, batchId, courseId]);

    // Generate time slots (08:00 - 20:00 by 1-hour intervals)
    const timeSlots = useMemo(() => {
        const times = [];
        for (let h = 8; h <= 20; h++) {
            times.push(\\:00\);
        }
        return times;
    }, []);

    // Get unique days from slots
    const days = useMemo(() => {
        const uniqueDays = [...new Set(slots.map(s => s.slot_date))].sort();
        return uniqueDays;
    }, [slots]);

    // Get slots for a specific time and day
    const getSlotsForTimeDay = (time, day) => {
        return slots.filter(s => s.slot_date === day && s.start_time <= time && s.end_time > time);
    };

    // Get status color
    const getStatusColor = (status, enrolledCount, capacity) => {
        if (status === 'cancelled') return '#ccc';
        if (enrolledCount >= capacity) return '#ff6b6b'; // red - full
        if (enrolledCount > 0) return '#ffa94d'; // orange - partially filled
        return '#51cf66'; // green - available
    };

    if (loading) {
        return <div className="text-center py-8">Loading calendar...</div>;
    }

    return (
        <div className="slot-calendar">
            <div className="calendar-grid">
                {/* Time column header */}
                <div className="time-header">
                    <div className="time-cell header">Time</div>
                </div>

                {/* Day headers */}
                <div className="days-header">
                    {days.map((day, idx) => (
                        <div key={idx} className="day-cell header">
                            {new Date(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                    ))}
                </div>

                {/* Time slots grid */}
                <div className="grid-body">
                    {timeSlots.map((time, tIdx) => (
                        <div key={tIdx} className="time-row">
                            {/* Time label */}
                            <div className="time-label">{time}</div>

                            {/* Day columns */}
                            {days.map((day, dIdx) => {
                                const daySlots = getSlotsForTimeDay(time, day);
                                return (
                                    <div key={dIdx} className="slot-cell">
                                        {daySlots.map((slot, sIdx) => (
                                            <div
                                                key={sIdx}
                                                className="slot-block"
                                                style={{
                                                    backgroundColor: getStatusColor(slot.status, slot.enrolled_count, slot.capacity),
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => setSelectedSlot(slot)}
                                            >
                                                <div className="slot-content">
                                                    <div className="slot-course">{slot.course?.title || 'Course'}</div>
                                                    <div className="slot-time">{slot.start_time} - {slot.end_time}</div>
                                                    <div className="slot-capacity">
                                                        {slot.enrolled_count}/{slot.capacity}
                                                    </div>
                                                    <div className="slot-status">
                                                        {slot.status === 'full' ? 'FULL' : slot.status.toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Slot detail modal */}
            {selectedSlot && (
                <div className="slot-modal" onClick={() => setSelectedSlot(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>{selectedSlot.course?.title}</h3>
                        <div className="modal-details">
                            <p><strong>Date:</strong> {selectedSlot.slot_date}</p>
                            <p><strong>Time:</strong> {selectedSlot.start_time} - {selectedSlot.end_time}</p>
                            <p><strong>Capacity:</strong> {selectedSlot.enrolled_count}/{selectedSlot.capacity}</p>
                            <p><strong>Status:</strong> {selectedSlot.status}</p>
                            {selectedSlot.topic && <p><strong>Topic:</strong> {selectedSlot.topic}</p>}
                            {selectedSlot.meeting_link && (
                                <p><strong>Meeting:</strong> <a href={selectedSlot.meeting_link} target="_blank" rel="noreferrer">Join</a></p>
                            )}
                        </div>
                        <button onClick={() => setSelectedSlot(null)} className="btn-close">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
