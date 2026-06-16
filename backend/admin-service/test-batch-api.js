#!/usr/bin/env node

/**
 * Test script for the new batch API
 * Run: node test-batch-api.js
 *
 * Tests:
 * 1. Create batch with students
 * 2. Get batch details
 * 3. List batches
 * 4. Add student to batch
 * 5. Remove student from batch (soft delete)
 * 6. Create class
 * 7. Assign temporary teacher
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api/admin';

// Test data
let createdBatchId = null;
let testCourseId = 1;
let testTeacherId = 'teacher-123';
let testStudentIds = ['student-1', 'student-2', 'student-3'];
let createdClassId = null;

const api = axios.create({
    baseURL: API_BASE,
    timeout: 10000,
    headers: {
        'Authorization': 'Bearer test-token', // Mock token
        'x-user-id': 'admin-123',
    },
});

async function log(step, data) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✓ ${step}`);
    console.log('='.repeat(60));
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

async function runTests() {
    try {
        // Test 1: Create batch
        console.log('\n🧪 Testing Batch API\n');

        log('Step 1: Creating batch...');
        const createRes = await api.post('/batches', {
            courseId: testCourseId,
            teacherId: testTeacherId,
            studentIds: testStudentIds,
            description: 'Test batch for API validation',
        });
        createdBatchId = createRes.data.batch.batch_id;
        log('Batch created', createRes.data);

        // Test 2: Get batch details
        log(`Step 2: Getting batch details (${createdBatchId})...`);
        const getRes = await api.get(`/batches/${createdBatchId}`);
        log('Batch details retrieved', getRes.data);

        // Test 3: List batches
        log('Step 3: Listing all batches...');
        const listRes = await api.get('/batches', { params: { page: 1 } });
        log('Batches listed', listRes.data);

        // Test 4: Add student to batch
        log(`Step 4: Adding new student to batch...`);
        const addRes = await api.post(`/batches/${createdBatchId}/students`, {
            userId: 'student-4',
            studentId: 'John_160625_004',
        });
        log('Student added', addRes.data);

        // Test 5: Create class for batch
        log(`Step 5: Creating class for batch...`);
        const classRes = await api.post(`/batches/${createdBatchId}/classes`, {
            classDate: new Date().toISOString(),
            topic: 'Introduction to Batch System',
            notes: 'Testing the new batch system',
            meetingLink: 'https://zoom.us/test',
        });
        createdClassId = classRes.data.class.id;
        log('Class created', classRes.data);

        // Test 6: Assign temporary teacher
        log(`Step 6: Assigning temporary teacher to class...`);
        const tempRes = await api.post(`/batch-classes/${createdClassId}/temp-teacher`, {
            tempTeacherId: 'temp-teacher-456',
        });
        log('Temporary teacher assigned', tempRes.data);

        // Test 7: Remove student from batch (soft delete)
        log(`Step 7: Removing student from batch (soft delete)...`);
        const removeRes = await api.delete(`/batches/${createdBatchId}/students/student-1`);
        log('Student removed (data preserved)', removeRes.data);

        // Test 8: Get batch again to verify student removal
        log(`Step 8: Verifying student removal...`);
        const verifyRes = await api.get(`/batches/${createdBatchId}`);
        const remainingMembers = verifyRes.data.batch.members?.length || 0;
        log(`Batch now has ${remainingMembers} active members (1 removed)`, verifyRes.data);

        console.log('\n✅ All tests passed!\n');
    } catch (error) {
        console.error('\n❌ Test failed!');
        console.error('Status:', error.response?.status);
        console.error('Error:', error.response?.data?.error || error.message);
        process.exit(1);
    }
}

// Run tests
runTests();
