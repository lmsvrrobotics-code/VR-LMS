import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            // Fixed: Uses /api/public/profile endpoint
            const response = await axios.get(`${API_BASE}/api/public/profile`, { headers });
            setUser(response.data?.user);
            setFormData(response.data?.user || {});
        } catch (error) {
            toast.error('Failed to load profile');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const response = await axios.patch(`${API_BASE}/api/public/profile`, formData, { headers });
            setUser(response.data?.user);
            setIsEditing(false);
            toast.success('Profile updated successfully');
        } catch (error) {
            toast.error('Failed to update profile');
            console.error(error);
        }
    };

    if (loading) {
        return <div className="loading-spinner">Loading profile...</div>;
    }

    return (
        <div className="tab-section profile-section">
            <div className="profile-card">
                <div className="profile-header">
                    <div className="profile-avatar">
                        <img src={user?.avatar || '/default-avatar.png'} alt={user?.name} />
                    </div>
                    <div className="profile-info">
                        <h2>{user?.name}</h2>
                        <p className="email">{user?.email}</p>
                        <p className="role">Student</p>
                    </div>
                </div>

                {!isEditing ? (
                    <div className="profile-details">
                        <div className="detail-row">
                            <span className="label">Name:</span>
                            <span className="value">{user?.name}</span>
                        </div>
                        <div className="detail-row">
                            <span className="label">Email:</span>
                            <span className="value">{user?.email}</span>
                        </div>
                        <div className="detail-row">
                            <span className="label">Phone:</span>
                            <span className="value">{user?.phone || 'Not provided'}</span>
                        </div>
                        <div className="detail-row">
                            <span className="label">College/School:</span>
                            <span className="value">{user?.clg_id || 'Not provided'}</span>
                        </div>
                        <button
                            className="btn-edit"
                            onClick={() => setIsEditing(true)}
                        >
                            <i className="fi-rr-pencil" /> Edit Profile
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleUpdate} className="edit-form">
                        <div className="form-group">
                            <label>Name</label>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                value={formData.email || ''}
                                disabled
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input
                                type="tel"
                                value={formData.phone || ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>College/School</label>
                            <input
                                type="text"
                                value={formData.clg_id || ''}
                                onChange={(e) => setFormData({ ...formData, clg_id: e.target.value })}
                            />
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn-save">Save Changes</button>
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={() => {
                                    setIsEditing(false);
                                    setFormData(user);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
