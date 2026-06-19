import axios from 'axios';

const API_BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: `${API_BASE}/api/public`,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export interface StudentBatch {
    unique_id: string;
    display_name: string;
    primary_teacher_id: string;
    status: string;
    student_id: string;
    created_at: string;
}

export interface CourseWithBatch {
    id: number;
    title: string;
    description?: string;
    featured_image?: string;
    Category?: { name: string };
    Lessons?: any[];
}

// Get student's batches
export const getStudentBatches = async (): Promise<{ success: boolean; batches: StudentBatch[] }> => {
    const response = await api.get('/batches/my');
    return response.data;
};

// Get student's courses (filtered by their batches)
export const getStudentCourses = async (): Promise<{ success: boolean; courses: CourseWithBatch[] }> => {
    const response = await api.get('/courses/my');
    return response.data;
};

export default api;
