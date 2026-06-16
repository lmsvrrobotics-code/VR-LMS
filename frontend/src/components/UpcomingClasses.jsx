import { useState, useEffect } from 'react';
import axios from 'axios';
import { format, isBefore, addMinutes } from 'date-fns';

const API_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || 'http://localhost:5000';

// Display upcoming classes for a batch
// Shows: time, teacher, course, join button, teaching aids
export default function UpcomingClasses({ batchId }) {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedSlot, setExpandedSlot] = useState(null);

    // Fetch upcoming slots for this batch
    useEffect(() => {
        const fetchUpcomingSlots = async () => {
            try {
                setLoading(true);
                const today = new Date().toISOString().split('T')[0];
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 30); // Next 30 days
                const futureStr = futureDate.toISOString().split('T')[0];

                const res = await axios.get(\\/api/public/slots/by-date-range\, {
                    params: {
                        batchId,
                        startDate: today,
                        endDate: futureStr,
                    },
                });

                // Filter slots that haven't ended yet
                const now = new Date();
                const upcoming = (res.data.slots || [])
                    .filter(s => {
                        const slotEnd = new Date(\\T\\);
                        return isBefore(now, slotEnd);
                    })
                    .sort((a, b) => {
                        const aTime = new Date(\\T\\);
                        const bTime = new Date(\\T\\);
                        return aTime - bTime;
                    })
                    .slice(0, 5); // Show top 5 upcoming

                setSlots(upcoming);
            } catch (e) {
                console.error('Failed to fetch slots', e);
                setSlots([]);
            } finally {
                setLoading(false);
            }
        };

        if (batchId) fetchUpcomingSlots();
    }, [batchId]);

    // Check if class can be joined (within 15 min before start)
    const canJoin = (slotDate, startTime) => {
        const classTime = new Date(\\T\\);
        const now = new Date();
        const fifteenMinBefore = addMinutes(classTime, -15);
        return isBefore(fifteenMinBefore, now);
    };

    if (loading) {
        return <div className="text-center py-4 text-gray-500">Loading classes...</div>;
    }

    if (slots.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <p>No upcoming classes</p>
            </div>
        );
    }

    return (
        <div className="upcoming-classes">
            <h3 className="section-title">Upcoming Classes <span className="badge">{slots.length}</span></h3>

            <div className="classes-grid">
                {slots.map((slot) => {
                    const isJoinable = canJoin(slot.slot_date, slot.start_time);
                    const classTime = new Date(\\T\\);

                    return (
                        <div key={slot.id} className="class-card">
                            {/* Time */}
                            <div className="class-time">
                                {format(classTime, 'hh:mm a')}
                            </div>

                            {/* Join Button */}
                            <button
                                className={isJoinable ? 'btn-join enabled' : 'btn-join disabled'}
                                onClick={() => {
                                    if (isJoinable && slot.meeting_link) {
                                        window.open(slot.meeting_link, '_blank');
                                    }
                                }}
                                disabled={!isJoinable}
                            >
                                <span className="icon">📹</span> Join
                            </button>

                            {/* Teacher & Course */}
                            <div className="class-info">
                                <div className="teacher">
                                    <img src="https://i.pravatar.cc/40" alt="teacher" className="avatar" />
                                    <div>
                                        <div className="teacher-name">Teacher Name</div>
                                        <div className="course-name">{slot.course?.title}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Class Type Badge */}
                            {slot.topic && (
                                <div className="class-type">
                                    <span className="badge-icon">📚</span> {slot.topic}
                                </div>
                            )}

                            {/* Teaching Aids */}
                            {slot.notes && (
                                <div className="teaching-aids">
                                    <button className="aid-btn">📄 Resources</button>
                                </div>
                            )}

                            {/* Expand for more details */}
                            {expandedSlot === slot.id && (
                                <div className="slot-details">
                                    <p><strong>Date:</strong> {format(classTime, 'MMM dd, yyyy')}</p>
                                    <p><strong>Time:</strong> {slot.start_time} - {slot.end_time}</p>
                                    {slot.topic && <p><strong>Topic:</strong> {slot.topic}</p>}
                                    {slot.notes && <p><strong>Notes:</strong> {slot.notes}</p>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
