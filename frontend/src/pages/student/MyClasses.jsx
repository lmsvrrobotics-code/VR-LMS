import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import UpcomingClasses from '../../components/UpcomingClasses';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function MyClasses() {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBatch, setSelectedBatch] = useState(null);

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            // Fixed: Use /api/public/batches/my (student-filtered endpoint)
            const response = await axios.get(`${API_BASE}/api/public/batches/my`, { headers });
            setBatches(response.data?.batches || []);
            if (response.data?.batches?.length > 0) {
                setSelectedBatch(response.data.batches[0].batch_id);
            }
        } catch (error) {
            toast.error('Failed to load batches');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading-spinner">Loading classes...</div>;
    }

    if (batches.length === 0) {
        return (
            <div className="empty-state">
                <i className="fi-rr-monitor" />
                <p>You're not enrolled in any classes yet.</p>
            </div>
        );
    }

    return (
        <div className="tab-section">
            <div className="batch-selector">
                <label>Select Batch:</label>
                <select
                    value={selectedBatch || ''}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="batch-select"
                >
                    {batches.map((batch) => (
                        <option key={batch.batch_id} value={batch.batch_id}>
                            {batch.batch_id} - {batch.course?.title || 'Unknown Course'}
                        </option>
                    ))}
                </select>
            </div>

            {selectedBatch && (
                <div className="upcoming-classes-section">
                    <UpcomingClasses batchId={selectedBatch} />
                </div>
            )}
        </div>
    );
}
